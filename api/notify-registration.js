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
import { fsCreate, fbConfigured } from './_firestore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { event = 'paid', registration = {} } = req.body || {};
  const r = registration;

  // COACH-only confirmation (their team code) — email only, no activity log.
  if (event === 'confirm') {
    if (!emailConfigured() || !r.coach_email) return res.status(200).json({ skipped: true });
    const m = buildCoachMessage(r);
    try { await sendMail({ to: r.coach_email, subject: m.subject, html: m.html, text: m.text }); return res.status(200).json({ ok: true }); }
    catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
  }

  // PARENT/GUARDIAN approval link — emailed to the parent, no admin alert.
  if (event === 'approval') {
    if (!emailConfigured() || !r.guardian_email) return res.status(200).json({ skipped: true });
    const m = buildApprovalMessage(r);
    try { await sendMail({ to: r.guardian_email, subject: m.subject, html: m.html, text: m.text, replyTo: r.coach_email || undefined }); return res.status(200).json({ ok: true }); }
    catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
  }

  // Log every admin-facing event to the activity feed (best-effort, independent of email).
  try { await writeActivity(event, r); } catch (e) { /* non-fatal */ }

  // ADMIN alert — finalized entries only (paid / free-complete / order / roster).
  const to = adminAddress();
  if (!emailConfigured() || !to) return res.status(200).json({ ok: true, emailed: false });
  const isInsurance = event === 'insurance' || /insurance/i.test(r.form_title || r.form_id || '');
  const msg = isInsurance ? buildInsuranceMessage(r)
    : event === 'order' ? buildMerchMessage(r)
    : event === 'roster' ? buildRosterMessage(r)
    : buildMessage(event, r);
  try {
    await sendMail({ to, subject: msg.subject, html: msg.html, text: msg.text, replyTo: r.coach_email || undefined });
    return res.status(200).json({ ok: true, emailed: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

// Append one row to the admin activity feed.
async function writeActivity(event, r) {
  if (!fbConfigured()) return;
  const isInsurance = event === 'insurance' || /insurance/i.test(r.form_title || r.form_id || '');
  const type = event === 'roster' ? 'roster' : event === 'order' ? 'order' : isInsurance ? 'insurance' : (Number(r.amount_cents) ? 'payment' : 'registration');
  const team = r.team_name || '';
  let title, detail;
  if (type === 'roster') { const a = (r.added || []).length, d = (r.removed || []).length; title = `${team} roster updated`; detail = [a ? a + ' added' : '', d ? d + ' removed' : ''].filter(Boolean).join(', ') || 'saved'; }
  else if (type === 'insurance') { title = `Insurance purchased — ${team}`; detail = r.coach_name || ''; }
  else if (type === 'order') { title = `Order — ${r.form_title || 'Merchandise'}`; detail = `${team || r.coach_name || ''} · ${money(r.amount_cents)}`; }
  else if (type === 'payment') { title = `Paid registration — ${team}`; detail = [r.form_title, money(r.amount_cents)].filter(Boolean).join(' · '); }
  else { title = `New team registered — ${team}`; detail = r.form_title || ''; }
  await fsCreate('activity', { type, team_name: team, title, detail, actor: r.coach_name || '', at: new Date().toISOString() });
}

function money(c) { return c != null && c !== '' ? '$' + (Number(c) / 100).toFixed(2) : ''; }
function slugify(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
// A team's identity is NAME + AGE DIVISION, so its page slug must include the age
// (matches teamSlug() in cardconnect-charge.js / sts-data.js). Using name only here
// produced dead roster links (team doc is "pirates-12u", link said "pirates").
function teamSlug(name, age) { return slugify(String(name || '') + (age ? ' ' + age : '')); }
function fmtDob(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return '';
  const d = new Date(String(v) + 'T12:00:00'); if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtWhen(v) {
  if (!v) return '';
  const d = new Date(v); if (isNaN(d)) return String(v);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function rowList(rows) {
  return rows.map((x) => `<div><span style="color:#64748b">${esc(x[0])}:</span> <b>${esc(x[1])}</b></div>`).join('');
}

// ── ADMIN alert (a finalized registration / payment) ─────────────────
export function buildMessage(event, r) {
  const site = process.env.SITE_URL || 'https://ststournaments.com';
  const team = r.team_name || 'Team';
  const submitted = fmtWhen(r.created_at || r.submitted_at || r.paid_at);
  const isFree = (r.payment_status === 'free') || !Number(r.amount_cents);   // $0 season reg

  const kind = isFree ? 'submitted' : 'paid';
  const title = isFree ? 'New Team Registered' : 'Paid Registration';
  const rows = [
    ['Team', team],
    ['Date submitted', submitted],
    ['Form', r.form_title || r.form_id || ''],
    ['Sport / Division / Age', [r.sport, r.division, r.age_class].filter(Boolean).join(' · ')],
    ['Coach', [r.coach_name, r.coach_phone, r.coach_email].filter(Boolean).join('  ·  ')],
    ['Town', r.town || ''],
    ['Entry #', r.entry_no || ''],
    ['Amount', isFree ? 'Free' : money(r.amount_cents)],
    !isFree ? ['Card', r.card_last4 ? '•••• ' + r.card_last4 : ''] : null,
    !isFree ? ['CC Ref', r.cc_retref || r.clover_order_id || ''] : null,
  ].filter(Boolean).filter((x) => x[1] !== '' && x[1] != null);

  return {
    subject: `STS: ${isFree ? 'Registered' : 'PAID'} — ${team}${r.age_class ? ' (' + r.age_class + ')' : ''}`,
    text: rows.map((x) => x[0] + ': ' + x[1]).join('\n'),
    html: shell(kind, title, rowList(rows), `${site}/admin.html`, 'Open Admin'),
  };
}

// ── INSURANCE — carrier-ready request (Keith just forwards this) ──────
export function buildInsuranceMessage(r) {
  const admin = process.env.ADMIN_EMAIL || '';
  const team = r.team_name || 'a team';
  const rows = [
    ['Team', team],
    ['Coach', r.coach_name || ''],
    ['Coach email', r.coach_email || ''],
    ['Coach phone', r.coach_phone || ''],
    ['Town', r.town || ''],
    ['Sport / Division / Age', [r.sport, r.division, r.age_class].filter(Boolean).join(' · ')],
    ['Players', r.player_count != null ? r.player_count : ''],
    ['Coverage period', 'Aug 1, 2026 – Jul 31, 2027 (Fall 2026/Spring 2027 season)'],
    ['Purchased', fmtWhen(r.paid_at || r.created_at)],
  ].filter((x) => x[1] !== '' && x[1] != null);

  const intro = `<div>A team purchased team insurance through Small Town Select. Please issue a <b>Certificate of Insurance</b> for the team below, with <b>Small Town Select Tournaments</b> listed as additionally insured.</div>`;
  const send = `<div style="margin-top:14px;color:#334155">Please email the certificate to ${admin ? `<b>${esc(admin)}</b>` : 'Small Town Select'}${r.coach_email ? ` and the coach at <b>${esc(r.coach_email)}</b>` : ''}.</div>`;
  return {
    subject: `Certificate of Insurance Request — ${team} (Small Town Select)`,
    text:
      `A team purchased team insurance through Small Town Select. Please issue a Certificate of Insurance, with Small Town Select Tournaments listed as additionally insured.\n\n` +
      rows.map((x) => x[0] + ': ' + x[1]).join('\n') +
      `\n\nPlease email the certificate to ${admin}${r.coach_email ? ` and ${r.coach_email}` : ''}.`,
    html: shell('insurance', 'Certificate of Insurance Request', intro + `<div style="margin-top:12px">${rowList(rows)}</div>` + send, null, null),
  };
}

// ── MERCHANDISE order (GamePro Baseballs, etc.) ──────────────────────
export function buildMerchMessage(r) {
  const site = process.env.SITE_URL || 'https://ststournaments.com';
  const item = r.form_title || 'Merchandise';
  const buyer = r.team_name || r.coach_name || '';
  const rows = [
    ['Order', item],
    ['Buyer', buyer],
    ['Contact', [r.coach_name, r.coach_phone, r.coach_email].filter(Boolean).join('  ·  ')],
    ['Amount', money(r.amount_cents)],
    ['Card', r.card_last4 ? '•••• ' + r.card_last4 : ''],
    ['CC Ref', r.cc_retref || r.clover_order_id || ''],
    ['Date', fmtWhen(r.paid_at || r.created_at)],
  ].filter((x) => x[1] !== '' && x[1] != null);
  // Shipping address gets its own block (multi-line, preserved).
  const ship = String(r.ship_address || '').trim();
  const shipHtml = ship
    ? `<div style="margin-top:14px"><b>Ship to:</b></div><div style="white-space:pre-line;color:#334155">${esc(ship)}</div>`
    : `<div style="margin-top:14px;color:#bf0a30"><b>Ship to:</b> (no address on file)</div>`;
  return {
    subject: `STS: Order — ${item}${buyer ? ' (' + buyer + ')' : ''}`,
    text: rows.map((x) => x[0] + ': ' + x[1]).join('\n') + (ship ? '\n\nShip to:\n' + ship : '\n\nShip to: (no address on file)'),
    html: shell('paid', 'Merchandise Order', rowList(rows) + shipHtml, `${site}/admin.html`, 'Open Admin'),
  };
}

// ── ROSTER changed (what a coach added/removed + when) ───────────────
export function buildRosterMessage(r) {
  const site = process.env.SITE_URL || 'https://ststournaments.com';
  const team = r.team_name || 'team';
  const Sport = (r.sport || '').charAt(0).toUpperCase() + (r.sport || '').slice(1);
  const league = r.age_class
    ? `${r.age_class} (${r.form_title || 'Fall 2026/Spring 2027 ' + Sport + ' Team Registration'}${Sport ? ' - ' + Sport : ''})`
    : (r.form_title || '');
  const added = Array.isArray(r.added) ? r.added : [];
  const removed = Array.isArray(r.removed) ? r.removed : [];
  const when = fmtWhen(r.updated_at || r.created_at);

  let listsHtml = '', listsText = '';
  if (added.length) { listsHtml += `<div style="margin-top:14px"><b>Added:</b></div>` + added.map((n) => `<div>${esc(n)} added to roster</div>`).join(''); listsText += '\nAdded:\n' + added.map((n) => n + ' added to roster').join('\n'); }
  if (removed.length) { listsHtml += `<div style="margin-top:14px"><b>Removed:</b></div>` + removed.map((n) => `<div>${esc(n)} removed from roster</div>`).join(''); listsText += '\nRemoved:\n' + removed.map((n) => n + ' removed from roster').join('\n'); }
  if (!added.length && !removed.length) { listsHtml += `<div style="margin-top:14px;color:#64748b">Roster saved — no players added or removed.</div>`; }

  const head =
    `<div>The following team roster has been updated by coach <b>${esc(r.coach_name || '')}</b>${r.coach_email ? ` (${esc(r.coach_email)})` : ''}.</div>` +
    `<div style="margin-top:10px">Team: <b>${esc(team)}</b></div>` +
    `<div>League: <b>${esc(league)}</b></div>`;
  const ts = when ? `<div style="margin-top:14px;color:#64748b;font-size:13px">Changed ${esc(when)}</div>` : '';
  return {
    subject: `${team} team roster has been changed`,
    text: `The following team roster has been updated by coach ${r.coach_name || ''}${r.coach_email ? ` (${r.coach_email})` : ''}.\nTeam: ${team}\nLeague: ${league}${listsText}${when ? '\n\nChanged ' + when : ''}`,
    html: shell('roster', 'Team Roster Updated', head + listsHtml + ts, `${site}/admin.html`, 'View in Admin'),
  };
}

// ── COACH confirmation (their team code + manage link) ───────────────
export function buildCoachMessage(r) {
  const site = process.env.SITE_URL || 'https://ststournaments.com';
  const team = r.team_name || 'your team';
  const code = r.team_code || '';
  // age-aware slug (and prefer the authoritative team_id stamped on the reg at pay time)
  const slug = r.team_id || teamSlug(r.team_name, r.age_class);
  const manage = `${site}/roster-edit.html?id=${encodeURIComponent(slug)}${code ? `&code=${encodeURIComponent(code)}` : ''}`;
  const paid = !!(r.paid_at || r.card_last4 || r.payment_status === 'paid');
  const amt = Number(r.amount_cents);
  const receipt = paid
    ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 14px;margin:6px 0 14px;color:#065f46">
         <b>✓ Payment received</b>${amt ? ` — ${money(r.amount_cents)}` : ''}${r.card_last4 ? ` on card •••• ${esc(r.card_last4)}` : (r.paid_method ? ` (${esc(r.paid_method)})` : '')}.
       </div>` : '';
  const codeBox = code
    ? `<div style="background:#00224f;border-radius:10px;padding:16px 18px;margin:10px 0 14px;text-align:center">
         <div style="color:rgba(255,255,255,.7);font-size:11px;letter-spacing:.12em;text-transform:uppercase">Your Team Code</div>
         <div style="color:#f6c453;font-size:30px;font-weight:800;letter-spacing:.18em;font-family:Oswald,system-ui,sans-serif">${esc(code)}</div>
       </div>` : '';
  const body =
    `<div>Thanks for registering <b>${esc(team)}</b>${r.form_title ? ` for <b>${esc(r.form_title)}</b>` : ''}.</div>` +
    receipt + codeBox +
    `<div>Your <b>team code</b> is how you sign in to add your roster, manage your team, and upload insurance — keep it somewhere safe.</div>` +
    `<div style="margin-top:10px;color:#64748b;font-size:13px">${paid ? 'Your team page and roster are ready now — tap below to add your players.' : 'Your team page and roster open as soon as your registration is confirmed.'}</div>`;
  return {
    subject: paid ? `Payment received — ${team} · Small Town Select` : `You're registered — ${team} · Small Town Select`,
    text: `Thanks for registering ${team}.${paid ? `\nPayment received${amt ? ' — ' + money(r.amount_cents) : ''}.` : ''}\nYour team code: ${code}\nManage your team: ${manage}`,
    html: shell('submitted', paid ? 'Payment Received' : "You're Registered!", body, manage, paid ? 'Add Your Roster' : 'Manage Your Team'),
  };
}

// ── PARENT/GUARDIAN one-click approval request ───────────────────────
export function buildApprovalMessage(r) {
  const site = process.env.SITE_URL || 'https://ststournaments.com';
  const player = r.player_name || 'your player';
  const team = r.team_name || 'their team';
  const season = r.season || '2026';
  const coach = r.coach_name ? esc(r.coach_name) : 'Your coach';
  const link = r.link || `${site}/approve.html`;
  const dob = fmtDob(r.player_dob);
  const dobBox = dob
    ? `<div style="margin-top:14px;background:#f1f5f9;border-radius:8px;padding:12px 14px">
         <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Date of birth on file</div>
         <div style="font-size:18px;font-weight:700;color:#00224f;font-family:Oswald,system-ui,sans-serif">${esc(dob)}</div>
         <div style="color:#64748b;font-size:13px;margin-top:2px">Please check this is correct — if it's wrong, tell your coach <b>before</b> approving (it's used for age eligibility).</div>
       </div>` : '';
  const body =
    `<div>${coach} added <b>${esc(player)}</b> to <b>${esc(team)}</b> for the ${esc(season)} season.</div>` +
    dobBox +
    `<div style="margin-top:12px">As ${esc(player)}'s parent or guardian, please confirm and approve their participation — it's <b>one tap</b>, no account or password needed.</div>` +
    `<div style="margin-top:12px;color:#64748b;font-size:13px">If you don't recognize this, you can ignore this email or reply to your coach.</div>`;
  return {
    subject: `Approve ${player} for ${team}`,
    text: `${coach} added ${player} to ${team} for the ${season} season. Approve here: ${link}`,
    html: shell('info', 'Player Approval Needed', body, link, `✓ Approve ${player}`),
  };
}
