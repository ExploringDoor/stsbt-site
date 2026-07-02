// ─────────────────────────────────────────────────────────────────────────
// Shared "Who's Coming" popup — registered teams for a tournament, grouped by
// AGE GROUP by default (Keith combines classifications), or AGE + DIVISION when
// the form is flagged `separate_divisions` (special events). Used on the
// register page, the homepage Upcoming Tournaments cards, and the tournament
// info page. Reads the public `teams` collection (no coach PII).
// ─────────────────────────────────────────────────────────────────────────
import * as STS from './sts-data.js';

var CFG = (typeof window !== 'undefined' && window.LEAGUE_CONFIG) || {};
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }
function wslug(s){ return String(s == null ? '' : s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

var mounted = false;
function mount(){
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  var wrap = document.createElement('div');
  wrap.innerHTML =
    '<div id="whoModal" class="who-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="whoTitle">' +
      '<div class="who-box">' +
        '<div class="who-head"><h3 id="whoTitle">Who\'s Coming</h3>' +
          '<button class="x-close" id="whoClose" type="button" aria-label="Close">×</button></div>' +
        '<p class="muted" id="whoSub" style="margin:0 0 var(--space-4);font-size:var(--text-sm)"></p>' +
        '<div id="whoBody"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap.firstChild);
  document.getElementById('whoClose').addEventListener('click', closeWho);
  document.getElementById('whoModal').addEventListener('click', function(e){ if (e.target === this) closeWho(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeWho(); });
}
export function closeWho(){ var m = document.getElementById('whoModal'); if (m) m.classList.add('hidden'); }

// Teams registered for this tournament (public teams tagged with the form title).
export async function comingTeams(form){
  var title = (form && form.title) || form;   // accept a form object or a title string
  var fid = form && form.id;
  // Preferred: the PII-free server list — every registered team + confirmed status, so a
  // team shows as Pending the moment it registers and flips to Confirmed once it's paid.
  if (fid) {
    try {
      var resp = await fetch('/api/coming?form=' + encodeURIComponent(fid));
      if (resp.ok) {
        var data = await resp.json();
        if (data && Array.isArray(data.teams) && data.teams.length) {
          return data.teams.map(function(t){
            return { name: t.name, age_class: t.age_class || '', division: t.division || '', town: t.town || '',
                     confirmed: t.confirmed !== false,
                     slug: t.confirmed !== false ? wslug(t.name + (t.age_class ? ' ' + t.age_class : '')) : '' };
          });
        }
      }
    } catch (e) {}
  }
  // Fallback (demo / gated preview / no server): public teams + any team on the schedule.
  var teams = [];
  try { teams = await STS.loadTeams(); } catch(e){ teams = []; }
  var out = (teams || []).filter(function(t){
    return t && t.live !== false && Array.isArray(t.tournaments) && t.tournaments.indexOf(title) >= 0;
  }).map(function(t){ return Object.assign({}, t, { confirmed: true }); });   // paid = has a team doc = confirmed
  // Paid registrations create a public teams doc (above). FREE / not-yet-paid entries
  // don't — and registrations themselves are PII-gated — so also surface any team that's
  // on this tournament's PUBLIC schedule, so Who's Coming isn't stuck at 0.
  if (fid) {
    var seen = {}; out.forEach(function(t){ seen[String(t.name || '').toLowerCase()] = 1; });
    try {
      var games = await STS.loadGames();
      (games || []).forEach(function(g){
        if (g.form_id !== fid) return;
        [g.away, g.home].forEach(function(nm){
          if (!nm || /^(WG|LG)-\d+$/i.test(String(nm)) || /^Seed\s*\d+$/i.test(String(nm)) || /^(tbd|bye)$/i.test(String(nm))) return;
          var k = String(nm).toLowerCase(); if (seen[k]) return; seen[k] = 1;
          out.push({ name: nm, division: g.division || '', age_class: '', live: true, slug: wslug(nm), confirmed: false });
        });
      });
    } catch(e){}
  }
  return out;
}
export async function comingCount(form){ return (await comingTeams(form)).length; }

export async function openWho(form){
  if (!form) return;
  mount();
  document.getElementById('whoSub').textContent = form.title || '';
  var body = document.getElementById('whoBody');
  body.innerHTML = '<div class="muted">Loading…</div>';
  document.getElementById('whoModal').classList.remove('hidden');

  var coming = await comingTeams(form);
  if (!coming.length){ body.innerHTML = '<div class="empty">No teams registered yet — be the first to sign up!</div>'; return; }

  var sep = !!form.separate_divisions;                       // special events split by division too
  var ageOrder = CFG.ageGroups || [], divOrder = form.divisions || [];
  var ageIdx = function(a){ var i = ageOrder.indexOf(a); return i < 0 ? 999 : i; };
  var divIdx = function(d){ var i = divOrder.indexOf(d); return i < 0 ? 999 : i; };

  var groups = {};
  coming.forEach(function(t){
    var age = t.age_class || '', div = t.division || '';
    var key = sep ? (age + '||' + div) : age;
    if (!groups[key]) groups[key] = { label: sep ? ([age, div].filter(Boolean).join(' · ') || 'Other') : (age || div || 'Other'), age: age, div: div, teams: [] };
    groups[key].teams.push(t);
  });
  var keys = Object.keys(groups).sort(function(a, b){
    var d = ageIdx(groups[a].age) - ageIdx(groups[b].age); if (d) return d;
    return divIdx(groups[a].div) - divIdx(groups[b].div);
  });
  body.innerHTML = keys.map(function(k){
    var g = groups[k]; g.teams.sort(function(a, b){ return String(a.name||'').localeCompare(String(b.name||'')); });
    var rows = g.teams.map(function(t){
      var tag = (!sep && t.division) ? ' · '+esc(t.division) : '';
      var slug = t.slug || t.id || '';
      var conf = t.confirmed
        ? '<span style="margin-left:auto;color:#0a7d33;font-weight:700;font-size:12px;white-space:nowrap" title="Paid / confirmed">✓ Confirmed</span>'
        : '<span style="margin-left:auto;color:#9aa3af;font-size:12px;white-space:nowrap" title="Not yet confirmed">Pending</span>';
      var inner = '<span class="twn">'+esc(t.name||'Team')+'</span>'+(t.town?'<span class="tloc">· '+esc(t.town)+'</span>':'')+(tag?'<span class="tloc">'+tag+'</span>':'')+conf+(slug?'<span class="who-go" aria-hidden="true">›</span>':'');
      return slug
        ? '<a class="who-team" href="team.html?id='+encodeURIComponent(slug)+'">'+inner+'</a>'
        : '<div class="who-team">'+inner+'</div>';
    }).join('');
    return '<div class="who-div">'+esc(g.label)+' <span class="cnt">'+g.teams.length+' team'+(g.teams.length>1?'s':'')+'</span></div>'+rows;
  }).join('');
}
