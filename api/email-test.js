// Vercel Serverless Function — /api/email-test
// Fires SAMPLE notification emails so you can confirm SendGrid delivery + the
// templates without needing real registrations. Behind the site password gate.
//
//   /api/email-test                 → sends ALL types to ADMIN_EMAIL
//   /api/email-test?type=roster     → just the "roster" one
//   /api/email-test?to=me@x.com     → send to a specific inbox instead of ADMIN_EMAIL
//
// types: confirm | paid | order | insurance | roster | all
// Env: SENDGRID_API_KEY, MAIL_FROM, ADMIN_EMAIL (see api/_email.js).

import { sendMail, emailConfigured, adminAddress } from './_email.js';
import { buildMessage, buildCoachMessage, buildInsuranceMessage, buildMerchMessage, buildRosterMessage } from './notify-registration.js';

const SAMPLE = {
  team_name: 'Brownwood Bandits', form_id: 'season-baseball',
  form_title: '2026 Fall/Spring Baseball Team Registration',
  sport: 'baseball', division: 'Triple-A', age_class: '12U', town: 'Brownwood, TX',
  coach_name: 'Jake Henderson', coach_phone: '325-555-2841', coach_email: 'jake.henderson@example.com',
  entry_no: 621900, amount_cents: 22500, card_last4: '4242', clover_order_id: 'ORD-77123',
  team_code: 'BAND7', created_at: '2026-06-12T11:11:00', player_count: 12,
};
const INSURANCE_SAMPLE = Object.assign({}, SAMPLE, {
  form_id: 'team-insurance', form_title: '2026 STS Team Insurance', amount_cents: 5000, age_class: '', division: '',
});
const MERCH_SAMPLE = Object.assign({}, SAMPLE, {
  form_id: 'gamepro-baseballs', form_title: 'STS GamePro Baseballs', amount_cents: 6000,
  clover_order_id: 'ORD-77555', paid_at: '2026-06-12T12:30:00', age_class: '', division: '',
});
const ROSTER_SAMPLE = {
  team_name: 'Crowley Cobras', coach_name: 'Thomas Rosales', coach_email: 'thomas_r0214@example.com',
  age_class: '16U', sport: 'baseball', updated_at: '2026-06-12T18:30:00',
  added: ['Joe Sessums', 'Jayden Castillon', 'Jorge Chavez', 'Miguel Sandoval', 'Martin Morales', 'Carlos Villarreal'],
  removed: ['Brandon Teal'],
};

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://x');
  const to = url.searchParams.get('to') || adminAddress();
  const type = (url.searchParams.get('type') || 'all').toLowerCase();

  if (!emailConfigured()) return res.status(200).json({ ok: false, reason: 'SENDGRID_API_KEY not set in Vercel' });
  if (!to) return res.status(200).json({ ok: false, reason: 'No recipient — set ADMIN_EMAIL or pass ?to=you@email.com' });

  // confirm=coach code · paid=admin alert · order=merch · insurance=carrier req · roster=change notice
  const types = type === 'all' ? ['confirm', 'paid', 'order', 'insurance', 'roster'] : [type];
  const results = [];
  for (const t of types) {
    const data = t === 'insurance' ? INSURANCE_SAMPLE : t === 'order' ? MERCH_SAMPLE : t === 'roster' ? ROSTER_SAMPLE : SAMPLE;
    const msg = t === 'confirm' ? buildCoachMessage(data)
      : t === 'insurance' ? buildInsuranceMessage(data)
      : t === 'order' ? buildMerchMessage(data)
      : t === 'roster' ? buildRosterMessage(data)
      : buildMessage(t, data);
    try {
      await sendMail({ to, subject: '[TEST] ' + msg.subject, html: msg.html, text: msg.text });
      results.push({ type: t, sent: true, subject: '[TEST] ' + msg.subject });
    } catch (e) {
      results.push({ type: t, sent: false, error: String(e.message || e) });
    }
  }
  return res.status(200).json({ ok: results.every((r) => r.sent), to, results });
}
