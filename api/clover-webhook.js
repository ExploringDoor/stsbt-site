// Vercel Serverless Function — /api/clover-webhook.js
// Clover Hosted Checkout webhook — the SOURCE OF TRUTH for "paid".
// On an approved payment it: verifies the signature, fetches the card last-4
// + Clover order id, marks the registration paid, auto-creates the team page,
// and emails Keith. Idempotent (Clover may retry).
//
// Configure in Clover Dashboard → Settings → Ecommerce → Hosted Checkout:
//   webhook URL = https://<your-domain>/api/clover-webhook  (+ Generate signing secret)
//
// Env: CLOVER_ENV, CLOVER_MERCHANT_ID, CLOVER_PRIVATE_TOKEN, CLOVER_WEBHOOK_SECRET,
//      SITE_URL, FIREBASE_PROJECT_ID, FIREBASE_API_KEY

import crypto from 'node:crypto';
import { fsQuery, fsGet, fsPatch, fsCreate, fbConfigured } from './_firestore.js';
import { publicRoster } from './_age.js';

// NOTE: `export const config = { api: { bodyParser: false } }` is Next.js syntax and is
// IGNORED by a plain Vercel Node function. So we read the raw body defensively below.
// HMAC must run on the EXACT bytes Clover signed — validate against a Clover SANDBOX
// webhook before flipping CLOVER_ENV=production (the object-fallback may not byte-match).
function readRaw(req) {
  return new Promise((resolve) => { let d = ''; try { req.setEncoding('utf8'); } catch (e) {} req.on('data', c => d += c); req.on('end', () => resolve(d)); req.on('error', () => resolve('')); });
}
async function getRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const streamed = await readRaw(req);
  if (streamed) return streamed;
  return (req.body && typeof req.body === 'object') ? JSON.stringify(req.body) : '';
}
function slugify(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const SECRET = process.env.CLOVER_WEBHOOK_SECRET;
  const MID = process.env.CLOVER_MERCHANT_ID;
  const TOKEN = process.env.CLOVER_PRIVATE_TOKEN;
  const ENV = process.env.CLOVER_ENV || 'sandbox';
  const base = ENV === 'production' ? 'https://api.clover.com' : 'https://apisandbox.dev.clover.com';

  // Fail closed in production: never accept an unsigned webhook for real money.
  if (ENV === 'production' && !SECRET) {
    console.error('clover-webhook: CLOVER_WEBHOOK_SECRET missing in production — refusing.');
    return res.status(500).json({ error: 'webhook secret not configured' });
  }

  const raw = await getRawBody(req);

  // ── verify signature: header  t=<ts>,v1=<hash>  →  HMAC-SHA256(secret, ts + "." + raw) ──
  if (SECRET) {
    try {
      const sig = String(req.headers['clover-signature'] || '');
      const parts = Object.fromEntries(sig.split(',').map(p => p.split('=')));
      const expected = crypto.createHmac('sha256', SECRET).update(`${parts.t}.${raw}`).digest('hex');
      if (!parts.v1 || expected !== parts.v1) return res.status(401).json({ error: 'bad signature' });
    } catch (e) { return res.status(401).json({ error: 'signature error' }); }
  }

  let payload = {};
  try { payload = JSON.parse(raw || '{}'); } catch (e) { return res.status(400).json({ error: 'bad json' }); }

  // Clover sends: Status, Type, Id (paymentId), Data (checkout session id)
  const status = payload.Status || payload.status;
  const paymentId = payload.Id || payload.id;
  const sessionId = payload.Data || payload.data;
  if (status !== 'APPROVED') return res.status(200).json({ ok: true, ignored: status });
  if (!fbConfigured()) return res.status(200).json({ ok: true, note: 'firestore not configured' });

  try {
    const matches = await fsQuery('registrations', 'clover_session_id', 'EQUAL', sessionId);
    const reg = matches[0];
    if (!reg) return res.status(200).json({ ok: true, note: 'no matching registration' });
    if (reg.payment_status === 'paid') return res.status(200).json({ ok: true, idempotent: true });

    // fetch last-4 + order id
    let last4 = '', orderId = '';
    try {
      const pr = await fetch(`${base}/v3/merchants/${MID}/payments/${paymentId}?expand=cardTransaction`, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
      if (pr.ok) { const p = await pr.json(); last4 = (p.cardTransaction && p.cardTransaction.last4) || ''; orderId = (p.order && p.order.id) || ''; }
    } catch (e) { /* non-fatal */ }

    await fsPatch(`registrations/${reg.id}`, {
      payment_status: 'paid', card_last4: last4, clover_payment_id: paymentId,
      clover_order_id: orderId, paid_at: new Date().toISOString(),
    });

    // Only SEASON / TOURNAMENT registrations create a team page. Products
    // (insurance, merch) must NOT spawn a phantom team.
    const form = reg.form_id ? await fsGet(`forms/${reg.form_id}`) : null;
    const formType = form ? form.type : (/insurance|gamepro|ball|merch/i.test(reg.form_id || '') ? 'product' : 'season');
    const isInsurance = /insurance/i.test(reg.form_id || (form && form.title) || (reg.form_title || ''));

    // Insurance bought through the site → auto-approve for the matching team.
    if (isInsurance) {
      const tslug = slugify(reg.team_name) || `team-${reg.id}`;
      try {
        await fsPatch(`team_insurance/${tslug}`, {
          team_id: tslug, team_name: reg.team_name || '', status: 'approved', source: 'purchased',
          carrier: 'Small Town Select Group Policy', policy_no: '',
          coverage_start: '2025-08-01', coverage_end: '2026-07-31',
          submitted_at: new Date().toISOString(), reviewed_at: new Date().toISOString(), note: '',
        });
      } catch (e) { /* non-fatal */ }
    }

    // auto-create the team page if it doesn't exist yet (season/tournament only)
    if (!reg.team_id && (formType === 'season' || formType === 'tournament')) {
      let slug;
      // reuse an existing team for THIS registration (idempotent on webhook retries)
      const mine = await fsQuery('teams', 'reg_id', 'EQUAL', reg.id);
      if (mine && mine.length) {
        slug = mine[0].id || mine[0].slug;
      } else {
        // find a free slug so a same-named team from a DIFFERENT reg isn't clobbered
        const base = slugify(reg.team_name) || `team-${reg.id}`;
        slug = base;
        for (let i = 2; await fsGet(`teams/${slug}`); i++) slug = `${base}-${i}`;
        await fsCreate('teams', {
          name: reg.team_name || 'Team', slug, sport: reg.sport || '', division: reg.division || '',
          age_class: reg.age_class || '', town: reg.town || '', reg_id: reg.id, team_code: reg.team_code || '',
          coach_name: reg.coach_name || '',
          // PUBLIC doc: dob-free roster only (usually empty at signup — coaches add
          // players later via roster-save, which does the same dob-free split).
          roster: publicRoster(reg.roster), tournaments: reg.form_title ? [reg.form_title] : [], live: true,
          status: 'active', w: 0, l: 0, created_at: new Date().toISOString(),
        }, slug);
        // If the reg somehow carried birthdates, keep them in the gated collection.
        if (Array.isArray(reg.roster) && reg.roster.some(p => p && p.dob)) {
          await fsPatch(`team_rosters/${slug}`, { team_id: slug, roster: reg.roster });
        }
      }
      await fsPatch(`registrations/${reg.id}`, { team_id: slug });
    }

    // notify Keith (best-effort). Insurance is detected downstream; a non-insurance
    // PRODUCT (e.g. GamePro Baseballs) is a merchandise 'order', everything else 'paid'.
    const notifyEvent = (formType === 'product' && !isInsurance) ? 'order' : 'paid';
    try {
      await fetch(`${process.env.SITE_URL || ''}/api/notify-registration`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: notifyEvent, registration: { ...reg, card_last4: last4, clover_order_id: orderId } }),
      });
    } catch (e) { /* non-fatal */ }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('clover-webhook exception', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
