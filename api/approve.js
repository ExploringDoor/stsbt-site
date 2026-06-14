// Parent/guardian one-click player approval (POST { team, token }).
// The parent has no team code — they arrive via a tokened link. We match the token in
// the GATED team_rosters doc (where the approval_token lives) and flip `approved`, then
// mirror the status onto the public teams doc. Requires the authed admin user (same
// setup as the other server writes); degrades with 501 until configured.
import { fsGet, fsPatch, fsQuery, fbAdminConfigured } from './_firestore.js';
import { publicRoster } from './_age.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!fbAdminConfigured()) return res.status(501).json({ error: 'Approvals are not enabled on the server yet.' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const slug = String(b.team || '').trim(), token = String(b.token || '').trim();
  if (!slug || !token) return res.status(400).json({ error: 'Missing team or token.' });

  try {
    let team = await fsGet(`teams/${slug}`);
    if (!team) { const q = await fsQuery('teams', 'slug', 'EQUAL', slug); team = q[0]; }
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    const gated = await fsGet(`team_rosters/${team.id}`);
    const full = (gated && Array.isArray(gated.roster)) ? gated.roster : [];
    const idx = full.findIndex((p) => p.approval_token === token);
    if (idx < 0) return res.status(404).json({ error: 'This approval link is invalid or expired.' });

    if (!full[idx].approved) {
      full[idx].approved = true;
      full[idx].approved_at = new Date().toISOString();
      await fsPatch(`team_rosters/${team.id}`, { roster: full });
      await fsPatch(`teams/${team.id}`, { roster: publicRoster(full) });
    }
    return res.status(200).json({ player_name: full[idx].name || 'Your player', team_name: team.name || '' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
