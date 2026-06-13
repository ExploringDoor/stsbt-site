// Vercel Serverless Function — /api/notify-registration.js
// Emails the admin (Keith) when things happen: a team registers, a payment
// clears, insurance is purchased, or a coach saves their roster.
//
// Env: SENDGRID_API_KEY, MAIL_FROM, ADMIN_EMAIL  (see api/_email.js).
// If email isn't configured it returns 200 skipped=true so nothing else breaks.
//
// POST body: { event, registration } — event is one of:
//   'submitted' | 'paid' | 'insurance' | 'roster'
// (for 'roster', registration carries { team_name, player_count }).

import { sendMail, emailConfigured, adminAddress, esc, shell } from './_email.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const to = adminAddress();
  if (!emailConfigured() || !to) return res.status(200).json({ skipped: true, reason: 'Email not configured (need SENDGRID_API_KEY + ADMIN_EMAIL)' });

  const { event = 'submitted', registration = {} } = req.body || {};
  const r = registration;
  const msg = buildMessage(event, r);

  try {
    await sendMail({ to, subject: msg.subject, html: msg.html, text: msg.text, replyTo: r.coach_email || undefined });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

function money(c) { return c != null && c !== '' ? '$' + (Number(c) / 100).toFixed(2) : ''; }

export function buildMessage(event, r) {
  const site = process.env.SITE_URL || 'https://ststournaments.com';
  const team = r.team_name || 'Team';
  const isInsurance = event === 'insurance' || /insurance/i.test(r.form_title || r.form_id || '');

  if (event === 'roster') {
    const n = r.player_count != null ? r.player_count : '';
    const rows = [['Team', team], ['Players on roster', n], ['Coach', r.coach_name || '']];
    return {
      subject: `STS: Roster updated — ${team}${n !== '' ? ' (' + n + ' players)' : ''}`,
      text: rows.map((x) => x[0] + ': ' + x[1]).join('\n'),
      html: shell('roster', 'Roster Updated', rowList(rows), `${site}/admin.html`, 'View in Admin'),
    };
  }

  const kind = isInsurance ? 'insurance' : event === 'paid' ? 'paid' : 'submitted';
  const title = isInsurance ? 'Insurance Purchased' : event === 'paid' ? 'Paid Registration' : 'New Registration';
  const rows = [
    ['Team', team],
    ['Form', r.form_title || r.form_id || ''],
    ['Sport / Division / Age', [r.sport, r.division, r.age_class].filter(Boolean).join(' · ')],
    ['Coach', [r.coach_name, r.coach_phone, r.coach_email].filter(Boolean).join('  ·  ')],
    ['Town', r.town || ''],
    ['Entry #', r.entry_no || ''],
    ['Amount', money(r.amount_cents)],
    event === 'paid' ? ['Card', r.card_last4 ? '•••• ' + r.card_last4 : ''] : null,
    event === 'paid' ? ['Clover order', r.clover_order_id || ''] : null,
  ].filter(Boolean).filter((x) => x[1] !== '' && x[1] != null);

  return {
    subject: `STS: ${isInsurance ? 'Insurance' : event === 'paid' ? 'PAID' : 'New'} — ${team}${r.age_class ? ' (' + r.age_class + ')' : ''}`,
    text: rows.map((x) => x[0] + ': ' + x[1]).join('\n'),
    html: shell(kind, title, rowList(rows), `${site}/admin.html`, 'Open Admin'),
  };
}

function rowList(rows) {
  return rows.map((x) => `<div><span style="color:#64748b">${esc(x[0])}:</span> <b>${esc(x[1])}</b></div>`).join('');
}
