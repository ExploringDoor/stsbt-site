// ─────────────────────────────────────────────────────────────────────
// Tournament bracket generator (single / double elimination).
// Ported from the Node-tested D27 engine. Given teams (+ optional dates/
// times/fields) it builds a complete bracket as a games[] array using the
// WG-n / LG-n advancement-reference model that js/sts-bracket.js resolves.
//
//   STSgen.generateBracket({ format:'single'|'double', teams:[name...], startGame:1 })
//     -> [{ g, away, home, champ? }]   (away/home = team name OR 'WG-n'/'LG-n')
//   STSgen.scheduleGames(games, { dates, times, fields }) -> mutates date/time/field
//
// Pure + side-effect-free. Browser: window.STSgen.
// ─────────────────────────────────────────────────────────────────────
(function (root) {
  'use strict';
  var nextPow2 = function (n) { var p = 1; while (p < n) p <<= 1; return p; };
  function refGameNum(s) { var m = /^(?:WG|LG)-(\d+)$/i.exec(String(s == null ? '' : s).trim()); return m ? +m[1] : null; }
  function abbrev(name) {
    var w = String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    if (!w.length) return ''; if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    return w.map(function (x) { return x[0]; }).join('').slice(0, 4).toUpperCase();
  }
  // Standard single-elim seed order for a power-of-2 bracket.
  function seedSlots(size) {
    var seeds = [1, 2];
    while (seeds.length < size) { var sum = seeds.length * 2 + 1, next = []; for (var i = 0; i < seeds.length; i++) { next.push(seeds[i]); next.push(sum - seeds[i]); } seeds = next; }
    return seeds;
  }
  function buildWinners(teams, startG) {
    var N = teams.length, size = nextPow2(N), seeds = seedSlots(size);
    var slot = seeds.map(function (sd) { return sd <= N ? teams[sd - 1] : null; });
    var games = [], g = startG - 1, waves = [];
    var adv = [], wave1 = [];
    for (var i = 0; i < size; i += 2) {
      var a = slot[i], b = slot[i + 1];
      if (a && b) { g++; games.push({ g: g, away: a, home: b }); adv.push('WG-' + g); wave1.push('LG-' + g); }
      else if (a || b) { adv.push(a || b); wave1.push(null); }
      else { adv.push(null); wave1.push(null); }
    }
    waves.push(wave1);
    while (adv.length > 1) {
      var next = [], wave = [];
      for (var j = 0; j < adv.length; j += 2) {
        var x = adv[j], y = adv[j + 1];
        if (x && y) { g++; games.push({ g: g, away: x, home: y }); next.push('WG-' + g); wave.push('LG-' + g); }
        else if (x || y) { next.push(x || y); wave.push(null); }
        else { next.push(null); wave.push(null); }
      }
      adv = next; waves.push(wave);
    }
    return { games: games, waves: waves, wbChampRef: adv[0], lastG: g };
  }
  function buildLosers(waves, startG) {
    var games = [], g = startG - 1, k = waves.length;
    function pairUp(refs) {
      var out = [];
      for (var i = 0; i < refs.length; i += 2) {
        var a = refs[i], b = refs[i + 1];
        if (a && b) { g++; games.push({ g: g, away: a, home: b }); out.push('WG-' + g); }
        else if (a || b) out.push(a || b); else out.push(null);
      }
      return out;
    }
    function absorb(surv, drops) {
      var d = drops.slice().reverse(), out = [], len = Math.max(surv.length, d.length);
      for (var i = 0; i < len; i++) {
        var a = surv[i] != null ? surv[i] : null, b = d[i] != null ? d[i] : null;
        if (a && b) { g++; games.push({ g: g, away: a, home: b }); out.push('WG-' + g); }
        else if (a || b) out.push(a || b); else out.push(null);
      }
      return out;
    }
    var surv = pairUp(waves[0]);
    for (var r = 1; r < k; r++) { surv = absorb(surv, waves[r]); if (r < k - 1) surv = pairUp(surv); }
    var lbChampRef = null;
    for (var s = 0; s < surv.length; s++) if (surv[s] != null) { lbChampRef = surv[s]; break; }
    return { games: games, lbChampRef: lbChampRef, lastG: g };
  }
  function buildFinal(wbChampRef, lbChampRef, startG) {
    // Grand final, then the "if necessary" reset = a rematch of the grand final
    // (its winner vs its loser) so BOTH sides resolve to real teams.
    return { games: [{ g: startG, away: wbChampRef, home: lbChampRef }, { g: startG + 1, away: 'WG-' + startG, home: 'LG-' + startG }], lastG: startG + 1 };
  }
  function generateBracket(opts) {
    var teams = (opts && opts.teams) || [], startG = (opts && opts.startGame) || 1;
    if (teams.length < 2) return [];
    var wb = buildWinners(teams, startG);
    if ((opts.format || 'single') !== 'double') {
      if (wb.games.length) wb.games[wb.games.length - 1].champ = true;
      return wb.games;
    }
    var lb = buildLosers(wb.waves, wb.lastG + 1);
    var fin = buildFinal(wb.wbChampRef, lb.lbChampRef, lb.lastG + 1);
    fin.games.forEach(function (g) { g.champ = true; });
    return wb.games.concat(lb.games, fin.games);
  }

  // ── Simple draft scheduler: assign date/time/field per game by round ──
  function scheduleGames(games, opts) {
    opts = opts || {};
    var dates = (opts.dates || []).filter(Boolean);
    var times = (opts.times && opts.times.length ? opts.times : ['09:00']);
    var fields = (opts.fields && opts.fields.length ? opts.fields : ['Field 1']);
    if (!dates.length) return games;
    var byNum = {}; games.forEach(function (g) { byNum[g.g] = g; });
    var memo = {};
    function depth(n) {
      if (memo[n] != null) return memo[n];
      memo[n] = 1; var g = byNum[n]; if (!g) return 1;
      var fds = [g.away, g.home].map(refGameNum).filter(function (x) { return x != null; });
      var d = fds.length ? 1 + Math.max.apply(null, fds.map(depth)) : 1; memo[n] = d; return d;
    }
    games.forEach(function (g) { depth(g.g); });
    var rounds = []; games.forEach(function (g) { (rounds[memo[g.g]] = rounds[memo[g.g]] || []).push(g); });
    var dateIdx = 0;
    for (var d = 1; d < rounds.length; d++) {
      var rg = rounds[d]; if (!rg || !rg.length) continue;
      rg.sort(function (a, b) { return a.g - b.g; });
      var date = dates[Math.min(dateIdx, dates.length - 1)], slot = 0;
      rg.forEach(function (g) {
        g.date = date; g.time = times[slot % times.length]; g.field = fields[slot % fields.length]; slot++;
      });
      dateIdx++;
    }
    return games;
  }

  // ── Round-robin / pool-play generator ──────────────────────────────
  // BALANCED: every team plays the SAME number of games. Full round robin when
  // gamesPerTeam covers it; otherwise a circulant k-regular schedule — offsets
  // 1..⌊k/2⌋ give 2 games each, plus a half-offset matching for an odd k. Each team
  // gets EXACTLY k games when n·k is even; only when parity forbids it (e.g. 5 teams
  // × 3 games) does a single team come up one game short. Returns [{away,home}].
  function generatePool(teams, opts) {
    opts = opts || {};
    var t = teams.slice(), n = t.length;
    if (n < 2) return [];
    var k = opts.gamesPerTeam ? Math.max(1, Math.min(opts.gamesPerTeam, n - 1)) : (n - 1);
    if (k >= n - 1) return roundRobinAll(t);
    var seen = {}, games = [], flip = 0, deg = []; for (var z = 0; z < n; z++) deg[z] = 0;
    function add(i, j) {
      if (i === j) return;
      var a = i < j ? i : j, b = i < j ? j : i, key = a + '-' + b;
      if (seen[key]) return; seen[key] = 1; deg[i]++; deg[j]++;
      games.push((flip++ & 1) ? { away: t[b], home: t[a] } : { away: t[a], home: t[b] });
    }
    function minDeg() { var m = deg[0]; for (var x = 1; x < n; x++) if (deg[x] < m) m = deg[x]; return m; }
    for (var d = 1; d <= Math.floor(k / 2); d++) { for (var i = 0; i < n; i++) add(i, (i + d) % n); }
    if (k % 2 === 1) {
      if (n % 2 === 0) { for (var p = 0; p < n / 2; p++) add(p, p + n / 2); }    // perfect matching → +1 each
      else {  // odd n & odd k → exact-k impossible; greedily bump teams toward k (one stays a game short)
        for (var off = Math.floor(k / 2) + 1; off < n && minDeg() < k; off++)
          for (var s = 0; s < n; s++) { var u = (s + off) % n; if (deg[s] < k && deg[u] < k) add(s, u); }
      }
    }
    return games;
  }
  // Full round robin (everyone plays everyone) via the circle method.
  function roundRobinAll(teams) {
    var arr = teams.slice(); if (arr.length % 2 === 1) arr.push(null);
    var m = arr.length, rounds = m - 1, half = m / 2, games = [];
    for (var r = 0; r < rounds; r++) {
      for (var i = 0; i < half; i++) { var a = arr[i], b = arr[m - 1 - i]; if (a != null && b != null) games.push((r % 2) ? { away: b, home: a } : { away: a, home: b }); }
      arr.splice(1, 0, arr.pop());
    }
    return games;
  }

  if (root) root.STSgen = { generateBracket: generateBracket, generatePool: generatePool, scheduleGames: scheduleGames, abbrev: abbrev, _seedSlots: seedSlots };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
