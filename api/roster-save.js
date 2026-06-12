// Vercel Serverless Function — /api/roster-save.js
// Lets a coach save their roster after proving they hold the team code.
// Re-checks the code SERVER-SIDE before writing, so a public read of the code
// can't be abused to overwrite another team's roster.
//
// Env: FIREBASE_PROJECT_ID, FIREBASE_API_KEY

import { fsGet, fsPatch, fsQuery, fbConfigured } from './_firestore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!fbConfigured()) return res.status(501).json({ error: 'not_configured' });

  const { teamId, roster, code } = req.body || {};
  if (!teamId || !Array.isArray(roster) || !code) return res.status(400).json({ error: 'Missing fields' });

  try {
    let team = await fsGet(`teams/${teamId}`);
    if (!team) { const q = await fsQuery('teams', 'slug', 'EQUAL', teamId); team = q[0]; }
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (String(team.team_code).toUpperCase() !== String(code).toUpperCase()) return res.status(403).json({ error: 'Wrong team code' });

    const clean = roster
      .filter(p => p && (p.name || '').trim())
      .slice(0, 40)
      .map(p => ({
        num: String(p.num || '').slice(0, 4),
        name: String(p.name || '').slice(0, 60),
        dob: String(p.dob || '').slice(0, 10),
        grade: String(p.grade || '').slice(0, 4),
        guest: !!p.guest
      }));

    await fsPatch(`teams/${team.id}`, { roster: clean });
    return res.status(200).json({ ok: true, count: clean.length });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
