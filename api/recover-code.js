// Vercel Serverless Function — /api/recover-code
// Coach self-service: re-send the team code(s) to the email ALREADY ON FILE.
//
// Security model:
//   • The code is NEVER returned in the HTTP response — it is only ever emailed
//     to the coach_email stored on the registration. So a stranger who guesses an
//     email can, at worst, cause that email's real owner to receive their own
//     codes — never a leak to the requester.
//   • The response is an identical generic 200 whether or not anything matched,
//     so the endpoint can't be used to enumerate which teams/emails exist.
//   • Reads the PII-gated `registrations` collection as the admin robot, but
//     returns NO data from it.

import { fsQuery, fbConfigured } from './_firestore.js';
import { sendMail, emailConfigured } from './_email.js';
import { buildCodeRecoveryMessage } from './notify-registration.js';

const GENERIC = { ok: true };   // identical response regardless of match

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = String((req.body && req.body.email) || '').trim();
  const team = String((req.body && req.body.team) || '').trim();
  if (!email || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });

  // Real work is best-effort behind the always-generic response.
  try {
    if (fbConfigured() && emailConfigured()) {
      // Match coach_email exactly and case-normalized (covers the common cases).
      const tries = Array.from(new Set([email, email.toLowerCase()]));
      const seen = {};
      let regs = [];
      for (const e of tries) {
        const rows = await fsQuery('registrations', 'coach_email', 'EQUAL', e);
        for (const r of (rows || [])) { if (r && !seen[r.id]) { seen[r.id] = 1; regs.push(r); } }
      }
      // Keep only real, code-bearing, non-archived entries.
      regs = regs.filter((r) => r && r.team_code && (r.status || 'completed') !== 'archived');
      // If a team name was supplied and it narrows the set, honor it; else send all.
      if (team) {
        const t = team.toLowerCase();
        const narrowed = regs.filter((r) => {
          const n = String(r.team_name || '').toLowerCase();
          return n === t || n.includes(t);
        });
        if (narrowed.length) regs = narrowed;
      }
      // Dedup by code (a team can appear across multiple forms).
      const byCode = {};
      const teams = [];
      for (const r of regs) {
        const k = r.team_code + '|' + (r.age_class || '');
        if (byCode[k]) continue;
        byCode[k] = 1;
        teams.push({ team_name: r.team_name, team_code: r.team_code, age_class: r.age_class || '', team_id: r.team_id || '', form_title: r.form_title || '' });
      }
      if (teams.length) {
        const to = regs[0].coach_email || email;   // the ON-FILE address (equals what the requester typed, confirmed present)
        const m = buildCodeRecoveryMessage(teams);
        await sendMail({ to, subject: m.subject, html: m.html, text: m.text });
      }
    }
  } catch (e) {
    // Swallow — never leak internal state to the requester.
  }

  return res.status(200).json(GENERIC);
}
