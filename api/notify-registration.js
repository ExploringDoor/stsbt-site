// Vercel Serverless Function — /api/notify-registration.js
// Two kinds of mail:
//   • ADMIN alerts (to ADMIN_EMAIL) — a team registers / pays / buys insurance /
//     updates a roster.   events: 'submitted' | 'paid' | 'insurance' | 'roster'
//   • COACH confirmation (to the coach's email) — their team code + manage link.
//     events: 'confirm', and auto-sent alongside 'submitted'/'paid'.
//
// Env: SENDGRID_API_KEY, MAIL_FROM, ADMIN_EMAIL  (see api/_email.js).
// If email isn't configured it returns 200 skipped=true so nothing else breaks.

import { sendMail, emailConfigured, adminAddress, esc, shell } from './_email.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!emailConfigured()) return res.status(200).json({ skipped: true, reason: 'SENDGRID_API_KEY not set' });

  const { event = 'submitted', registration = {} } = req.body || {};
  const r = registration;

  // COACH-only confirmation
  if (event === 'confirm') {
    const to = r.coach_email;
    if (!to) return res.status(200).json({ skipped: true, reason: 'no coach_email' });
    const m = buildCoachMessage(r);
    try { await sendMail({ to, subject: m.subject, html: m.html, text: m.text }); return res.status(200).json({ ok: true }); }
    catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
  }

  // ADMIN alert
  const to = adminAddress();
  if (!to) return res.status(200).json({ skipped: true, reason: 'ADMIN_EMAIL not set' });
  const msg = buildMessage(event, r);
  try {
    await sendMail({ to, subject: msg.subject, html: msg.html, text: msg.text, replyTo: r.coach_email || undefined });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }

  // Best-effort coach confirmation on a new registration / payment (never a product/roster).
  const isInsurance = /insurance/i.test(r.form_title || r.form_id || '');
  if ((event === 'submitted' || event === 'paid') && r.coach_email && r.team_code && !isInsurance) {
    try { const cm = buildCoachMessage(r); await sendMail({ to: r.coach_email, subject: cm.subject, html: cm.html, text: cm.text }); } catch (e) { /* non-fatal */ }
  }
  return res.status(200).json({ ok: true });
}

function money(c) { return c != null && c !== '' ? '$' + (Number(c) / 100).toFixed(2) : ''; }
function slugify(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function fmtWhen(v) {
  if (!v) return '';
  const d = new Date(v); if (isNaN(d)) return String(v);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function rowList(rows) {
  return rows.map((x) => `<div><span style="color:#64748b">${esc(x[0])}:</span> <b>${esc(x[1])}</b></div>`).join('');
}

// ── ADMIN message ────────────────────────────────────────────────────
export function buildMessage(event, r) {
  const site = process.env.SITE_URL || 'https://ststournaments.com';
  const team = r.team_name || 'Team';
  const isInsurance = event === 'insurance' || /insurance/i.test(r.form_title || r.form_id || '');
  const submitted = fmtWhen(r.created_at || r.submitted_at || r.paid_at);

  if (event === 'roster') {
    const n = r.player_count != null ? r.player_count : '';
    const rows = [['Team', team], ['Players on roster', n], ['Coach', r.coach_name || ''], ['Submitted', submitted]].filter((x) => x[1] !== '' && x[1] != null);
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
    ['Date submitted', submitted],
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

// ── COACH confirmation (their team code + manage link) ───────────────
export function buildCoachMessage(r) {
  const site = process.env.SITE_URL || 'https://ststournaments.com';
  const team = r.team_name || 'your team';
  const code = r.team_code || '';
  const slug = slugify(r.team_name);
  const manage = `${site}/roster-edit.html?id=${encodeURIComponent(slug)}${code ? `&code=${encodeURIComponent(code)}` : ''}`;
  const codeBox = code
    ? `<div style="background:#00224f;border-radius:10px;padding:16px 18px;margin:10px 0 14px;text-align:center">
         <div style="color:rgba(255,255,255,.7);font-size:11px;letter-spacing:.12em;text-transform:uppercase">Your Team Code</div>
         <div style="color:#f6c453;font-size:30px;font-weight:800;letter-spacing:.18em;font-family:Oswald,system-ui,sans-serif">${esc(code)}</div>
       </div>` : '';
  const body =
    `<div>Thanks for registering <b>${esc(team)}</b>${r.form_title ? ` for <b>${esc(r.form_title)}</b>` : ''}.</div>` +
    codeBox +
    `<div>Your <b>team code</b> is how you sign in to add your roster, manage your team, and upload insurance — keep it somewhere safe.</div>` +
    `<div style="margin-top:10px;color:#64748b;font-size:13px">Your team page and roster open as soon as your registration is confirmed.</div>`;
  return {
    subject: `You're registered — ${team} · Small Town Select`,
    text: `Thanks for registering ${team}.\nYour team code: ${code}\nManage your team: ${manage}`,
    html: shell('submitted', "You're Registered!", body, manage, 'Manage Your Team'),
  };
}
