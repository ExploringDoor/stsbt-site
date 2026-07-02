// Vercel Serverless Function — /api/email-test
// Fires SAMPLE notification emails so you can confirm SendGrid delivery + the
// templates without needing real registrations. Behind the site password gate.
//
//   /api/email-test                 → sends ALL types to ADMIN_EMAIL
//   /api/email-test?type=roster     → just the "roster" one
//   /api/email-test?to=me@x.com     → send to a specific inbox instead of ADMIN_EMAIL
//
// types: confirm | paid | order | insurance | roster | approval | recover | all
// Env: SENDGRID_API_KEY, MAIL_FROM, ADMIN_EMAIL (see api/_email.js).

import { sendMail, emailConfigured, adminAddress } from './_email.js';
import { buildMessage, buildCoachMessage, buildInsuranceMessage, buildMerchMessage, buildRosterMessage, buildApprovalMessage, buildCodeRecoveryMessage } from './notify-registration.js';

const SAMPLE = {
  team_name: 'Brownwood Bandits', form_id: 'season-baseball',
  form_title: 'Fall 2026/Spring 2027 Baseball Team Registration',
  sport: 'baseball', division: 'Triple-A', age_class: '12U', town: 'Brownwood, TX',
  coach_name: 'Jake Henderson', coach_phone: '325-555-2841', coach_email: 'jake.henderson@example.com',
  entry_no: 621900, amount_cents: 22500, card_last4: '4242', cc_retref: '180050583234',
  team_code: 'BAND7', created_at: '2026-06-12T11:11:00', player_count: 12,
};
const INSURANCE_SAMPLE = Object.assign({}, SAMPLE, {
  form_id: 'team-insurance', form_title: '2027 STS Team Insurance', amount_cents: 5000, age_class: '', division: '',
});
const MERCH_SAMPLE = Object.assign({}, SAMPLE, {
  form_id: 'gamepro-baseballs', form_title: 'STS GamePro Baseballs', amount_cents: 6000,
  cc_retref: '180051583240', paid_at: '2026-06-12T12:30:00', age_class: '', division: '',
  ship_address: 'Jake Henderson\n1420 Ranch Road\nBrownwood, TX 76801',
});
const ROSTER_SAMPLE = {
  team_name: 'Crowley Cobras', coach_name: 'Thomas Rosales', coach_email: 'thomas_r0214@example.com',
  age_class: '16U', sport: 'baseball', updated_at: '2026-06-12T18:30:00',
  added: ['Joe Sessums', 'Jayden Castillon', 'Jorge Chavez', 'Miguel Sandoval', 'Martin Morales', 'Carlos Villarreal'],
  removed: ['Brandon Teal'],
};
const APPROVAL_SAMPLE = {
  player_name: 'Jordan Mathis', player_dob: '2018-03-04', team_name: 'Blacksox · 7U', coach_name: 'Tanir Horton',
  guardian_email: '', season: '2026', link: 'https://ststournaments.com/approve.html?team=blacksox&t=SAMPLE',
};

export default async function handler(req, res) {
  // Debug tool: only reachable while the site is still password-gated in preview.
  // When SITE_GATE is removed at launch this self-disables, so it can never become
  // a public open email relay (send-to-anyone). Delete this file entirely if unused.
  if (!process.env.SITE_GATE) return res.status(404).json({ error: 'not_found' });
  const url = new URL(req.url, 'https://x');
  const to = url.searchParams.get('to') || adminAddress();
  const type = (url.searchParams.get('type') || 'all').toLowerCase();

  if (!emailConfigured()) return res.status(200).json({ ok: false, reason: 'SENDGRID_API_KEY not set in Vercel' });
  if (!to) return res.status(200).json({ ok: false, reason: 'No recipient — set ADMIN_EMAIL or pass ?to=you@email.com' });

  // confirm=coach code · paid=admin alert · order=merch · insurance=carrier req · roster=change notice
  const types = type === 'all' ? ['confirm', 'paid', 'order', 'insurance', 'roster', 'approval', 'recover'] : [type];
  const results = [];
  for (const t of types) {
    const data = t === 'insurance' ? INSURANCE_SAMPLE : t === 'order' ? MERCH_SAMPLE : t === 'roster' ? ROSTER_SAMPLE : t === 'approval' ? Object.assign({}, APPROVAL_SAMPLE, { guardian_email: to }) : SAMPLE;
    const msg = t === 'confirm' ? buildCoachMessage(data)
      : t === 'insurance' ? buildInsuranceMessage(data)
      : t === 'order' ? buildMerchMessage(data)
      : t === 'roster' ? buildRosterMessage(data)
      : t === 'approval' ? buildApprovalMessage(data)
      : t === 'recover' ? buildCodeRecoveryMessage([SAMPLE, Object.assign({}, SAMPLE, { team_name: 'Brownwood Bandits 10U', age_class: '10U', team_code: 'BAND0' })])
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
