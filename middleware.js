// Vercel Edge Middleware — private-preview password gate for the ENTIRE site.
//
// The GitHub repo is PUBLIC, so the password must NEVER live in this file. It is
// read only from the SITE_GATE env var (Vercel → Environment Variables).
//
// UX: a normal branded HTML login page (NOT browser Basic Auth, which some
// browsers refuse to prompt for). Submitting the right password sets a cookie;
// after that every page loads normally for 30 days.
//
// FAIL-CLOSED: if SITE_GATE is unset, nothing unlocks (better dark than public).
// TO GO PUBLIC AT LAUNCH: delete the SITE_GATE env var and remove this file.

export const config = {
  matcher: '/((?!_vercel/|favicon\\.ico).*)',
};

function parseCookies(str) {
  const out = {};
  (str || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function loginPage(showError) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Small Town Select Tournaments — Private Preview</title>
<style>
  *{box-sizing:border-box} html,body{margin:0;height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:linear-gradient(180deg,#00224f,#001226);color:#fff;
    display:flex;align-items:center;justify-content:center;padding:24px}
  .card{width:100%;max-width:380px;background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:32px 28px;text-align:center}
  .badge{width:66px;height:66px;border-radius:50%;margin:0 auto 18px;display:flex;align-items:center;
    justify-content:center;background:rgba(246,196,83,.14);border:2px solid #f6c453;color:#f6c453;
    font-weight:800;font-size:21px;letter-spacing:.04em}
  .eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#f6c453;font-weight:700}
  h1{font-size:22px;margin:10px 0 4px;line-height:1.2}
  p{margin:0 0 22px;color:rgba(255,255,255,.7);font-size:14px}
  input{width:100%;padding:13px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.2);
    background:rgba(0,0,0,.25);color:#fff;font-size:16px;text-align:center;letter-spacing:.05em}
  input:focus{outline:none;border-color:#f6c453}
  button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:10px;cursor:pointer;
    background:#f6c453;color:#00224f;font-size:15px;font-weight:700}
  .err{color:#ff9d9d;font-size:13px;margin-top:14px;min-height:16px}
</style></head><body>
<form class="card" method="POST" action="/__unlock">
  <div class="badge">STS</div>
  <div class="eyebrow">Private Preview</div>
  <h1>Small Town Select Tournaments</h1>
  <p>This site isn't public yet. Enter the password to take a look.</p>
  <input type="password" name="pw" placeholder="Password" autofocus autocomplete="current-password" required>
  <button type="submit">Enter</button>
  <div class="err">${showError ? 'Incorrect password — try again.' : ''}</div>
</form></body></html>`;
  return new Response(html, {
    status: showError ? 401 : 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default async function middleware(request) {
  const GATE = process.env.SITE_GATE || '';
  const url = new URL(request.url);
  const cookies = parseCookies(request.headers.get('cookie'));

  // Already unlocked → let everything through.
  if (GATE && cookies.sts_ok === GATE) return;

  // Login form submit.
  if (request.method === 'POST' && url.pathname === '/__unlock') {
    let pw = '';
    try { const f = await request.formData(); pw = String(f.get('pw') || ''); } catch (e) {}
    if (GATE && pw === GATE) {
      return new Response(null, {
        status: 303,
        headers: {
          'Location': '/',
          'Set-Cookie': `sts_ok=${encodeURIComponent(GATE)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
          'cache-control': 'no-store',
        },
      });
    }
    return loginPage(true);
  }

  // Everyone else → the login page.
  return loginPage(false);
}
