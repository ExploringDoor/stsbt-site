// ─────────────────────────────────────────────────────────────────────
// Schedule analysis — the QuickScores "Schedule Analysis" fairness reports,
// computed from the games of one event (optionally one division):
//   • Home / Away balance
//   • Game-time (slot) distribution
//   • Opponent distribution (who plays whom, and how often)
//   • Games per day
//   • Distinct opponents per day
//   • Doubleheader delays (how long teams wait between same-day games)
//
// Pure: STSanalysis.compute(games) -> report object. Resolves WG-/LG- bracket
// refs via window.STSbracket so only concrete matchups are counted; games with
// an unresolved side (future bracket slot, bye, TBD) are skipped.
//   window.STSanalysis
// ─────────────────────────────────────────────────────────────────────
(function (global) {
  var SB = global.STSbracket;

  function fmtTime(t){ if(!t) return ''; var p=String(t).split(':'); var h=+p[0],m=p[1]||'00'; if(isNaN(h)) return String(t); var ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+m+' '+ap; }
  function uniqueSorted(arr){ var seen={},out=[]; arr.forEach(function(v){ if(v!=null&&v!==''&&!seen[v]){ seen[v]=1; out.push(v); } }); return out.sort(); }
  function clean(s){ if(s==null) return ''; var t=String(s).trim(); return /^(n\/?a|tbd|tba|-+)$/i.test(t)?'':t; }
  // resolve a side to a concrete team name, or null if it's a ref/bye/TBD we can't pin down
  function concreteName(t, raw){
    var v=clean(raw); if(!v) return null;
    if(!SB) return v;
    var sd=SB.sideDisplay(t, raw);
    return sd.tbd ? null : sd.name;
  }

  function compute(games){
    games = games || [];
    var refTable = { games: games.filter(function(g){ return g.g!=null; }) }; // for ref resolution only
    // build the list of concrete matchups
    var rows = [];
    games.forEach(function(g){
      var a = concreteName(refTable, g.away), h = concreteName(refTable, g.home);
      if(!a || !h || a===h) return;
      rows.push({ a:a, h:h, date:clean(g.date), time:clean(g.time), field:clean(g.field), played:(SB?SB.isPlayed(g):!!g.done) });
    });

    var teamSet={}; rows.forEach(function(r){ teamSet[r.a]=1; teamSet[r.h]=1; });
    var teams=Object.keys(teamSet).sort();
    var times=uniqueSorted(rows.map(function(r){ return r.time; }));
    var days=uniqueSorted(rows.map(function(r){ return r.date; }));

    // home / away
    var ha={}; teams.forEach(function(tm){ ha[tm]={home:0,away:0,total:0}; });
    rows.forEach(function(r){ ha[r.h].home++; ha[r.h].total++; ha[r.a].away++; ha[r.a].total++; });

    // time-slot distribution
    var timeDist={}; teams.forEach(function(tm){ timeDist[tm]={}; });
    rows.forEach(function(r){ if(r.time){ [r.a,r.h].forEach(function(tm){ timeDist[tm][r.time]=(timeDist[tm][r.time]||0)+1; }); } });

    // opponent matrix (symmetric counts)
    var opp={}; teams.forEach(function(tm){ opp[tm]={}; });
    rows.forEach(function(r){ opp[r.a][r.h]=(opp[r.a][r.h]||0)+1; opp[r.h][r.a]=(opp[r.h][r.a]||0)+1; });
    // per team: max times any single opponent is repeated, and # distinct opponents
    var oppSummary={}; teams.forEach(function(tm){ var c=opp[tm], ks=Object.keys(c); var mx=0; ks.forEach(function(k){ if(c[k]>mx) mx=c[k]; }); oppSummary[tm]={ distinct:ks.length, maxRepeat:mx }; });

    // games per day
    var perDay={}; teams.forEach(function(tm){ perDay[tm]={}; days.forEach(function(d){ perDay[tm][d]=0; }); });
    rows.forEach(function(r){ if(r.date){ [r.a,r.h].forEach(function(tm){ perDay[tm][r.date]=(perDay[tm][r.date]||0)+1; }); } });

    // distinct opponents per day
    var oppDay={}; teams.forEach(function(tm){ oppDay[tm]={}; });
    rows.forEach(function(r){ if(r.date){ (oppDay[r.a][r.date]=oppDay[r.a][r.date]||{})[r.h]=1; (oppDay[r.h][r.date]=oppDay[r.h][r.date]||{})[r.a]=1; } });
    var oppsPerDay={}; teams.forEach(function(tm){ oppsPerDay[tm]={}; days.forEach(function(d){ oppsPerDay[tm][d]= oppDay[tm][d]?Object.keys(oppDay[tm][d]).length:0; }); });

    // doubleheader delays — for each team & day with >=2 games, the gap (in empty
    // time-slots) between consecutive games. gap 0 = back-to-back adjacent slots.
    var slotIdx={}; // date -> {time -> index}
    days.forEach(function(d){ var ts=uniqueSorted(rows.filter(function(r){ return r.date===d; }).map(function(r){ return r.time; })); var m={}; ts.forEach(function(tt,i){ m[tt]=i; }); slotIdx[d]=m; });
    var dh={}, maxGap=0; teams.forEach(function(tm){ dh[tm]={ total:0, delays:{} }; });
    teams.forEach(function(tm){
      days.forEach(function(d){
        var idxs=rows.filter(function(r){ return r.date===d && (r.a===tm||r.h===tm) && r.time; })
                     .map(function(r){ return slotIdx[d][r.time]; })
                     .filter(function(i){ return i!=null; })
                     .sort(function(x,y){ return x-y; });
        for(var i=1;i<idxs.length;i++){
          dh[tm].total++;
          var gap=idxs[i]-idxs[i-1]-1; if(gap<0) gap=0;
          if(gap>maxGap) maxGap=gap;
          dh[tm].delays[gap]=(dh[tm].delays[gap]||0)+1;
        }
      });
    });

    return {
      teams: teams, times: times, days: days, gameCount: rows.length,
      ha: ha, timeDist: timeDist, opp: opp, oppSummary: oppSummary,
      perDay: perDay, oppsPerDay: oppsPerDay, dh: dh, maxGap: maxGap,
      fmtTime: fmtTime
    };
  }

  global.STSanalysis = { compute: compute, fmtTime: fmtTime };
})(typeof window !== 'undefined' ? window : globalThis);
