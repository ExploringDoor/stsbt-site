// Vercel Serverless Function — /api/roster-save.js
// Lets a coach save their roster after proving they hold the team code.
// Re-checks the code SERVER-SIDE before writing, so a public read of the code
// can't be abused to overwrite another team's roster.
//
// Env: FIREBASE_PROJECT_ID, FIREBASE_API_KEY

import crypto from 'crypto';
import { fsGet, fsPatch, fsQuery, fbConfigured, fbAdminConfigured } from './_firestore.js';
import { ageAsOfMay1 } from './_age.js';

// Stable, non-reversible player id from name+dob. SALTED with a server-only secret
// so the pid on the PUBLIC team doc can't be brute-forced back to a child's birthdate.
// player.html only ever compares stored pids, so it never needs the salt.
const PID_SALT = process.env.ROSTER_PID_SALT || 'sts-roster-pid-salt-v1';
function playerId(name, dob) {
  return 'p' + crypto.createHash('sha256')
    .update(PID_SALT + '|' + String(name || '').toLowerCase().trim() + '|' + String(dob || '').trim())
    .digest('hex').slice(0, 16);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!fbConfigured()) return res.status(501).json({ error: 'not_configured' });
  // Both writes below (public teams + gated team_rosters) require isSuper(), so the
  // server must be able to sign in as the admin user — fail loudly if it can't,
  // rather than letting the rules silently reject the write.
  if (!fbAdminConfigured()) return res.status(501).json({ error: 'admin_auth_not_configured' });

  const { teamId, roster, code } = req.body || {};
  if (!teamId || !Array.isArray(roster) || !code) return res.status(400).json({ error: 'Missing fields' });

  try {
    let team = await fsGet(`teams/${teamId}`);
    if (!team) { const q = await fsQuery('teams', 'slug', 'EQUAL', teamId); team = q[0]; }
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (String(team.team_code).toUpperCase() !== String(code).toUpperCase()) return res.status(403).json({ error: 'Wrong team code' });

    // A coach re-editing can't see stored birthdates (the public doc has none), so an
    // empty incoming dob must KEEP the one already on file — never silently wipe it.
    let prevDob = {};
    try {
      const prev = await fsGet(`team_rosters/${team.id}`);
      (prev && Array.isArray(prev.roster) ? prev.roster : []).forEach(p => {
        const k = String(p.name || '').toLowerCase().trim();
        if (k && p.dob) prevDob[k] = p.dob;
      });
    } catch (e) {}

    // Full roster (WITH dob) — admin-only, lands in the gated team_rosters collection.
    const full = roster
      .filter(p => p && (p.name || '').trim())
      .slice(0, 40)
      .map(p => {
        const name = String(p.name || '').slice(0, 60);
        const dob = String(p.dob || '').slice(0, 10) || prevDob[name.toLowerCase().trim()] || '';
        return {
          num: String(p.num || '').slice(0, 4),
          name,
          dob,
          grade: String(p.grade || '').slice(0, 4),
          guest: !!p.guest,
          pid: playerId(name, dob),
        };
      });
    // Public roster (NO dob — birthdates are minors' PII and the teams collection is
    // world-readable). age51 = derived age at the May 1 cutoff (Keith shows this
    // publicly for eligibility); pid lets the player page match a kid across teams.
    const pub = full.map(p => ({ num: p.num, name: p.name, grade: p.grade, guest: p.guest, pid: p.pid, age51: ageAsOfMay1(p.dob) }));

    await fsPatch(`teams/${team.id}`, { roster: pub });
    await fsPatch(`team_rosters/${team.id}`, { team_id: team.id, roster: full });

    // Best-effort: tell the admin a roster was updated (never blocks the save).
    try {
      const site = process.env.SITE_URL || '';
      if (site) await fetch(`${site}/api/notify-registration`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'roster', registration: { team_name: team.name, player_count: full.length, coach_name: team.coach_name || '' } }),
      });
    } catch (e) { /* non-fatal */ }

    return res.status(200).json({ ok: true, count: full.length });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
