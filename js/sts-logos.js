// ─────────────────────────────────────────────────────────────────────
// Team logos. Reuses the site's `.sts-logo` circle convention: a navy circle
// showing the team's initials, with a real logo (assets/logos/<slug>.png)
// overlaid on top when present. Drop a PNG named by the team's slug and it
// appears everywhere; missing logos cleanly fall back to the initials circle.
//
//   STSlogos.html(name, sizePx, slug?)  -> '<span class="sts-logo">…</span>'
//   STSlogos.slug(name) / STSlogos.abbr(name)
// ─────────────────────────────────────────────────────────────────────
(function (global) {
  var BASE = 'assets/logos/';
  function esc(s) { return s == null ? '' : String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function slugify(s) { return String(s == null ? '' : s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function abbr(name) {  // matches STS.abbr in sts-data.js
    var w = String(name == null ? '' : name).replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/);
    if (!w[0]) return 'STS';
    if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    return (w[0][0] + w[1][0] + (w[2] ? w[2][0] : '')).toUpperCase();
  }
  // a circle showing the initials, with a logo image overlaid if the file exists.
  // onerror removes the <img>, revealing the initials behind it — so a missing
  // logo never breaks the layout.
  function html(name, size, slug) {
    size = size || 28;
    var s = slug || slugify(name), ab = abbr(name);
    var style = 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.4) + 'px';
    var img = s ? '<img src="' + BASE + esc(s) + '.png" alt="' + esc(name) + ' logo" loading="lazy" decoding="async" onerror="this.remove()">' : '';
    return '<span class="sts-logo" style="' + style + '">' + img + esc(ab) + '</span>';
  }
  global.STSlogos = { html: html, slug: slugify, abbr: abbr };
})(window);
