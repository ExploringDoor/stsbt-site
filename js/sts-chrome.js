// ─────────────────────────────────────────────────────────────────────
// Site chrome: one source of truth for the nav + footer across every page.
// A page includes <div id="sts-nav"></div> / <div id="sts-footer"></div>
// and this script replaces them. Edit NAV/MORE below to change links sitewide.
//
// CREST: renders an "STS" monogram circle by default. When Keith's real logo
// lands, drop it at assets/sts-crest.png and set USE_CREST_IMG = true.
// ─────────────────────────────────────────────────────────────────────
(function () {
  var USE_CREST_IMG = false; // flip to true once assets/sts-crest.png exists

  // Cosmetic FX
  (function () { var s = document.createElement('script'); s.defer = true; s.src = 'js/sts-fx.js'; document.head.appendChild(s); })();

  var NAV = [
    ['index.html', 'Home'],
    ['teams.html', 'Teams'],
    ['schedule.html', 'Schedule'],
    ['scores.html', 'Scores'],
    ['brackets.html', 'Brackets'],
    ['champions.html', 'Champions'],
  ];
  var MORE = [
    ['rules.html', 'Ages & Rules'],
    ['locations.html', 'Locations'],
    ['directors.html', 'Directors'],
    ['contact.html', 'Contact'],
    ['admin.html', 'Admin Sign In'],
  ];
  var DIRECTOR = (window.LEAGUE_CONFIG && LEAGUE_CONFIG.contact && LEAGUE_CONFIG.contact.director) || {};
  var CONTACT = DIRECTOR.email || 'keithphilips34@gmail.com';
  var CFG = window.LEAGUE_CONFIG || {};
  var FB = CFG.facebook || '';
  var GEN_EMAIL = (CFG.contact && CFG.contact.generalEmail) || CONTACT;
  var DISCLAIMER = CFG.disclaimer || '';

  function base(s) { return s.toLowerCase().replace(/\.html$/, '').replace(/\/+$/, '') || 'index'; }
  var here = base(location.pathname.split('/').pop());

  function navItem(n, extraClass) {
    var ext = /^https?:/i.test(n[0]);
    var active = !ext && base(n[0]) === here;
    var cls = extraClass || '';
    var attrs = (active ? ' aria-current="page"' : '') + (ext ? ' target="_blank" rel="noopener"' : '') + (cls ? ' class="' + cls + '"' : '');
    return '<li><a href="' + n[0] + '"' + attrs + '>' + n[1] + '</a></li>';
  }

  // Real logo (assets/sts-logo.png). If it's missing, fall back to the STS monogram.
  window.__stsMonoCrest = '<span class="nav-crest mono" aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:700;font-size:15px;color:var(--sts-navy)">STS</span>';
  var crestHTML = '<img class="nav-crest" src="assets/sts-logo.png" alt="Small Town Select" onerror="this.outerHTML=window.__stsMonoCrest" />';
  // favicon (tab icon) — same logo
  (function () { try { var l = document.createElement('link'); l.rel = 'icon'; l.href = 'assets/sts-logo.png'; document.head.appendChild(l); } catch (e) {} })();

  var topLinks = NAV.map(function (n) { return navItem(n); }).join('') +
    navItem(['register.html', 'Register'], 'nav-cta');
  var moreActive = MORE.some(function (n) { return base(n[0]) === here; });
  var moreHTML = '<li class="nav-more">' +
    '<a href="#more" class="nav-more-trigger"' + (moreActive ? ' aria-current="page"' : '') +
      ' aria-haspopup="true" aria-expanded="false">More <span class="caret">▾</span></a>' +
    '<ul class="nav-dropdown">' + MORE.map(function (n) { return navItem(n); }).join('') + '</ul></li>';

  var navHTML =
    '<nav class="nav"><div class="container nav-inner">' +
      '<a class="nav-brand" href="index.html">' + crestHTML +
        '<span class="name-block">Small Town Select<span class="sub">Tournaments · Baseball &amp; Softball</span></span></a>' +
      '<button class="nav-toggle" aria-label="Menu" aria-controls="primary-nav" aria-expanded="false" onclick="var n=document.getElementById(\'primary-nav\'); this.setAttribute(\'aria-expanded\', n.classList.toggle(\'open\'));">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">' +
        '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg></button>' +
      '<ul class="nav-links" id="primary-nav">' + topLinks + moreHTML + '</ul>' +
    '</div></nav>';

  var year = (window.LEAGUE_CONFIG && LEAGUE_CONFIG.season && LEAGUE_CONFIG.season.year) || 2026;
  var footHTML =
    '<footer class="footer"><div class="container"><div class="footer-grid">' +
      '<div><h5>Small Town Select Tournaments</h5>' +
        '<p style="color:rgba(255,255,255,.7);max-width:46ch;">Select baseball &amp; softball tournaments across Texas — team registration, rosters, schedules, and brackets in one place.</p>' +
        '<p style="color:rgba(255,255,255,.55);font-size:var(--text-xs);margin-top:12px;">' + (DIRECTOR.name || 'Keith Philips') + ' — Director<br>' +
        '<a href="mailto:' + CONTACT + '" style="font-size:var(--text-xs);color:rgba(255,255,255,.7)">' + CONTACT + '</a>' + (DIRECTOR.phone ? ' · <a href="tel:' + DIRECTOR.phone.replace(/[^0-9]/g, '') + '" style="font-size:var(--text-xs);color:rgba(255,255,255,.7)">' + DIRECTOR.phone + '</a>' : '') + '</p></div>' +
      '<div><h5>Play</h5><ul>' +
        '<li><a href="register.html">Register a Team</a></li><li><a href="teams.html">Teams</a></li>' +
        '<li><a href="schedule.html">Schedule</a></li><li><a href="scores.html">Scores</a></li>' +
        '<li><a href="brackets.html">Brackets</a></li><li><a href="champions.html">Champions</a></li></ul></div>' +
      '<div><h5>Info</h5><ul>' +
        '<li><a href="rules.html">Ages &amp; Rules</a></li><li><a href="locations.html">Locations</a></li>' +
        '<li><a href="directors.html">Directors</a></li><li><a href="contact.html">Contact</a></li></ul></div>' +
      '<div><h5>Connect</h5><ul>' +
        (FB ? '<li><a href="' + FB + '" target="_blank" rel="noopener">Facebook</a></li>' : '') +
        '<li><a href="mailto:' + GEN_EMAIL + '">' + GEN_EMAIL + '</a></li>' +
        '<li><a href="admin.html">Admin Sign In</a></li>' +
        (CFG.previewMode ? '<li><a href="?demo=1">🎭 Preview with sample data</a></li>' : '') +
        '</ul></div>' +
    '</div>' +
    (DISCLAIMER ? '<div class="footer-disclaimer"><strong>Disclaimer:</strong> ' + DISCLAIMER + '</div>' : '') +
    '<div class="footer-bottom">' +
      '<div>© ' + year + ' Small Town Select Tournaments. All rights reserved.</div>' +
      '<div><span class="credit">Built by <a href="https://mainline-webdesign.com/" target="_blank" rel="noopener">Mainline Web Design</a></span></div>' +
    '</div></div></footer>';

  function inject() {
    // demo-mode banner (?demo=1) — example data, not real
    try {
      var du = null; try { du = new URLSearchParams(location.search).get('demo'); } catch (e) {}
      var demoOn = du === '1' || (du !== '0' && (function(){ try { return localStorage.getItem('sts-demo') === '1'; } catch (e) { return false; } })());
      if (demoOn && !document.querySelector('.demo-banner')) {
        var bn = document.createElement('div');
        bn.className = 'demo-banner';
        bn.innerHTML = '🎭 Demo mode — example data, not real registrations · <a href="?demo=0">Exit demo</a>';
        document.body.insertBefore(bn, document.body.firstChild);
      } else if (!demoOn && CFG.previewMode && !document.querySelector('.demo-invite')) {
        var iv = document.createElement('div');
        iv.className = 'demo-invite';
        iv.innerHTML = '👋 Want to see it in action? <a href="?demo=1">Preview the whole site with sample data →</a>';
        document.body.insertBefore(iv, document.body.firstChild);
      }
    } catch (e) {}
    var n = document.getElementById('sts-nav'); if (n) n.outerHTML = navHTML;
    var f = document.getElementById('sts-footer'); if (f) f.outerHTML = footHTML;
    var more = document.querySelector('.nav-more');
    if (more) {
      var trig = more.querySelector('.nav-more-trigger');
      trig.addEventListener('click', function (e) {
        e.preventDefault();
        var open = more.classList.toggle('open');
        trig.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', function (e) {
        if (!more.contains(e.target)) { more.classList.remove('open'); trig.setAttribute('aria-expanded', 'false'); }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
