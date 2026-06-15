// ─────────────────────────────────────────────────────────────────────
// STS cosmetic FX — scroll reveals, count-up stats, celebration confetti.
// Self-contained, dependency-free, honors prefers-reduced-motion.
//   window.STSfx.confetti()  — fire a celebration burst
// ─────────────────────────────────────────────────────────────────────
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var io = (!reduce && 'IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      if (el.dataset.fxcount != null) countUp(el); else el.classList.add('fx-in');
      io.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }) : null;

  var REVEAL = '.tcard, .card, .ft, .ql, .hub-stat, .team-logo, .login-card';

  function arm(root) {
    if (!io) return;
    (root || document).querySelectorAll(REVEAL).forEach(function (el) {
      if (el.classList.contains('fx-armed')) return;
      el.classList.add('fx-armed', 'fx-reveal'); io.observe(el);
    });
    (root || document).querySelectorAll('.hub-stat .n, [data-count]').forEach(function (el) {
      if (el.dataset.fxcount != null) return;
      el.dataset.fxcount = (el.textContent || '').trim(); io.observe(el);
    });
  }

  function countUp(el) {
    var raw = el.dataset.fxcount || el.textContent || '';
    var target = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (isNaN(target)) { el.classList.add('fx-in'); return; }
    var suffix = (raw.match(/[^0-9,]+$/) || [''])[0], dur = 1000, t0 = performance.now();
    el.classList.add('fx-in');
    function step(t) {
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      var n = Math.round(e * target);
      el.textContent = (el.dataset.plain != null ? String(n) : n.toLocaleString()) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function confetti() {
    if (reduce) return;
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d'), dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    var colors = ['#002D72', '#C9A227', '#EBCB5E', '#1E5BC6', '#ffffff', '#BF0A30'], parts = [];
    for (var i = 0; i < 150; i++) parts.push({
      x: innerWidth * (0.5 + (Math.random() - 0.5) * 0.32), y: innerHeight * 0.28,
      vx: (Math.random() - 0.5) * 10, vy: Math.random() * -10 - 4, g: 0.26 + Math.random() * 0.14,
      s: 6 + Math.random() * 7, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length]
    });
    var t0 = performance.now();
    (function frame(t) {
      var dt = t - t0; ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p) {
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - dt / 2600); ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
      });
      if (dt < 2600) requestAnimationFrame(frame); else canvas.remove();
    })(t0);
  }

  window.STSfx = { confetti: confetti, arm: arm };

  function init() { arm(document); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  if (window.MutationObserver) {
    var tmr, mo = new MutationObserver(function () { clearTimeout(tmr); tmr = setTimeout(function () { arm(document); }, 200); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
})();
