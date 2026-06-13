// Vercel Edge Middleware — private-preview password gate for the ENTIRE site.
//
// The GitHub repo is PUBLIC, so the password must NEVER live in this file. It is
// read only from the SITE_GATE env var (set in Vercel → Environment Variables).
//
// Behaviour: HTTP Basic Auth — any username, the password must equal SITE_GATE.
// FAIL-CLOSED: if SITE_GATE is unset, the site stays locked (better dark than
// public). To take the gate DOWN later, just delete the SITE_GATE env var and
// remove this file (or set SITE_GATE and share it with Keith for a private look).

export const config = {
  // Gate every route except Vercel's internal paths + the favicon.
  matcher: '/((?!_vercel/|favicon\\.ico).*)',
};

export default function middleware(request) {
  const GATE = process.env.SITE_GATE || '';
  const header = request.headers.get('authorization') || '';

  if (GATE && header.startsWith('Basic ')) {
    let decoded = '';
    try { decoded = atob(header.slice(6)); } catch (e) { decoded = ''; }
    const pass = decoded.slice(decoded.indexOf(':') + 1);
    if (pass === GATE) return; // correct password → let the request through
  }

  return new Response(
    'Small Town Select Tournaments — private preview.\nThis site is not public yet.',
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Small Town Select — private preview"',
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    }
  );
}
