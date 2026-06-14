// Vercel Serverless Function — /api/insurance-save
// A coach uploads their OWN team insurance policy from the code-gated coach page.
// Re-checks the team code SERVER-SIDE, then writes a PENDING record to the
// admin-only team_insurance collection and emails Keith for review.
//
// Env: FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FB_ADMIN_* (admin-token writes),
//      SENDGRID_API_KEY, ADMIN_EMAIL (notification).

import { fsGet, fsPatch, fsQuery, fbConfigured, fbAdminConfigured } from './_firestore.js';
import { sendMail, emailConfigured, adminAddress, shell, esc } from './_email.js';

const MAX_DOC = 950 * 1024;   // base64 cap (~700KB PDF) — Firestore docs max out at 1MB

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!fbConfigured()) return res.status(501).json({ error: 'not_configured' });
  if (!fbAdminConfigured()) return res.status(501).json({ error: 'admin_auth_not_configured' });

  const b = req.body || {};
  const { teamId, code } = b;
  if (!teamId || !code) return res.status(400).json({ error: 'Missing team or code' });
  if (b.doc_data && String(b.doc_data).length > MAX_DOC) {
    return res.status(413).json({ error: 'That PDF is too large to upload here — please email it to your director instead.' });
  }

  try {
    let team = await fsGet(`teams/${teamId}`);
    if (!team) { const q = await fsQuery('teams', 'slug', 'EQUAL', teamId); team = q[0]; }
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (String(team.team_code).toUpperCase() !== String(code).toUpperCase()) return res.status(403).json({ error: 'Wrong team code' });

    const rec = {
      team_id: team.id, team_name: team.name || '', status: 'pending', source: 'uploaded',
      carrier: String(b.carrier || '').slice(0, 120),
      policy_no: String(b.policy_no || '').slice(0, 80),
      coverage_start: String(b.coverage_start || '').slice(0, 10),
      coverage_end: String(b.coverage_end || '').slice(0, 10),
      doc_name: String(b.doc_name || '').slice(0, 160),
      doc_url: b.doc_data ? String(b.doc_data) : '',
      submitted_at: new Date().toISOString(), reviewed_at: '', note: '',
    };
    await fsPatch(`team_insurance/${team.id}`, rec);
    try { await fsPatch(`teams/${team.id}`, { insurance_status: 'pending' }); } catch (e) {}

    // Notify Keith directly (the public site is behind the password gate, so a
    // self-HTTP call to /api/notify-registration would 401 — send straight through).
    try {
      const to = adminAddress();
      if (emailConfigured() && to) {
        const base = process.env.SITE_URL || 'https://ststournaments.com';
        const rows = '<table style="width:100%;border-collapse:collapse">' +
          `<tr><td style="padding:6px 0;color:#64748b">Team</td><td style="padding:6px 0"><b>${esc(team.name || '')}</b></td></tr>` +
          `<tr><td style="padding:6px 0;color:#64748b">Carrier</td><td style="padding:6px 0">${esc(rec.carrier || '—')}</td></tr>` +
          `<tr><td style="padding:6px 0;color:#64748b">Policy #</td><td style="padding:6px 0">${esc(rec.policy_no || '—')}</td></tr>` +
          `<tr><td style="padding:6px 0;color:#64748b">Coverage</td><td style="padding:6px 0">${esc(rec.coverage_start || '?')} → ${esc(rec.coverage_end || '?')}</td></tr>` +
          '</table>';
        const html = shell('insurance', 'Insurance policy uploaded — needs review', rows, `${base}/admin.html`, 'Review in Admin');
        const text = `${team.name || 'A team'} uploaded an insurance policy for review. Carrier: ${rec.carrier || '—'}, Policy ${rec.policy_no || '—'}, Coverage ${rec.coverage_start || '?'}–${rec.coverage_end || '?'}. Review it in the Admin → Insurance tab.`;
        await sendMail({ to, subject: `Insurance uploaded — ${team.name || 'a team'} (review needed)`, html, text });
      }
    } catch (e) { /* non-fatal */ }

    return res.status(200).json({ ok: true, status: 'pending' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
