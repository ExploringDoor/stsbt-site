// Vercel Serverless Function — /api/roster-save.js
// Lets a coach save their roster after proving they hold the team code.
// Re-checks the code SERVER-SIDE before writing, so a public read of the code
// can't be abused to overwrite another team's roster.
//
// Env: FIREBASE_PROJECT_ID, FIREBASE_API_KEY

import crypto from 'crypto';
import { fsGet, fsPatch, fsQuery, fbConfigured, fbAdminConfigured } from './_firestore.js';
import { ageAsOfMay1 } from './_age.js';
import { sendMail, emailConfigured, adminAddress } from './_email.js';
import { buildRosterMessage, buildApprovalMessage } from './notify-registration.js';

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
    // Also capture the previous player NAMES to diff added/removed for the notice.
    // Index previous values by BOTH name and jersey number, so a coach who renames a
    // player (fix a typo / add a last name) but keeps the same number doesn't wipe the
    // on-file dob/guardian/approval (the coach edits the PUBLIC roster, which has none).
    // PID is the durable per-player id (rides on the public roster the coach loads),
    // so it survives a rename AND a renumber — making it the safe primary key for
    // recovering on-file dob/guardian/approval. Name/number are fallbacks only.
    let prevDob = {}, prevDobByNum = {}, prevDobByPid = {}, prevNames = [], prevAppr = {}, prevApprByNum = {}, prevApprByPid = {}, prevActivePids = new Set();
    try {
      const prev = await fsGet(`team_rosters/${team.id}`);
      (prev && Array.isArray(prev.roster) ? prev.roster : []).forEach(p => {
        const k = String(p.name || '').toLowerCase().trim();
        const nk = String(p.num || '').trim();
        const pk = String(p.pid || '').trim();
        const appr = { guardian_email: p.guardian_email || '', approval_token: p.approval_token || '', approved: !!p.approved, approved_at: p.approved_at || '', approval_sent: !!p.approval_sent };
        if (p.dob) { if (pk) prevDobByPid[pk] = p.dob; if (k) prevDob[k] = p.dob; if (nk) prevDobByNum[nk] = p.dob; }
        if (pk) prevApprByPid[pk] = appr;
        if (k) prevAppr[k] = appr;
        if (nk) prevApprByNum[nk] = appr;
        if (p.name) prevNames.push(String(p.name).trim());
        if (!p.guest && p.pid) prevActivePids.add(p.pid);
      });
    } catch (e) {}

    // Full roster (WITH dob) — admin-only, lands in the gated team_rosters collection.
    const full = roster
      .filter(p => p && (p.name || '').trim())
      .slice(0, 40)
      .map(p => {
        const name = String(p.name || '').slice(0, 60);
        const key = name.toLowerCase().trim();
        const numKey = String(p.num || '').trim();
        const pidIn = String(p.pid || '').trim();   // durable id from the public roster
        const dob = String(p.dob || '').slice(0, 10) || (pidIn && prevDobByPid[pidIn]) || prevDob[key] || prevDobByNum[numKey] || '';
        const pa = (pidIn && prevApprByPid[pidIn]) || prevAppr[key] || prevApprByNum[numKey] || {};
        const guardian_email = String(p.guardian_email || pa.guardian_email || '').slice(0, 200);
        const approval_token = String(p.approval_token || pa.approval_token || '').slice(0, 40);
        const approved = (p.approved != null ? !!p.approved : !!pa.approved);
        return {
          num: String(p.num || '').slice(0, 4),
          name,
          dob,
          grade: String(p.grade || '').slice(0, 4),
          guest: !!p.guest,
          ...(p.guest && Array.isArray(p.guest_events) && p.guest_events.length ? { guest_events: p.guest_events.slice(0, 20).map(e => String(e).slice(0, 60)) } : {}),
          pid: playerId(name, dob),
          ...(guardian_email ? { guardian_email } : {}),
          ...(approval_token ? { approval_token } : {}),
          ...(approved ? { approved: true, approved_at: p.approved_at || pa.approved_at || '' } : {}),
          ...((p.approval_sent != null ? p.approval_sent : pa.approval_sent) ? { approval_sent: true } : {}),
        };
      });
    // Players who just got a parent email + token and haven't been sent or approved yet →
    // auto-send them the one-click approval link. Mark approval_sent so we don't re-send.
    const toSend = full.filter(p => p.guardian_email && p.approval_token && !p.approved && !p.approval_sent);
    toSend.forEach(p => { p.approval_sent = true; });
    // Public roster (NO dob — birthdates are minors' PII and the teams collection is
    // world-readable). age51 = derived age at the May 1 cutoff (Keith shows this
    // publicly for eligibility); pid lets the player page match a kid across teams.
    // approval_token is deliberately NOT included — it authorizes guardian approval and
    // must stay in the gated team_rosters doc only (public copy = forgeable consent + name leak).
    const pub = full.map(p => ({ num: p.num, name: p.name, grade: p.grade, guest: p.guest, pid: p.pid, age51: ageAsOfMay1(p.dob),
      ...(p.guest_events ? { guest_events: p.guest_events } : {}),
      ...(p.approved ? { approved: true } : {}) }));

    // ── Eligibility (Keith's rules) ──────────────────────────────────────────
    // A player may be ACTIVE (non-guest) on only ONE roster. We keep a tiny
    // cross-roster index in team_rosters/xp_<pid> = { team_id, team_name, player_name }
    // (team_rosters is admin-gated, so the prefixed docs need no extra rule).
    // HARD-BLOCK the save if any active player here is already active elsewhere.
    const activeNow = full.filter(p => !p.guest && p.name && p.pid);
    const activePidMap = new Map(activeNow.map(p => [p.pid, p]));   // dedupe within this roster
    const conflicts = [];
    for (const [pid, p] of activePidMap) {
      try {
        const idx = await fsGet(`team_rosters/xp_${pid}`);
        if (idx && idx.team_id && idx.team_id !== team.id) {
          conflicts.push({ player: p.name, team: idx.team_name || idx.team_id });
        }
      } catch (e) { /* missing index doc = no conflict */ }
    }
    if (conflicts.length) {
      return res.status(409).json({ error: 'active_conflict', conflicts,
        message: conflicts.map(c => `${c.player} is already an active player on "${c.team}". Mark them Guest here, or remove them from the other roster first.`).join(' ') });
    }

    await fsPatch(`teams/${team.id}`, { roster: pub });
    await fsPatch(`team_rosters/${team.id}`, { team_id: team.id, roster: full });

    // Maintain the active-player index: claim each active pid for this team, and
    // free up any pid that was active here before but is now removed or made guest.
    try {
      for (const [pid, p] of activePidMap) {
        await fsPatch(`team_rosters/xp_${pid}`, { team_id: team.id, team_name: team.name || '', player_name: p.name });
      }
      for (const pid of prevActivePids) {
        if (!activePidMap.has(pid)) await fsPatch(`team_rosters/xp_${pid}`, { team_id: '', team_name: '', player_name: '' });
      }
    } catch (e) { /* index upkeep is best-effort */ }

    // Season rosters need ≥9 active players — WARN (don't block), surfaced to the coach.
    const activeCount = activeNow.length;
    const warns = [];
    if (activeCount < 9) warns.push(`this roster has only ${activeCount} active player${activeCount === 1 ? '' : 's'} — a season roster needs at least 9 active players (you can add the rest later)`);

    // Pickup (guest) players are capped at 3 PER EVENT — WARN if any tournament is over.
    const PICKUP_CAP = 3;
    const perEvent = {};
    full.forEach(p => { if (p.guest && Array.isArray(p.guest_events)) p.guest_events.forEach(ev => { perEvent[ev] = (perEvent[ev] || 0) + 1; }); });
    const over = Object.keys(perEvent).filter(ev => perEvent[ev] > PICKUP_CAP);
    over.forEach(ev => warns.push(`${perEvent[ev]} pickup players are listed for "${ev}" — the limit is ${PICKUP_CAP} per event`));

    const warning = warns.length ? ('Heads up: ' + warns.join('; ') + '.') : '';

    // Notify the admin of what changed (added/removed), with the coach + timestamp.
    try {
      const newNames = full.map(p => p.name).filter(Boolean);
      const lc = s => s.toLowerCase();
      const added = newNames.filter(n => !prevNames.some(p => lc(p) === lc(n)));
      const removed = prevNames.filter(p => !newNames.some(n => lc(n) === lc(p)));
      let coachEmail = '';
      try { if (team.reg_id) { const reg = await fsGet(`registrations/${team.reg_id}`); coachEmail = (reg && reg.coach_email) || ''; } } catch (e) {}
      // Send DIRECTLY (not via a self-HTTP call) — the public site sits behind the
      // SITE_GATE password, so a fetch to our own /api would 401 and never email.
      const adminTo = adminAddress();
      if (emailConfigured() && adminTo && (added.length || removed.length)) {
        const msg = buildRosterMessage({
          team_name: team.name, coach_name: team.coach_name || '', coach_email: coachEmail,
          age_class: team.age_class || '', sport: team.sport || '',
          added, removed, player_count: full.length, updated_at: new Date().toISOString(),
        });
        await sendMail({ to: adminTo, subject: msg.subject, html: msg.html, text: msg.text, replyTo: coachEmail || undefined });
      }
    } catch (e) { /* non-fatal */ }

    // Auto-send the parent/guardian approval link for newly-added emails (best-effort).
    // Direct send for the same reason — the self-HTTP path is blocked by SITE_GATE.
    try {
      const base = process.env.SITE_URL || 'https://ststournaments.com';
      const slug = team.slug || team.id || '';
      for (const p of toSend) {
        if (!emailConfigured() || !p.guardian_email) continue;
        const link = `${base}/approve.html?team=${encodeURIComponent(slug)}&t=${encodeURIComponent(p.approval_token)}`;
        const msg = buildApprovalMessage({ guardian_email: p.guardian_email, player_name: p.name, player_dob: p.dob || '', team_name: team.name, coach_name: team.coach_name || '', season: '2026', link });
        await sendMail({ to: p.guardian_email, subject: msg.subject, html: msg.html, text: msg.text });
      }
    } catch (e) { /* non-fatal */ }

    return res.status(200).json({ ok: true, count: full.length, active: activeCount, approvals_sent: toSend.length, ...(warning ? { warning } : {}) });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
