// ─────────────────────────────────────────────────────────────────────
// Click-a-game modal — a PREVIEW before a game starts, a RECAP once final.
// Ported from the D27 game modal; uses window.STSbracket for bracket
// resolution and STSBT game fields (away_score/home_score/done, g, away/home).
//
//   STSgameModal.open(tournamentName, games, game)
//   STSgameModal.bind(rootEl, tournamentName, games)   // wire [data-g] clicks
// ─────────────────────────────────────────────────────────────────────
(function (global) {
  var SB = global.STSbracket;
  function esc(s){ return s==null?'':String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function clean(s){ if(s==null) return ''; var t=String(s).trim(); return /^(n\/?a|tbd|tba|-+)$/i.test(t)?'':t; }
  var GM_VENUE = '';   // host city to prefix field names (set per open())
  // Field name as a link to its map on the Locations page (don't close the modal on click).
  function fieldLink(field){ var f=clean(field); if(!f) return ''; var label=GM_VENUE?GM_VENUE+' · '+f:f, query=[f,GM_VENUE].filter(Boolean).join(', '); return '<a class="gm-fieldlink" href="locations.html?find='+encodeURIComponent(query)+'" onclick="event.stopPropagation()">📍 '+esc(label)+'</a>'; }
  function fmtTime(t){ t=clean(t); if(!t) return ''; var p=String(t).split(':'); var h=+p[0],m=p[1]||'00'; if(isNaN(h)) return ''; var ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+m+' '+ap; }
  function fmtDate(d, opt){ d=clean(d); if(!d) return ''; var dt=new Date(d+'T12:00:00'); if(isNaN(dt)) return ''; return dt.toLocaleDateString('en-US', opt||{weekday:'short',month:'short',day:'numeric'}); }
  function slug(s){ return String(s==null?'':s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  // team name as a link to its page — unless it's a placeholder (TBD / BYE / Winner-of-Game)
  function tnHTML(name, tbd){
    var n=esc(name), raw=String(name==null?'':name).trim();
    if(tbd || !clean(raw) || /^(tbd|bye)$/i.test(raw) || /^(winner|loser) of game/i.test(raw))
      return '<span class="gm-tn">'+n+'</span>';
    return '<a class="gm-tn gm-tlink" href="team.html?id='+esc(slug(raw))+'" onclick="event.stopPropagation()">'+n+'</a>';
  }
  function isPlaceholder(name, tbd){ var raw=String(name==null?'':name).trim(); return !!(tbd || !clean(raw) || /^(tbd|bye)$/i.test(raw) || /^(winner|loser) of game/i.test(raw)); }
  // deterministic team color from the name — vivid, jersey-like, stable per team (no manual logos)
  function teamHash(name){ var h=0, s=String(name||''); for(var i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))>>>0; } return h; }
  function teamColor(name, shift){ var h=teamHash(name); var hue=(((h%360)+(shift||0))%360+360)%360; return 'hsl('+hue+','+(60+(h>>3)%20)+'%,'+(34+(h>>5)%12)+'%)'; }
  function teamHue(name){ return teamHash(name)%360; }
  function hueGap(a,b){ var d=Math.abs(a-b)%360; return Math.min(d,360-d); }
  function monogram(name){ var w=String(name||'').replace(/[^A-Za-z0-9 ]/g,'').split(/\s+/).filter(function(x){ return x && !/^(the|of|a|an)$/i.test(x); }); if(!w.length) return '?'; return (w.length===1 ? w[0].slice(0,2) : (w[0][0]+w[w.length-1][0])).toUpperCase(); }
  function badgeHTML(name, tbd, shift){ if(isPlaceholder(name,tbd)) return '<span class="gm-badge2 ph">?</span>'; return '<span class="gm-badge2" style="background:'+teamColor(name,shift)+'">'+esc(monogram(name))+'</span>'; }
  // when two teams' colors are too close, rotate the home badge so they read apart
  function homeShift(An, Hn){ return hueGap(teamHue(An), teamHue(Hn)) < 35 ? 60 : 0; }
  // Scoreboard matchup header (navy) for previews
  function matchupHeader(An, At, Hn, Ht){
    var hs=homeShift(An,Hn);
    return '<div class="gm-sb">'+
      '<div class="gm-sb-row">'+badgeHTML(An,At)+tnHTML(An,At)+'</div>'+
      '<div class="gm-sb-vs">VS</div>'+
      '<div class="gm-sb-row">'+badgeHTML(Hn,Ht,hs)+tnHTML(Hn,Ht)+'</div></div>';
  }
  // Scoreboard with scores (recaps) — winner's name + score go gold
  function scoreboard(An, At, as, Hn, Ht, hs){
    var aWin=as>hs, hWin=hs>as, sh=homeShift(An,Hn);
    return '<div class="gm-sb">'+
      '<div class="gm-sb-final">Final</div>'+
      '<div class="gm-sb-srow'+(aWin?' win':'')+'">'+badgeHTML(An,At)+tnHTML(An,At)+'<span class="gm-sb-sc">'+as+'</span></div>'+
      '<div class="gm-sb-srow'+(hWin?' win':'')+'">'+badgeHTML(Hn,Ht,sh)+tnHTML(Hn,Ht)+'<span class="gm-sb-sc">'+hs+'</span></div></div>';
  }
  function metaBar(g){
    var when=[fmtDate(g.date),fmtTime(g.time)].filter(Boolean).join(' · '), f=clean(g.field);
    var bits=[when||'', f?fieldLink(f):''].filter(Boolean).join(' &nbsp;·&nbsp; ');
    return '<div class="gm-sb-meta">'+(bits||'Date &amp; time TBD')+'</div>';
  }

  function parseRef(s){ return SB.parseRef(s); }
  function gByNum(t,n){ return (t.games||[]).find(function(g){ return g.g===n; }); }
  function isPlayed(g){ return SB.isPlayed(g); }
  function feeders(g){ var o=[]; [g.away,g.home].forEach(function(raw){ var r=parseRef(raw); if(r.kind==='WG'||r.kind==='LG') o.push(r.g); }); return o; }
  function isByeSlot(s){ return parseRef(s).kind==='bye'; }
  function resolveSide(t, raw){ return SB.resolveSide(t, parseRef(raw), new Set()); }
  function sideDisplay(t, raw){
    var r=parseRef(raw);
    if(r.kind==='team') return { name:r.name };
    if(r.kind==='bye') return { name:'BYE', tbd:true };
    if(r.kind==='tbd') return { name:r.label||'TBD', tbd:true };
    var res=SB.resolveSide(t, r, new Set());
    if(res) return { name:res };
    return { name:(r.kind==='WG'?'Winner of Game ':'Loser of Game ')+r.g, tbd:true };
  }
  function computeRounds(t){ return SB.rounds(t); }
  function classify(t){ return SB.classify(t); }
  function isDoubleElim(cls){ return Object.keys(cls).some(function(k){ return cls[k]==='l'; }); }
  function nextGameOf(t,n){ return (t.games||[]).find(function(x){ return [x.away,x.home].some(function(s){ var r=parseRef(s); return r.kind==='WG'&&r.g===n; }); }); }
  function deepestOf(t,cls,c){ var r=computeRounds(t), best=null, bd=-1; (t.games||[]).forEach(function(g){ if(cls[g.g]===c&&(r[g.g]||1)>bd){ bd=r[g.g]||1; best=g.g; } }); return best; }
  function sectionLabel(t,g,cls){ var c=cls[g.g]; if(c==='f') return 'Championship'; if(c==='l') return 'Losers Bracket'; return isDoubleElim(cls)?'Winners Bracket':(g.g!=null?'Bracket':'Pool Play'); }

  function recapTemplate(t,g,cls){
    var next=nextGameOf(t,g.g);
    if(isByeSlot(g.away)||isByeSlot(g.home)){ var adv=isByeSlot(g.away)?g.home:g.away; var team=resolveSide(t,adv)||sideDisplay(t,adv).name; return next?(team+' drew a bye and advanced to Game '+next.g+'.'):(team+' drew a bye and is the '+t.name+' champion.'); }
    var A=resolveSide(t,g.away)||sideDisplay(t,g.away).name, H=resolveSide(t,g.home)||sideDisplay(t,g.home).name;
    var as=g.away_score, hs=g.home_score;
    if(as===hs) return A+' and '+H+' played to a '+as+'–'+hs+' tie in Game '+g.g+'.';
    var aWin=as>hs, winner=aWin?A:H, loser=aWin?H:A, ws=Math.max(as,hs), ls=Math.min(as,hs), margin=ws-ls;
    var verb=margin>=10?'routed':margin>=6?'rolled past':margin>=3?'beat':margin===2?'got past':'edged';
    var when=fmtDate(g.date,{month:'long',day:'numeric'}), whenS=when?' on '+when:'', field=clean(g.field), where=field?' at '+field:'';
    var s1=winner+' '+verb+' '+loser+' '+ws+'–'+ls+whenS+where+'.';
    var c=cls[g.g], dbl=isDoubleElim(cls);
    var fG=(t.games||[]).filter(function(x){ return cls[x.g]==='f'; }).sort(function(a,b){ return a.g-b.g; });
    var champG=fG.length?fG[0].g:null, wbF=deepestOf(t,cls,'w'), lbF=deepestOf(t,cls,'l'), s2;
    if(c==='f') s2=next?(winner+' takes Game '+g.g+' of the championship.'):(winner+' is the '+t.name+' champion.');
    else if(next&&next.g===champG) s2=winner+' advances to the championship game.';
    else if(next&&next.g===wbF) s2=winner+' moves on to the Winners Bracket final.';
    else if(next&&next.g===lbF) s2=winner+' advances to the Losers Bracket final.';
    else if(next) s2=winner+' moves on to Game '+next.g+'.';
    else s2=winner+' advances.';
    var s3='';
    if(c==='l') s3=loser+"'s tournament run ends.";
    else if(c==='w'&&dbl) s3=loser+' drops to the losers bracket for another shot.';
    else if(c==='w'&&!dbl) s3=loser+' is eliminated.';
    return [s1,s2,s3].filter(Boolean).join(' ');
  }
  function previewBlurb(t,g,cls){
    var A=sideDisplay(t,g.away), H=sideDisplay(t,g.home);
    if(isByeSlot(g.away)||isByeSlot(g.home)){ var adv=isByeSlot(g.away)?g.home:g.away, nx=nextGameOf(t,g.g); return sideDisplay(t,adv).name+' draws a bye and moves on'+(nx?' to Game '+nx.g:'')+'.'; }
    var dbl=isDoubleElim(cls), c=cls[g.g];
    var fGames=(t.games||[]).filter(function(x){ return cls[x.g]==='f'; }).sort(function(a,b){ return a.g-b.g; });
    var champG=fGames.length?fGames[0].g:null, wbF=deepestOf(t,cls,'w'), lbF=deepestOf(t,cls,'l');
    var isR1=feeders(g).length===0, next=nextGameOf(t,g.g);
    var matchup=A.name+' and '+H.name;
    var when=fmtDate(g.date,{weekday:'long',month:'long',day:'numeric'}), time=fmtTime(g.time);
    var whenT=when?(when+(time?' at '+time:'')):'', tail=[whenT?'on '+whenT:'', clean(g.field)?'at '+clean(g.field):''].filter(Boolean).join(' '), ts=tail?' '+tail:'';
    if(g.g===champG) return "It's the championship — "+matchup+' meet for the '+t.name+' title'+ts+'.'+(dbl?' The Winners Bracket champ needs one win; the Losers Bracket survivor must win twice.':' Win it all, or go home.');
    if(c==='f') return 'Winner-take-all: '+matchup+' play the if-necessary game to decide the championship'+ts+'.';
    var s1;
    if(g.g===wbF) s1=matchup+' meet in the Winners Bracket final'+ts+'.';
    else if(g.g===lbF) s1=matchup+' meet in the Losers Bracket final'+ts+'.';
    else if(c==='l') s1=matchup+' square off in a Losers Bracket elimination game'+ts+'.';
    else if(isR1&&g.g==null) s1=matchup+' meet in pool play'+ts+'.';
    else if(isR1) s1=matchup+(dbl?' get Winners Bracket play started':' open the '+t.name)+ts+'.';
    else s1=matchup+' meet in the '+(dbl?'Winners Bracket':t.name)+ts+'.';
    var stake;
    if(g.g==null) stake='Pool results seed the bracket.';
    else if(!next) stake='The winner is the '+t.name+' champion.';
    else if(next.g===champG) stake='The winner advances to the championship game.';
    else if(next.g===wbF) stake='The winner moves on to the Winners Bracket final.';
    else if(next.g===lbF) stake='The winner advances to the Losers Bracket final.';
    else stake='The winner advances to Game '+next.g+'.';
    var fate='';
    if(c==='w'&&dbl) fate=" The loser isn't done — they drop to the Losers Bracket.";
    else if(c==='l') fate=' The loser is eliminated.';
    else if(c==='w'&&!dbl&&g.g!=null) fate=' Win-or-go-home.';
    return s1+' '+stake+fate;
  }
  function previewHTML(t,g,cls){
    var A=sideDisplay(t,g.away), H=sideDisplay(t,g.home);
    return matchupHeader(A.name,A.tbd,H.name,H.tbd)+metaBar(g)+
      '<div class="gm-sec"><h4>Preview</h4><p class="gm-recap">'+esc(previewBlurb(t,g,cls))+'</p></div>';
  }
  // ── plain (non-bracket) game text — no bracket stage/stakes, no advance/eliminate ──
  function poolText(g, played){
    var A=clean(g.away)||'TBD', H=clean(g.home)||'TBD';
    if(!played){
      var when=fmtDate(g.date,{weekday:'long',month:'long',day:'numeric'}), time=fmtTime(g.time), field=clean(g.field);
      var whenT=when?(when+(time?' at '+time:'')):'';
      var tail=[whenT?'on '+whenT:'', field?'at '+field:''].filter(Boolean).join(' ');
      return A+' take on '+H+(tail?' '+tail:'')+'.';
    }
    var as=g.away_score, hs=g.home_score;
    if(as===hs) return A+' and '+H+' played to a '+as+'–'+hs+' tie.';
    var aWin=as>hs, w=aWin?A:H, l=aWin?H:A, ws=Math.max(as,hs), ls=Math.min(as,hs), margin=ws-ls;
    var verb=margin>=10?'routed':margin>=6?'rolled past':margin>=3?'beat':margin===2?'got past':'edged';
    var when2=fmtDate(g.date,{month:'long',day:'numeric'}), whenS=when2?' on '+when2:'', field2=clean(g.field), where=field2?' at '+field2:'';
    return w+' '+verb+' '+l+' '+ws+'–'+ls+whenS+where+'.';
  }
  function poolPreviewHTML(g){
    var A=clean(g.away)||'TBD', H=clean(g.home)||'TBD';
    return matchupHeader(A,false,H,false)+metaBar(g)+
      '<div class="gm-sec"><h4>Preview</h4><p class="gm-recap">'+esc(poolText(g,false))+'</p></div>';
  }
  function poolRecapHTML(g){
    var A=clean(g.away)||'TBD', H=clean(g.home)||'TBD';
    return scoreboard(A,false,g.away_score,H,false,g.home_score)+metaBar(g)+
      '<div class="gm-sec"><h4>Recap</h4><p class="gm-recap">'+esc(poolText(g,true))+'</p></div>';
  }

  function recapHTML(t,g,cls){
    var text=recapTemplate(t,g,cls);
    if(isByeSlot(g.away)||isByeSlot(g.home)){ var nm=sideDisplay(t,isByeSlot(g.away)?g.home:g.away).name; return '<div class="gm-byewrap"><div class="gm-team">'+tnHTML(nm)+'</div><div class="gm-meta">'+(nextGameOf(t,g.g)?'Advanced on a bye':'Champion')+'</div></div><div class="gm-sec"><h4>Recap</h4><p class="gm-recap">'+esc(text)+'</p></div>'; }
    var A=sideDisplay(t,g.away), H=sideDisplay(t,g.home);
    return scoreboard(A.name,A.tbd,g.away_score,H.name,H.tbd,g.home_score)+metaBar(g)+
      '<div class="gm-sec"><h4>Recap</h4><p class="gm-recap">'+esc(text)+'</p></div>';
  }

  var overlay=null;
  function close(){ if(overlay){ overlay.classList.remove('open'); document.body.style.overflow=''; } }
  function ensureShell(){
    if(overlay) return overlay;
    overlay=document.createElement('div'); overlay.className='gm-overlay';
    overlay.innerHTML='<div class="gm-card" role="dialog" aria-modal="true" aria-label="Game details"><button class="gm-close" aria-label="Close">✕</button><div class="gm-head"><div class="gm-crumb"></div><span class="gm-badge"></span></div><div class="gm-body"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e){ if(e.target===overlay) close(); });
    overlay.querySelector('.gm-close').addEventListener('click', close);
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') close(); });
    return overlay;
  }
  function open(tournamentName, games, game, venue){
    if(!game) return; ensureShell();
    GM_VENUE = venue ? String(venue).split(',')[0].trim() : '';
    var name=tournamentName||'Tournament';
    var isBracket=game.g!=null;
    var played=isPlayed(game), crumb, body;
    if(isBracket){
      // resolve only against bracket games (drop any pool/regular games so the
      // null-keyed games can't bleed bracket framing into the classification)
      var bg=(games||[]).filter(function(x){ return x.g!=null; });
      var t={ name:name, games:bg };
      var gg=bg.find(function(x){ return x.g===game.g; }) || game;
      var cls=classify(t); played=isPlayed(gg);
      crumb=esc(name)+' &nbsp;·&nbsp; '+sectionLabel(t,gg,cls)+' &nbsp;·&nbsp; Game '+gg.g;
      body=played?recapHTML(t,gg,cls):previewHTML(t,gg,cls);
    } else {
      var div=clean(game.division);
      crumb=esc(name)+(div?' &nbsp;·&nbsp; '+esc(div):'');
      body=played?poolRecapHTML(game):poolPreviewHTML(game);
    }
    overlay.querySelector('.gm-crumb').innerHTML=crumb;
    var badge=overlay.querySelector('.gm-badge'); badge.textContent=played?'Final':'Preview'; badge.className='gm-badge '+(played?'final':'preview');
    overlay.querySelector('.gm-body').innerHTML=body;
    overlay.classList.add('open'); document.body.style.overflow='hidden';
    overlay.querySelector('.gm-close').focus();
  }
  // wire clicks on [data-g] elements within rootEl → open the matching game
  function bind(rootEl, tournamentName, games){
    rootEl.addEventListener('click', function(e){
      var card=e.target.closest('[data-g]'); if(!card) return;
      var gn=card.getAttribute('data-g'); var g=(games||[]).find(function(x){ return String(x.g)===String(gn); });
      if(g){ e.preventDefault(); open(tournamentName, games, g); }
    });
  }

  global.STSgameModal={ open:open, bind:bind };
})(window);
