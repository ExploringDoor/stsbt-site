// Shared server-side eligibility-age math for STS serverless functions.
// Keith's cutoff: a player's age as of May 1 of the season year. The season runs
// Aug 1 → Jul 31, so from August onward the relevant cutoff is NEXT May 1.
// This derived age (age51) is the ONLY age info the public team doc ever carries —
// the birthdate itself stays in the admin-gated team_rosters collection.

export function ageAsOfMay1(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return '';
  // SEASON_YEAR (Vercel env) pins the cutoff to the registration season so the server
  // matches the client's config.season.year; otherwise fall back to the Aug-1 rollover.
  const envYr = parseInt(process.env.SEASON_YEAR || '', 10);
  const now = new Date();
  const yr = (envYr && envYr > 2000) ? envYr : (now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear());
  const cut = new Date(yr, 4, 1, 12);
  const b = new Date(dob + 'T12:00:00');
  if (isNaN(b)) return '';
  let age = cut.getFullYear() - b.getFullYear();
  const m = cut.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && cut.getDate() < b.getDate())) age--;
  return age >= 0 && age < 30 ? age : '';
}

// Project a roster to the PUBLIC shape — no dob ever. age51 is derived; pid (if
// present) is preserved so the player page can match a kid across teams.
export function publicRoster(roster) {
  return (Array.isArray(roster) ? roster : []).map(p => ({
    num: String(p.num || '').slice(0, 4),
    name: String(p.name || '').slice(0, 60),
    grade: String(p.grade || '').slice(0, 4),
    guest: !!p.guest,
    age51: ageAsOfMay1(String(p.dob || '')),
    ...(p.pid ? { pid: p.pid } : {}),
    // approval status + opaque token are NOT PII (the parent already holds the token in
    // their link); keep them on the public doc so the approve page can match the player.
    // Guardian email stays OUT (PII) — it only lives in the gated team_rosters doc.
    ...(p.approval_token ? { approval_token: p.approval_token } : {}),
    ...(p.approved ? { approved: true } : {}),
  }));
}
