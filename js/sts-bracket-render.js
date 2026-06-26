// ─────────────────────────────────────────────────────────────────────
// STS bracket-tree renderer — absolute-positioned cards + SVG connector
// lines, the way a printed bracket reads. Winners bracket on top, Losers
// bracket directly below, Championship to the RIGHT of both — so the gold
// lines from the winners final and the losers final visibly CONVERGE into
// the championship. Ported from the D27 engine; depends on window.STSbracket.
//
//   STSbracketRender.render(games, { name }) -> HTML (champion banner + canvas)
//   window.STSbracketRender
// ─────────────────────────────────────────────────────────────────────
(function (global) {
  var SB = global.STSbracket;
  var CARD_W = 210, CARD_H = 134, COL_GAP = 76, ROW_GAP = 24, Y_PAD = 24;
  var LINK_TEAMS = false;   // when true, concrete team names link to their team page
  var TEAM_HREF = null;     // optional name→slug resolver (teams are name+age; bare slug misses)
  var VENUE = '';           // host city to prefix field names (e.g. "Gatesville · Arnold Field")
  var GLEN = 0;             // game length (min) → show a start–end time when set
  function addMin(t,m){ if(!t||!m) return ''; var p=String(t).split(':'),h=+p[0],mm=+(p[1]||0); if(isNaN(h)) return ''; var x=((h*60+mm+(+m))%1440+1440)%1440; return ('0'+Math.floor(x/60)).slice(-2)+':'+('0'+(x%60)).slice(-2); }
  function slugify(s){ return String(s==null?'':s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function parseRef(s){ return SB.parseRef(s); }
  function gameByNum(t, n){ return (t.games||[]).find(function(g){ return g.g===n; }); }
  function feeders(g){ var o=[]; [g.away,g.home].forEach(function(raw){ var r=parseRef(raw); if(r.kind==='WG'||r.kind==='LG') o.push(r.g); }); return o; }
  function fmtTime(t){ if(!t) return ''; var p=String(t).split(':'); var h=+p[0],m=p[1]||'00'; if(isNaN(h)) return t; var ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+m+' '+ap; }

  // sideDisplay with a "via Gn" note for resolved advancement refs (matches D27).
  function sideDisplay(t, raw){
    var ref = parseRef(raw);
    if (ref.kind==='team') return { name: ref.name };
    if (ref.kind==='bye') return { name:'BYE', tbd:true, bye:true };
    if (ref.kind==='tbd') return { name: ref.label||'TBD', tbd:true };
    var resolved = SB.resolveSide(t, ref, new Set());
    if (resolved) return { name: resolved, via:'G'+ref.g };
    return { name: (ref.kind==='WG'?'Winner':'Loser')+' G'+ref.g, tbd:true };
  }

  function matchHTML(t, g, cls, x, y){
    var A = sideDisplay(t, g.away), H = sideDisplay(t, g.home);
    var played = SB.isPlayed(g), aWin = played && g.away_score>g.home_score, hWin = played && g.home_score>g.away_score;
    function side(s, sc, win){
      var nm = esc(s.name);
      if (LINK_TEAMS && !s.tbd && !s.bye) {
        var hslug = TEAM_HREF ? TEAM_HREF(s.name) : slugify(s.name);   // resolver → null = no team page → plain text
        if (hslug) nm = '<a class="bk-tlink" href="team.html?id='+esc(hslug)+'" onclick="event.stopPropagation()">'+esc(s.name)+'</a>';
      }
      return '<div class="bk-side'+(win?' win':'')+(s.tbd?' tbd':'')+(s.bye?' bye':'')+'"'+((!s.tbd)?' data-team="'+esc(s.name)+'"':'')+'>'+
        '<span class="nm">'+nm+(s.via?'<span class="via">via '+esc(s.via)+'</span>':'')+'</span>'+
        '<span class="sc">'+(sc!=null?sc:'')+'</span></div>';
    }
    var tag = cls==='f'?'<span class="tag f">🏆 Final</span>':cls==='l'?'<span class="tag l">Losers</span>':'<span class="tag w">Winners</span>';
    var cd = (g.date && !/^(n\/?a|tbd|tba)$/i.test(g.date)) ? new Date(g.date+'T12:00:00') : null;
    var dStr = (cd&&!isNaN(cd)) ? cd.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) : '';
    var ts = g.time ? (GLEN ? fmtTime(g.time)+'–'+fmtTime(addMin(g.time,GLEN)) : fmtTime(g.time)) : null;
    var when = [dStr||null, ts].filter(Boolean).join(' · ');
    var field = g.field?String(g.field):'';
    var fieldLabel = field ? (VENUE ? VENUE+' · '+field : field) : '';
    var fieldQuery = [field, VENUE].filter(Boolean).join(', ');
    // field name links to its map on the Locations page (don't trigger the card's modal)
    var fieldHTML = field ? '<a class="bk-field" href="locations.html?find='+encodeURIComponent(fieldQuery)+'" onclick="event.stopPropagation()">📍 '+esc(fieldLabel)+'</a>' : '<span class="bk-field"></span>';
    // show the date even after a game is final (was just "Final" before)
    var whenHTML = played ? '<span class="fin">Final</span>'+(dStr?' · '+esc(dStr):'') : esc(when||'TBD');
    return '<div class="bk-match acc-'+cls+'" data-g="'+g.g+'" style="left:'+x+'px;top:'+y+'px">'+
      '<div class="bk-mtop"><span class="g">Game '+g.g+'</span>'+tag+'</div>'+
      side(A, g.away_score, aWin)+side(H, g.home_score, hWin)+
      '<div class="bk-mfoot"><div class="bk-when">'+whenHTML+'</div>'+
      '<div class="bk-frow">'+fieldHTML+'<span class="bk-cue">'+(played?'Recap':'Preview')+' ›</span></div></div></div>';
  }

  // columns by distance-to-final within a subset (play-ins get their own early column)
  function colsFromEnd(t, games){
    var inSet = {}; games.forEach(function(g){ inSet[g.g]=1; });
    var consumer = {};
    games.forEach(function(c){ [c.away,c.home].forEach(function(raw){ var r=parseRef(raw); if(r.kind==='WG'&&inSet[r.g]) consumer[r.g]=c.g; }); });
    var rank = {}, guard = {};
    function rk(n){ if(rank[n]!=null) return rank[n]; if(guard[n]) return 0; guard[n]=1; var c=consumer[n]; rank[n]=(c!=null&&inSet[c])?1+rk(c):0; return rank[n]; }
    games.forEach(function(g){ rk(g.g); });
    var maxRank = Math.max.apply(null, [0].concat(games.map(function(g){ return rank[g.g]||0; })));
    var col = {}; games.forEach(function(g){ col[g.g] = maxRank-(rank[g.g]||0)+1; });
    return col;
  }

  function layoutSection(t, games){
    var inSet = {}; games.forEach(function(g){ inSet[g.g]=1; });
    var depth = colsFromEnd(t, games);
    var SLOT = CARD_H + ROW_GAP;
    function kidsOf(n){ var g=gameByNum(t,n); if(!g) return []; var ks=[]; [g.away,g.home].forEach(function(raw){ var r=parseRef(raw); if((r.kind==='WG'||r.kind==='LG')&&inSet[r.g]) ks.push(r.g); }); return ks; }
    var consumed = {}; games.forEach(function(g){ kidsOf(g.g).forEach(function(k){ consumed[k]=1; }); });
    var roots = games.map(function(g){ return g.g; }).filter(function(n){ return !consumed[n]; }).sort(function(a,b){ return a-b; });
    var cen = {}, leaf = 0, guard = {};
    function place(n){
      if (cen[n]!=null) return cen[n];
      if (guard[n]) return (cen[n] = Y_PAD + (leaf++)*SLOT + CARD_H/2);
      guard[n]=1;
      var ks = kidsOf(n);
      var c = ks.length ? (function(){ var cs=ks.map(place); return (Math.min.apply(null,cs)+Math.max.apply(null,cs))/2; })() : (Y_PAD + (leaf++)*SLOT + CARD_H/2);
      return (cen[n]=c);
    }
    roots.forEach(place);
    games.forEach(function(g){ if(cen[g.g]==null) place(g.g); });
    var pos = {};
    games.forEach(function(g){ pos[g.g] = { x: ((depth[g.g]||1)-1)*(CARD_W+COL_GAP), y: cen[g.g]-CARD_H/2, h: CARD_H, col: depth[g.g]||1 }; });
    var byCol = {};
    games.forEach(function(g){ var r=depth[g.g]||1; (byCol[r]=byCol[r]||[]).push(g.g); });
    for (var r in byCol){
      var list = byCol[r].sort(function(a,b){ return pos[a].y-pos[b].y; });
      for (var i=1;i<list.length;i++){ var minY=pos[list[i-1]].y+pos[list[i-1]].h+ROW_GAP; if(pos[list[i]].y<minY) pos[list[i]].y=minY; }
    }
    return pos;
  }

  function combinedCanvas(t, cls, visible){
    var REGION_GAP = 64;
    var W = visible.filter(function(g){ return cls[g.g]==='w'; });
    var L = visible.filter(function(g){ return cls[g.g]==='l'; });
    var F = visible.filter(function(g){ return cls[g.g]==='f'; }).sort(function(a,b){ return a.g-b.g; });
    var pos = {}, posW = layoutSection(t, W), winnersH = 0, winnersMaxCol = 0;
    for (var k in posW){ pos[k]=posW[k]; winnersH=Math.max(winnersH,posW[k].y+posW[k].h); winnersMaxCol=Math.max(winnersMaxCol,posW[k].col); }
    var losersOffsetY = winnersH + REGION_GAP, losersMaxCol = 0;
    if (L.length){
      var posL = layoutSection(t, L);
      var wcol = {}; W.forEach(function(g){ wcol[g.g]=posW[g.g].col; });
      var Lset = {}; L.forEach(function(g){ Lset[g.g]=1; });
      var offCol = 0;
      L.forEach(function(g){
        var wMax=0, hasL=false;
        [g.away,g.home].forEach(function(raw){ var r=parseRef(raw); if(r.kind==='WG'||r.kind==='LG'){ if(Lset[r.g]) hasL=true; else if(r.kind==='LG'&&wcol[r.g]!=null) wMax=Math.max(wMax,wcol[r.g]); } });
        if (wMax && !hasL) offCol = Math.max(offCol, wMax - posL[g.g].col);
      });
      var dx = Math.max(0,offCol)*(CARD_W+COL_GAP);
      for (var k2 in posL){ pos[k2]={ x:posL[k2].x+dx, y:posL[k2].y+losersOffsetY, h:posL[k2].h, col:posL[k2].col+offCol }; losersMaxCol=Math.max(losersMaxCol,posL[k2].col+offCol); }
    }
    var fcol = Math.max(winnersMaxCol, losersMaxCol) + 1;
    F.forEach(function(g){
      var fc = feeders(g).map(function(n){ return pos[n]; }).filter(Boolean).map(function(p){ return p.y+p.h/2; });
      var cy = fc.length ? (Math.min.apply(null,fc)+Math.max.apply(null,fc))/2 : losersOffsetY/2 + Y_PAD;
      pos[g.g] = { x:(fcol-1)*(CARD_W+COL_GAP), y:cy-CARD_H/2, h:CARD_H, col:fcol }; fcol++;
    });
    var maxX = 0, maxY = 0;
    for (var k3 in pos){ maxX=Math.max(maxX,pos[k3].x+CARD_W); maxY=Math.max(maxY,pos[k3].y+pos[k3].h); }
    var wgFeeders = function(g){ var o=[]; [g.away,g.home].forEach(function(raw){ var r=parseRef(raw); if(r.kind==='WG') o.push(r.g); }); return o; };
    var lineColor = function(kk){ return kk==='f'?'#C9A227':kk==='l'?'rgba(191,10,48,.55)':'rgba(0,45,114,.5)'; };
    var paths = '';
    visible.forEach(function(g){
      var p=pos[g.g]; if(!p) return;
      wgFeeders(g).forEach(function(fn){
        var fp=pos[fn]; if(!fp) return;
        var x1=fp.x+CARD_W, y1=fp.y+fp.h/2, x2=p.x, y2=p.y+p.h/2, mx=x1+(x2-x1)/2;
        var sw = cls[g.g]==='f'?2.5:2;
        paths += '<path d="M'+x1+','+y1+' H'+mx+' V'+y2+' H'+x2+'" fill="none" stroke="'+lineColor(cls[g.g])+'" stroke-width="'+sw+'"/>';
      });
    });
    var cards = '';
    visible.forEach(function(g){ var p=pos[g.g]; if(p) cards += matchHTML(t, g, cls[g.g], p.x, p.y); });
    var labels = '';
    if (L.length){
      labels += '<div class="bk-region w" style="left:0;top:2px">Winners Bracket</div>';
      labels += '<div class="bk-region l" style="left:0;top:'+(losersOffsetY-20)+'px">Losers Bracket</div>';
      if (F.length){ var fp0=pos[F[0].g]; if(fp0) labels += '<div class="bk-region f" style="left:'+fp0.x+'px;top:'+(fp0.y-22)+'px">Championship</div>'; }
    }
    var H = maxY + Y_PAD;
    return '<div class="bk-scroll"><div class="bk-canvas" style="width:'+maxX+'px;height:'+H+'px"><svg width="'+maxX+'" height="'+H+'">'+paths+'</svg>'+labels+cards+'</div></div>';
  }

  function championBanner(champ, tourn){
    return '<div class="bk-champion"><span class="trophy"><img src="assets/trophy.png" alt="Trophy" style="height:clamp(104px,16vw,132px);width:auto;vertical-align:middle;display:block" onerror="this.outerHTML=\'🏆\'"></span><div class="ct">'+
      (tourn?'<div class="tourn">'+esc(tourn)+'</div>':'')+
      '<div class="lbl">★ Tournament Champion ★</div>'+
      '<div class="team">'+esc(champ)+'</div></div></div>';
  }

  function render(games, meta){
    meta = meta || {};
    LINK_TEAMS = !!meta.teamLinks;
    GLEN = (meta.gameLengthMin) || 0;
    TEAM_HREF = (typeof meta.teamHref === 'function') ? meta.teamHref : null;
    VENUE = meta.venue ? String(meta.venue).split(',')[0].trim() : '';
    if (!games || !games.length) return '<div class="bk-empty">No bracket games yet.</div>';
    var t = { games: games };
    var cls = SB.classify(t);
    var outcome = SB.championOutcome(t, cls);
    var visible = games.filter(function(g){ return !outcome.hide.has(g.g); });
    var html = '';
    if (outcome.champion) html += championBanner(outcome.champion, meta.name||'');
    html += combinedCanvas(t, cls, visible);
    return html;
  }

  // hover a team → highlight its whole path through the bracket
  function wireHover(rootEl){
    var cur = null;
    function clearHi(){ rootEl.querySelectorAll('.bk-side.path-hi').forEach(function(el){ el.classList.remove('path-hi'); }); }
    rootEl.addEventListener('mouseover', function(e){
      var side = e.target.closest ? e.target.closest('.bk-side[data-team]') : null;
      var team = side ? side.getAttribute('data-team') : null;
      if (team===cur) return; cur=team; clearHi();
      if (team) rootEl.querySelectorAll('.bk-side[data-team]').forEach(function(el){ if(el.getAttribute('data-team')===team) el.classList.add('path-hi'); });
    });
    rootEl.addEventListener('mouseleave', function(){ cur=null; clearHi(); });
  }

  global.STSbracketRender = { render: render, championBanner: championBanner, canvas: combinedCanvas, wireHover: wireHover };
})(typeof window !== 'undefined' ? window : globalThis);
