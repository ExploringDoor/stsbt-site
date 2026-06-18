// ─────────────────────────────────────────────────────────────────────
// Bracket logic: resolve WG-/LG- advancement refs to team names, classify
// games (winners / losers / final), determine the champion. Ported from the
// D27 engine, using STSBT game fields (away_score / home_score / done, g).
//   t = { games: [ { g, away, home, away_score, home_score, done } ] }
// Browser: window.STSbracket
// ─────────────────────────────────────────────────────────────────────
(function (global) {
  function parseRef(s) {
    if (s == null) return { kind: 'tbd' };
    var t = String(s).trim(), m;
    m = t.match(/^WG-(\d+)$/i); if (m) return { kind: 'WG', g: +m[1] };
    m = t.match(/^LG-(\d+)$/i); if (m) return { kind: 'LG', g: +m[1] };
    if (/if necessary/i.test(t)) return { kind: 'tbd', label: 'If necessary' };
    if (/^bye$/i.test(t)) return { kind: 'bye' };
    // "Seed N" = an as-yet-unseeded slot (bracket scheduled before teams are set);
    // render it as a greyed placeholder, never a (broken) team link.
    m = t.match(/^seed\s*(\d+)$/i); if (m) return { kind: 'tbd', label: 'Seed ' + m[1], seed: +m[1] };
    return { kind: 'team', name: t };
  }
  function gameByNum(t, n) { return (t.games || []).find(function (g) { return g.g === n; }); }
  function isPlayed(g) { return g && g.done === true && g.away_score != null && g.home_score != null; }
  function resolveSide(t, ref, seen) {
    seen = seen || new Set();
    if (ref.kind === 'team') return ref.name;
    if (ref.kind === 'bye') return 'BYE';
    if (ref.kind !== 'WG' && ref.kind !== 'LG') return null;
    var g = gameByNum(t, ref.g); if (!g || seen.has(ref.g)) return null;
    seen.add(ref.g);
    return ref.kind === 'WG' ? winnerName(t, g, seen) : loserName(t, g, seen);
  }
  function winnerName(t, g, seen) { if (!isPlayed(g)) return null; var a = resolveSide(t, parseRef(g.away), new Set(seen)), h = resolveSide(t, parseRef(g.home), new Set(seen)); return g.away_score > g.home_score ? a : g.home_score > g.away_score ? h : null; }
  function loserName(t, g, seen) { if (!isPlayed(g)) return null; var a = resolveSide(t, parseRef(g.away), new Set(seen)), h = resolveSide(t, parseRef(g.home), new Set(seen)); return g.away_score > g.home_score ? h : g.home_score > g.away_score ? a : null; }
  function feeders(g) { var o = []; [g.away, g.home].forEach(function (raw) { var r = parseRef(raw); if (r.kind === 'WG' || r.kind === 'LG') o.push(r.g); }); return o; }
  function computeRounds(t) {
    var depth = {}, guard = new Set();
    function d(n) { if (depth[n] != null) return depth[n]; if (guard.has(n)) return 1; guard.add(n); var g = gameByNum(t, n); if (!g) return 1; var f = feeders(g); var r = f.length ? 1 + Math.max.apply(null, f.map(d)) : 1; depth[n] = r; return r; }
    (t.games || []).forEach(function (g) { d(g.g); }); return depth;
  }
  function classify(t) {
    var pw = {}, guard = new Set();
    function isPw(n) {
      if (pw[n] != null) return pw[n];
      if (guard.has(n)) return true; guard.add(n);
      var g = gameByNum(t, n); if (!g) { pw[n] = true; return true; }
      var v = true;
      [g.away, g.home].forEach(function (raw) { var r = parseRef(raw); if (r.kind === 'LG') v = false; if (r.kind === 'WG' && !isPw(r.g)) v = false; });
      pw[n] = v; return v;
    }
    (t.games || []).forEach(function (g) { isPw(g.g); });
    var depth = computeRounds(t), wbFinal = null, wbDepth = -1;
    (t.games || []).forEach(function (g) { if (pw[g.g] && (depth[g.g] || 1) > wbDepth) { wbDepth = depth[g.g] || 1; wbFinal = g.g; } });
    var consumers = {};
    (t.games || []).forEach(function (g) { [g.away, g.home].forEach(function (raw) { var r = parseRef(raw); if (r.kind === 'WG' || r.kind === 'LG') (consumers[r.g] = consumers[r.g] || []).push(g.g); }); });
    var fin = new Set();
    if (wbFinal != null) {
      var q = (consumers[wbFinal] || []).filter(function (n) { var g = gameByNum(t, n); var a = parseRef(g.away), h = parseRef(g.home); return (a.kind === 'WG' && a.g === wbFinal) || (h.kind === 'WG' && h.g === wbFinal); });
      while (q.length) { var n = q.shift(); if (fin.has(n)) continue; fin.add(n); (consumers[n] || []).forEach(function (c) { q.push(c); }); }
      if (!fin.size) fin.add(wbFinal);
    }
    var cls = {};
    (t.games || []).forEach(function (g) { cls[g.g] = fin.has(g.g) ? 'f' : pw[g.g] ? 'w' : 'l'; });
    return cls;
  }
  function championOutcome(t, cls) {
    var finals = (t.games || []).filter(function (g) { return cls[g.g] === 'f'; }).sort(function (a, b) { return a.g - b.g; });
    var hide = new Set();
    if (!finals.length) return { champion: null, hide: hide };
    var gf = finals[0];
    var feederCls = function (raw) { var r = parseRef(raw); return (r.kind === 'WG' || r.kind === 'LG') ? cls[r.g] : null; };
    var winnersSide = feederCls(gf.away) === 'w' ? 'away' : feederCls(gf.home) === 'w' ? 'home' : 'away';
    var isGrandFinal = feederCls(gf.away) === 'l' || feederCls(gf.home) === 'l';
    var champion = null;
    if (isPlayed(gf)) {
      var winSide = gf.away_score > gf.home_score ? 'away' : gf.home_score > gf.away_score ? 'home' : null;
      if (winSide && (!isGrandFinal || winSide === winnersSide)) {
        champion = resolveSide(t, parseRef(winSide === 'away' ? gf.away : gf.home), new Set());
        finals.slice(1).forEach(function (g) { hide.add(g.g); });
      } else if (winSide) {
        var dec = finals[1];
        if (dec && isPlayed(dec)) { var ds = dec.away_score > dec.home_score ? 'away' : dec.home_score > dec.away_score ? 'home' : null; if (ds) champion = resolveSide(t, parseRef(ds === 'away' ? dec.away : dec.home), new Set()); }
      }
    }
    return { champion: champion, hide: hide };
  }
  function playedCount(t) { return (t.games || []).filter(isPlayed).length; }
  function sideDisplay(t, raw) {
    var ref = parseRef(raw);
    if (ref.kind === 'team') return { name: ref.name };
    if (ref.kind === 'bye') return { name: 'BYE', tbd: true };
    if (ref.kind === 'tbd') return { name: ref.label || 'TBD', tbd: true };
    var resolved = resolveSide(t, ref, new Set());
    if (resolved) return { name: resolved };
    return { name: (ref.kind === 'WG' ? 'Winner G' : 'Loser G') + ref.g, tbd: true };
  }
  function rounds(t) { return computeRounds(t); }
  function isRef(s) { var r = parseRef(s); return r.kind === 'WG' || r.kind === 'LG' || r.kind === 'tbd' || r.kind === 'bye'; }

  global.STSbracket = { parseRef: parseRef, isPlayed: isPlayed, classify: classify, championOutcome: championOutcome, playedCount: playedCount, sideDisplay: sideDisplay, resolveSide: resolveSide, rounds: rounds, isRef: isRef };
})(typeof window !== 'undefined' ? window : globalThis);
