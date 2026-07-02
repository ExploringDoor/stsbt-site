// Shared server-side eligibility-age math for STS serverless functions.
// Keith's cutoff: a player's age as of May 1 of the season year. The season runs
// Aug 1 → Jul 31, so from August onward the relevant cutoff is NEXT May 1.
// This derived age (age51) is the ONLY age info the public team doc ever carries —
// the birthdate itself stays in the admin-gated team_rosters collection.

export function ageAsOfMay1(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return '';
  // SEASON_YEAR (Vercel env) pins the cutoff to the registration season so the server
  // matches the client's config.season.year; otherwise fall back to the Aug-1 rollover.
  // Fallback when SEASON_YEAR (Vercel env) isn't set. MUST match config.season.year
  // on the client — otherwise the server-stamped public age51 disagrees with the
  // registration forms by a year. Bump both together each season.
  const FALLBACK_SEASON_YEAR = 2027;
  const envYr = parseInt(process.env.SEASON_YEAR || '', 10);
  const yr = (envYr && envYr > 2000) ? envYr : FALLBACK_SEASON_YEAR;
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
    // The approval_token must NEVER go on the public teams doc: it is the sole secret that
    // authorizes a guardian approval, and /api/approve matches it against the GATED
    // team_rosters doc — so a public copy would let anyone forge consent + read the minor's
    // name. Only the approved FLAG (safe) is mirrored publicly. Guardian email stays gated too.
    ...(p.approved ? { approved: true } : {}),
  }));
}
