// Bulk email to coaches (announcements, weather updates, tournament notices).
//
// Triggered from the admin "Email" panel. SECURITY: the caller must prove they are
// a SUPER admin — we verify their Firebase ID token (no downloaded key needed):
//   1) accounts:lookup with FIREBASE_API_KEY confirms the token + gives the uid;
//   2) we read admins/{uid} via the Firestore REST API USING THE CALLER'S token as
//      Bearer (the rules let a signed-in user read their own admin doc), and require
//      role:'super' + active:true.
// This keeps the endpoint from being an open spam relay, using only envs already set
// (FIREBASE_API_KEY, FIREBASE_PROJECT_ID, SENDGRID_API_KEY, MAIL_FROM).
//
// Body: { idToken, subject, message, recipients:[email,...], replyTo? }
// Returns: { sent } or { skipped } / { error }.

import { shell, esc } from './_email.js';

const API_KEY = process.env.FIREBASE_API_KEY || '';
const PROJECT = process.env.FIREBASE_PROJECT_ID || '';
const SG_KEY = process.env.SENDGRID_API_KEY || '';
const FROM = process.env.MAIL_FROM || 'Small Town Select Tournaments <noreply@ststournaments.com>';
const MAX_RECIPIENTS = 5000;        // safety cap
const BATCH = 900;                  // SendGrid allows up to 1000 personalizations/request

function parseFrom(s) {
  const m = /^\s*(.*?)\s*<\s*(.+?)\s*>\s*$/.exec(s);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: String(s).trim() };
}
const isEmail = (e) => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());

async function verifySuper(idToken) {
  if (!idToken) return { ok: false, code: 401, msg: 'Not signed in.' };
  if (!API_KEY || !PROJECT) return { ok: false, code: 500, msg: 'Server auth not configured.' };
  // 1) token → uid
  const lr = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
  });
  if (!lr.ok) return { ok: false, code: 401, msg: 'Sign-in expired — reload admin and try again.' };
  const lj = await lr.json();
  const uid = lj.users && lj.users[0] && lj.users[0].localId;
  if (!uid) return { ok: false, code: 401, msg: 'Could not verify your sign-in.' };
  // 2) admins/{uid} read with the caller's own token (rules allow self-read)
  const dr = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/admins/${uid}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!dr.ok) return { ok: false, code: 403, msg: 'Not an admin account.' };
  const dj = await dr.json();
  const f = (dj && dj.fields) || {};
  const role = f.role && f.role.stringValue;
  const active = f.active && f.active.booleanValue;
  if (role !== 'super' || !active) return { ok: false, code: 403, msg: 'Only a super admin can send mass email.' };
  return { ok: true, uid };
}

async function sendBatch(personalizations, subject, html, text, replyTo) {
  const body = {
    personalizations, from: parseFrom(FROM),
    subject: subject || '(no subject)',
    content: [{ type: 'text/plain', value: text || ' ' }, { type: 'text/html', value: html || '<p></p>' }],
  };
  if (replyTo && isEmail(replyTo)) body.reply_to = { email: replyTo.trim() };
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST', headers: { Authorization: `Bearer ${SG_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (r.status === 202) return;
  let detail = String(r.status);
  try { detail = JSON.stringify(await r.json()); } catch (e) {}
  throw new Error('SendGrid ' + r.status + ': ' + detail.slice(0, 300));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!SG_KEY) return res.status(200).json({ skipped: true, reason: 'SENDGRID_API_KEY not set' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  const auth = await verifySuper(b.idToken);
  if (!auth.ok) return res.status(auth.code).json({ error: auth.msg });

  const subject = String(b.subject || '').trim();
  const message = String(b.message || '').trim();
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are both required.' });

  // dedupe + validate recipients
  const seen = {}; const recipients = [];
  (Array.isArray(b.recipients) ? b.recipients : []).forEach((e) => {
    const x = String(e || '').trim().toLowerCase();
    if (isEmail(x) && !seen[x]) { seen[x] = 1; recipients.push(x); }
  });
  if (!recipients.length) return res.status(400).json({ error: 'No valid recipient emails.' });
  if (recipients.length > MAX_RECIPIENTS) return res.status(400).json({ error: `Too many recipients (max ${MAX_RECIPIENTS}).` });

  // body: preserve the admin's line breaks; wrap in the branded shell + a footer
  const htmlBody = esc(message).replace(/\n/g, '<br>');
  const footer = `<div style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:12px;color:#94a3b8">You're receiving this because your team is registered with Small Town Select Tournaments.</div>`;
  const html = shell('info', subject, htmlBody + footer);
  const text = message;

  let sent = 0;
  try {
    for (let i = 0; i < recipients.length; i += BATCH) {
      const slice = recipients.slice(i, i + BATCH);
      // one personalization per recipient → each gets their own copy (no shared To/CC)
      const pers = slice.map((email) => ({ to: [{ email }] }));
      await sendBatch(pers, subject, html, text, b.replyTo);
      sent += slice.length;
    }
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e), sent });
  }
  return res.status(200).json({ sent });
}
