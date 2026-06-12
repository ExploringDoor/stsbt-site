// Vercel Serverless Function — /api/create-checkout.js
// Creates a Clover Hosted Checkout session for a registration and returns the
// redirect URL. The browser then sends the customer to Clover to pay.
//
// IMPORTANT: amount is recomputed SERVER-SIDE from the form's price options —
// never trust the client-sent amount.
//
// Env vars (Vercel):
//   CLOVER_ENV            'sandbox' | 'production'
//   CLOVER_MERCHANT_ID    Keith's Clover Merchant ID (UUID)
//   CLOVER_PRIVATE_TOKEN  Ecommerce private API token (2FA must be enabled)
//   SITE_URL              e.g. https://smalltownselect.com  (for redirect URLs)
//   FIREBASE_PROJECT_ID / FIREBASE_API_KEY  (Firestore REST)
//
// Processor CONFIRMED: Clover (clover.com Hosted Checkout). Stripe stays the
// documented fallback only if Clover onboarding stalls the launch.

import { fsGet, fsPatch, fbConfigured } from './_firestore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const MID = process.env.CLOVER_MERCHANT_ID;
  const TOKEN = process.env.CLOVER_PRIVATE_TOKEN;
  const ENV = process.env.CLOVER_ENV || 'sandbox';
  const SITE = process.env.SITE_URL || `https://${req.headers.host}`;

  if (!MID || !TOKEN || !fbConfigured()) {
    // Not wired yet — client falls back to a "payment pending" confirmation.
    return res.status(501).json({ error: 'payment_not_configured' });
  }

  const { regId } = req.body || {};
  if (!regId) return res.status(400).json({ error: 'Missing regId' });

  try {
    const reg = await fsGet(`registrations/${regId}`);
    if (!reg) return res.status(404).json({ error: 'Registration not found' });

    // Recompute amount from the authoritative form
    let amountCents = 0, itemName = reg.form_title || 'Tournament Registration';
    const form = reg.form_id ? await fsGet(`forms/${reg.form_id}`) : null;
    if (form) {
      const conv = Number(form.convenience_fee_cents || 0);
      const opts = form.price_options || [];
      const match = opts.find(o => o.label === reg.age_class) || (opts.length === 1 ? opts[0] : null);
      amountCents = conv + (match ? Number(match.cents || 0) : Number(reg.amount_cents || 0));
      itemName = `${form.title}${reg.age_class ? ' — ' + reg.age_class : ''}`;
    } else {
      amountCents = Number(reg.amount_cents || 0);
    }
    if (amountCents <= 0) return res.status(400).json({ error: 'Nothing to charge' });

    const base = ENV === 'production' ? 'https://api.clover.com' : 'https://apisandbox.dev.clover.com';
    const body = {
      customer: { email: reg.coach_email || '', firstName: (reg.coach_name || '').split(' ')[0] || '', lastName: (reg.coach_name || '').split(' ').slice(1).join(' ') || '' },
      shoppingCart: { lineItems: [{ name: itemName.slice(0, 100), price: amountCents, unitQty: 1 }] },
      redirectUrls: {
        success: `${SITE}/thanks.html?reg=${encodeURIComponent(regId)}&code=${encodeURIComponent(reg.team_code || '')}&team=${encodeURIComponent(reg.team_name || '')}&status=pending&session={CHECKOUT_SESSION_ID}`,
        failure: `${SITE}/register.html?form=${encodeURIComponent(reg.form_id || '')}&pay=failed`,
      },
    };

    const r = await fetch(`${base}/invoicingcheckoutservice/v1/checkouts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'X-Clover-Merchant-Id': MID, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok || !data.href) { console.error('Clover checkout error', data); return res.status(502).json({ error: 'Clover checkout failed', detail: data }); }

    await fsPatch(`registrations/${regId}`, { clover_session_id: data.checkoutSessionId || '', payment_status: 'pending', amount_cents: amountCents });
    return res.status(200).json({ href: data.href, sessionId: data.checkoutSessionId });
  } catch (e) {
    console.error('create-checkout exception', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
