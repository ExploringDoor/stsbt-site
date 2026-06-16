// Vercel Serverless Function — /api/cardconnect-charge
// CardConnect (CardPointe) Gateway API charge for the embedded iFrame Tokenizer flow.
// The browser tokenizes the card inside CardConnect's hosted iframe (the PAN never
// touches us), then posts the TOKEN here. We authorize+capture via the Gateway API,
// then mark the registration paid, auto-create the team page, and email Keith.
//
// Env (Vercel, never in code):
//   CARDCONNECT_SITE      e.g. quickscores-uat  (prod: the production <site>)
//   CARDCONNECT_MERCHID   e.g. 810000003251
//   CARDCONNECT_API_USER  REST API username
//   CARDCONNECT_API_PASS  REST API password
//   CARDCONNECT_CURRENCY  default USD
//   (+ FIREBASE_* / FB_ADMIN_* for the Firestore writes, SENDGRID_API_KEY / ADMIN_EMAIL for email)

import { fsGet, fsPatch, fsCreate, fsQuery, fbConfigured, fbAdminConfigured } from './_firestore.js';
import { publicRoster } from './_age.js';
import { sendMail, emailConfigured, adminAddress } from './_email.js';
import { buildMessage, buildMerchMessage, buildInsuranceMessage } from './notify-registration.js';

const SITE = process.env.CARDCONNECT_SITE || '';
const MID = process.env.CARDCONNECT_MERCHID || '';
const API_USER = process.env.CARDCONNECT_API_USER || '';
const API_PASS = process.env.CARDCONNECT_API_PASS || '';
const CURRENCY = process.env.CARDCONNECT_CURRENCY || 'USD';

function ccConfigured() { return !!(SITE && MID && API_USER && API_PASS); }
function authHeader() { return 'Basic ' + Buffer.from(API_USER + ':' + API_PASS).toString('base64'); }
function slugify(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

// Authoritative price — never trust the amount the browser computed.
function expectedCents(form, reg) {
  const conv = (form && form.convenience_fee_cents) || 0;
  const opts = (form && form.price_options) || [];
  if (opts.length > 1) {
    const ac = String(reg.age_class || '');
    const o = opts.find(x => x.label === ac) || opts.find(x => ac && ac.indexOf(x.label) === 0);
    return conv + (o ? o.cents : 0);
  }
  return conv + ((opts[0] && opts[0].cents) || 0);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ccConfigured()) return res.status(501).json({ error: 'payments_not_configured' });
  if (!fbConfigured() || !fbAdminConfigured()) return res.status(501).json({ error: 'admin_auth_not_configured' });

  const b = req.body || {};
  const { regId, token, expiry } = b;
  if (!regId || !token) return res.status(400).json({ error: 'Missing payment fields' });

  try {
    const reg = await fsGet(`registrations/${regId}`);
    if (!reg) return res.status(404).json({ error: 'Registration not found' });
    if (reg.payment_status === 'paid') return res.status(200).json({ ok: true, idempotent: true });

    const form = reg.form_id ? await fsGet(`forms/${reg.form_id}`) : null;
    const cents = expectedCents(form, reg) || reg.amount_cents || 0;
    if (cents <= 0) return res.status(400).json({ error: 'Nothing to charge for this entry.' });
    const amount = (cents / 100).toFixed(2);

    // ── authorize + capture via the Gateway API ──────────────────────────────
    const charge = {
      merchid: MID, account: String(token), amount, currency: CURRENCY,
      ecomind: 'E', capture: 'Y',                       // card-not-present, settle now
      ...(expiry ? { expiry: String(expiry) } : {}),
      ...(b.cvv ? { cvv2: String(b.cvv) } : {}),
      ...(b.name ? { name: String(b.name).slice(0, 60) } : {}),
      ...(b.address ? { address: String(b.address).slice(0, 60) } : {}),
      ...(b.region ? { region: String(b.region).slice(0, 20) } : {}),
      ...(b.postal ? { postal: String(b.postal).slice(0, 10) } : {}),
      orderid: String(reg.entry_no || reg.id || '').slice(0, 19),
    };
    let auth;
    try {
      const r = await fetch(`https://${SITE}.cardconnect.com/cardconnect/rest/auth`, {
        method: 'PUT',
        headers: { Authorization: authHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(charge),
      });
      auth = await r.json();
    } catch (e) {
      return res.status(502).json({ error: 'Could not reach the payment gateway. Please try again.' });
    }

    // respstat: A = approved, B = retry, C = declined
    if (!auth || auth.respstat !== 'A') {
      return res.status(402).json({ ok: false, declined: true, error: (auth && auth.resptext) || 'Card declined', respstat: auth && auth.respstat });
    }

    const last4 = String(auth.token || token).slice(-4);
    const retref = auth.retref || '';

    // ── mark paid + post-payment (mirrors the old webhook, but synchronous) ───
    await fsPatch(`registrations/${reg.id}`, {
      payment_status: 'paid', amount_cents: cents, card_last4: last4,
      cc_retref: retref, cc_authcode: auth.authcode || '', paid_at: new Date().toISOString(),
    });

    const formType = form ? form.type : (/insurance|gamepro|ball|merch/i.test(reg.form_id || '') ? 'product' : 'season');
    const isInsurance = /insurance/i.test(reg.form_id || (form && form.title) || reg.form_title || '');

    if (isInsurance) {
      const tslug = slugify(reg.team_name) || `team-${reg.id}`;
      try {
        await fsPatch(`team_insurance/${tslug}`, {
          team_id: tslug, team_name: reg.team_name || '', status: 'approved', source: 'purchased',
          carrier: 'Small Town Select Group Policy', policy_no: '',
          coverage_start: '2026-08-01', coverage_end: '2027-07-31',
          submitted_at: new Date().toISOString(), reviewed_at: new Date().toISOString(), note: '',
        });
        await fsPatch(`teams/${tslug}`, { insurance_status: 'approved' });
      } catch (e) { /* non-fatal */ }
    }

    // season/tournament → auto-create the public team page (idempotent)
    if (!reg.team_id && (formType === 'season' || formType === 'tournament')) {
      let slug;
      const mine = await fsQuery('teams', 'reg_id', 'EQUAL', reg.id);
      if (mine && mine.length) { slug = mine[0].id || mine[0].slug; }
      else {
        const base = slugify(reg.team_name) || `team-${reg.id}`;
        slug = base;
        for (let i = 2; await fsGet(`teams/${slug}`); i++) slug = `${base}-${i}`;
        await fsCreate('teams', {
          name: reg.team_name || 'Team', slug, sport: reg.sport || '', division: reg.division || '',
          age_class: reg.age_class || '', town: reg.town || '', reg_id: reg.id, team_code: reg.team_code || '',
          coach_name: reg.coach_name || '', roster: publicRoster(reg.roster),
          tournaments: reg.form_title ? [reg.form_title] : [], live: true, status: 'active', w: 0, l: 0,
          created_at: new Date().toISOString(),
        }, slug);
        if (Array.isArray(reg.roster) && reg.roster.some(p => p && p.dob)) {
          await fsPatch(`team_rosters/${slug}`, { team_id: slug, roster: reg.roster });
        }
      }
      await fsPatch(`registrations/${reg.id}`, { team_id: slug });
    }

    // email Keith directly (the public site is behind the password gate, so a
    // self-HTTP call to /api/notify-registration would 401).
    try {
      const to = adminAddress();
      if (emailConfigured() && to) {
        const data = { ...reg, card_last4: last4, amount_cents: cents, paid_at: new Date().toISOString() };
        const msg = isInsurance ? buildInsuranceMessage(data)
          : (formType === 'product') ? buildMerchMessage(data)
          : buildMessage('paid', data);
        await sendMail({ to, subject: msg.subject, html: msg.html, text: msg.text, replyTo: reg.coach_email || undefined });
      }
    } catch (e) { /* non-fatal */ }

    return res.status(200).json({ ok: true, retref, last4 });
  } catch (e) {
    console.error('cardconnect-charge exception', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
