// Vercel Serverless Function — /api/withdraw.js
// Lets a coach withdraw their team from a tournament after proving they hold the
// team code. Removes the tournament from the team's tournaments[] (so it drops off
// "Who's Coming" + the public team page) and emails the director. The original
// registration record is KEPT — the director handles any refund in CardConnect.
//
// Env: FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FB_ADMIN_*, SENDGRID_API_KEY, ADMIN_EMAIL

import { fsGet, fsPatch, fbConfigured, fbAdminConfigured } from './_firestore.js';
import { sendMail, emailConfigured, adminAddress } from './_email.js';

function esc(s){ return String(s == null ? '' : s).replace(/[&<>]/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;' }[c]; }); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!fbConfigured()) return res.status(501).json({ error: 'not_configured' });
  if (!fbAdminConfigured()) return res.status(501).json({ error: 'admin_auth_not_configured' });

  const { teamId, code, tournament } = req.body || {};
  if (!teamId || !code || !tournament) return res.status(400).json({ error: 'Missing fields' });

  try {
    const team = await fsGet(`teams/${teamId}`);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (String(team.team_code || '').toUpperCase() !== String(code).toUpperCase())
      return res.status(403).json({ error: 'Wrong team code' });

    const tours = (Array.isArray(team.tournaments) ? team.tournaments : []).filter(t => t !== tournament);
    await fsPatch(`teams/${team.id}`, { tournaments: tours });

    // notify the director (reply-to the coach so they can follow up about a refund)
    try {
      const to = adminAddress();
      if (emailConfigured() && to) {
        let coachEmail = '';
        try { if (team.reg_id) { const reg = await fsGet(`registrations/${team.reg_id}`); coachEmail = (reg && reg.coach_email) || ''; } } catch (e) {}
        const subject = `Withdrawal: ${team.name || 'A team'} pulled out of ${tournament}`;
        const lines = [
          ['Team', team.name || ''],
          ['Tournament', tournament],
          ['Sport / Age', [team.sport, team.age_class, team.division].filter(Boolean).join(' · ')],
          ['Coach', team.coach_name || ''],
          ['Town', team.town || ''],
        ].filter(r => r[1]);
        const text = `${team.name || 'A team'} has withdrawn from ${tournament}.\n\n` +
          lines.map(r => `${r[0]}: ${r[1]}`).join('\n') +
          `\n\nThey've been removed from this tournament's team list. If they paid an entry fee, issue any refund in CardConnect.`;
        const html = `<p><strong>${esc(team.name || 'A team')}</strong> has withdrawn from <strong>${esc(tournament)}</strong>.</p>` +
          '<table cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
          lines.map(r => `<tr><td style="color:#555">${esc(r[0])}</td><td><strong>${esc(r[1])}</strong></td></tr>`).join('') +
          '</table>' +
          `<p style="color:#555;font-size:13px">They've been removed from this tournament's team list. If they paid an entry fee, issue any refund in CardConnect.</p>`;
        await sendMail({ to, subject, html, text, replyTo: coachEmail || undefined });
      }
    } catch (e) { /* non-fatal */ }

    return res.status(200).json({ ok: true, tournaments: tours });
  } catch (e) {
    console.error('withdraw exception', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
