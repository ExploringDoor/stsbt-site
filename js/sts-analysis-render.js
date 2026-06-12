// ─────────────────────────────────────────────────────────────────────
// Renders the schedule-analysis reports from a STSanalysis.compute(games)
// report object into HTML. Used by the admin dashboard (director QA tool).
//   STSanalysisRender.render(report) -> HTML string (chips + 6 tables)
//   STSanalysisRender.empty() -> empty-state HTML
// ─────────────────────────────────────────────────────────────────────
(function (global) {
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function dayHdr(d){ if(!d) return 'TBD'; var dt=new Date(d+'T12:00:00'); if(isNaN(dt)) return d; return DOW[dt.getDay()]+' '+(dt.getMonth()+1)+'/'+dt.getDate(); }
  function chip(n,l){ return '<div class="an-chip"><span class="n">'+esc(n)+'</span><span class="l">'+esc(l)+'</span></div>'; }

  function tHomeAway(R){
    var body=R.teams.map(function(tm){
      var h=R.ha[tm], imb=Math.abs(h.home-h.away)>=2;
      return '<tr><td class="team">'+esc(tm)+'</td><td>'+h.home+'</td><td>'+h.away+'</td><td class="tot'+(imb?' warn':'')+'">'+(h.home-h.away>0?'+':'')+(h.home-h.away)+'</td><td class="tot">'+h.total+'</td></tr>';
    }).join('');
    return '<div class="an-card"><h2>Home / Away Balance</h2><p class="sub">How many times each team is the home vs. away team. A balanced schedule keeps the difference near zero.</p>'+
      '<div class="an-scroll"><table class="an"><thead><tr><th class="team">Team</th><th>Home</th><th>Away</th><th class="tot">Diff</th><th class="tot">Games</th></tr></thead><tbody>'+body+'</tbody></table></div>'+
      '<div class="an-key"><span><i style="background:rgba(201,162,39,.16)"></i> Difference of 2+ games</span></div></div>';
  }
  function tPerDay(R){
    if(!R.days.length) return '';
    var head=R.days.map(function(d){ return '<th>'+esc(dayHdr(d))+'</th>'; }).join('');
    var body=R.teams.map(function(tm){
      var tot=0;
      var cells=R.days.map(function(d){ var n=R.perDay[tm][d]||0; tot+=n; return '<td class="'+(n===0?'zero':(n>=2?'hot':''))+'">'+n+'</td>'; }).join('');
      return '<tr><td class="team">'+esc(tm)+'</td>'+cells+'<td class="tot">'+tot+'</td></tr>';
    }).join('');
    return '<div class="an-card"><h2>Games Per Day</h2><p class="sub">Games each team plays on each date. Highlighted cells are doubleheaders (2+ games in one day).</p>'+
      '<div class="an-scroll"><table class="an"><thead><tr><th class="team">Team</th>'+head+'<th class="tot">Total</th></tr></thead><tbody>'+body+'</tbody></table></div>'+
      '<div class="an-key"><span><i style="background:rgba(0,112,243,.14)"></i> Doubleheader (2+ games)</span></div></div>';
  }
  function tTimes(R){
    if(!R.times.length) return '';
    var head=R.times.map(function(t){ return '<th>'+esc(R.fmtTime(t))+'</th>'; }).join('');
    var body=R.teams.map(function(tm){
      var cells=R.times.map(function(t){ var n=R.timeDist[tm][t]||0; return '<td class="'+(n===0?'zero':'')+'">'+n+'</td>'; }).join('');
      return '<tr><td class="team">'+esc(tm)+'</td>'+cells+'</tr>';
    }).join('');
    return '<div class="an-card"><h2>Game Time Distribution</h2><p class="sub">How often each team plays in each time slot — surfaces a team stuck with all the early or late games.</p>'+
      '<div class="an-scroll"><table class="an"><thead><tr><th class="team">Team</th>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div></div>';
  }
  function tOpponents(R){
    if(R.teams.length<2) return '';
    var head=R.teams.map(function(t){ return '<th>'+esc(t)+'</th>'; }).join('');
    var body=R.teams.map(function(tm){
      var cells=R.teams.map(function(op){
        if(op===tm) return '<td class="diag"></td>';
        var n=(R.opp[tm]&&R.opp[tm][op])||0;
        return '<td class="'+(n===0?'zero':(n>=2?'hot':''))+'">'+n+'</td>';
      }).join('');
      return '<tr><td class="team">'+esc(tm)+'</td>'+cells+'</tr>';
    }).join('');
    var repeats=R.teams.filter(function(tm){ return R.oppSummary[tm].maxRepeat>=2; }).length;
    var note=repeats? '<p class="sub" style="margin-top:10px;color:#8a6d10"><b>Heads up:</b> '+repeats+' team'+(repeats>1?'s play':' plays')+' the same opponent 2+ times.</p>':'<p class="sub" style="margin-top:10px;color:#047857">No team plays the same opponent more than once. ✓</p>';
    return '<div class="an-card"><h2>Opponent Distribution</h2><p class="sub">How many times each pair of teams meets. Highlighted cells are repeat matchups.</p>'+
      '<div class="an-scroll"><table class="an"><thead><tr><th class="team">Team \\ Opp</th>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div>'+note+'</div>';
  }
  function tOppsPerDay(R){
    if(!R.days.length) return '';
    var head=R.days.map(function(d){ return '<th>'+esc(dayHdr(d))+'</th>'; }).join('');
    var body=R.teams.map(function(tm){
      var cells=R.days.map(function(d){ var n=R.oppsPerDay[tm][d]||0; return '<td class="'+(n===0?'zero':'')+'">'+n+'</td>'; }).join('');
      return '<tr><td class="team">'+esc(tm)+'</td>'+cells+'</tr>';
    }).join('');
    return '<div class="an-card"><h2>Distinct Opponents Per Day</h2><p class="sub">Different teams each team faces on a given date — a quick read on schedule variety.</p>'+
      '<div class="an-scroll"><table class="an"><thead><tr><th class="team">Team</th>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div></div>';
  }
  function tDelays(R){
    var anyDH=R.teams.some(function(tm){ return R.dh[tm].total>0; });
    if(!anyDH) return '<div class="an-card"><h2>Doubleheader Delays</h2><p class="sub">No team plays two games in the same day yet — no doubleheaders to analyze.</p></div>';
    var gaps=[]; for(var i=0;i<=R.maxGap;i++) gaps.push(i);
    var head=gaps.map(function(g){ return '<th>'+(g===0?'Back-to-back':g+' slot'+(g>1?'s':'')+' apart')+'</th>'; }).join('');
    var body=R.teams.filter(function(tm){ return R.dh[tm].total>0; }).map(function(tm){
      var d=R.dh[tm];
      var cells=gaps.map(function(g){ var n=d.delays[g]||0; return '<td class="'+(n===0?'zero':(g>=2?'warn':''))+'">'+n+'</td>'; }).join('');
      return '<tr><td class="team">'+esc(tm)+'</td><td class="tot">'+d.total+'</td>'+cells+'</tr>';
    }).join('');
    return '<div class="an-card"><h2>Doubleheader Delays</h2><p class="sub">When a team plays twice in a day, how long they wait between games (in empty time slots). “Back-to-back” is ideal; longer gaps mean more downtime.</p>'+
      '<div class="an-scroll"><table class="an"><thead><tr><th class="team">Team</th><th class="tot">Doubleheaders</th>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div>'+
      '<div class="an-key"><span><i style="background:rgba(201,162,39,.16)"></i> 2+ slots of waiting</span></div></div>';
  }

  function empty(){
    return '<div class="an-empty"><h3 style="color:var(--sts-navy);margin:0 0 6px">Nothing to analyze yet</h3><p class="muted" style="text-transform:none;letter-spacing:0">This event has no games with two known teams yet. Once pool/bracket games are posted, the fairness reports build automatically.</p></div>';
  }
  function render(R){
    if(!R || !R.teams.length) return empty();
    var range = R.days.length ? (dayHdr(R.days[0]) + (R.days.length>1?' – '+dayHdr(R.days[R.days.length-1]):'')) : '—';
    var chips='<div class="an-chips">'+chip(R.teams.length,'Teams')+chip(R.gameCount,'Games')+chip(R.days.length||'—','Days')+chip(range,'Dates')+'</div>';
    return chips + tHomeAway(R) + tPerDay(R) + tTimes(R) + tOpponents(R) + tOppsPerDay(R) + tDelays(R);
  }

  global.STSanalysisRender = { render: render, empty: empty, dayHdr: dayHdr };
})(typeof window !== 'undefined' ? window : globalThis);
