// Shared Firestore REST helpers for STS serverless functions.
// No firebase-admin / downloaded service-account key (the org policy
// `iam.disableServiceAccountKeyCreation` blocks those, and they're a leak risk).
// Instead the server signs in as ONE dedicated Firebase Auth admin user and
// sends that user's ID token as Bearer auth on every write — which satisfies the
// `isSuper()` security rule. Reads of public collections still work key-only.
//
// Env (Vercel project settings):
//   FIREBASE_PROJECT_ID, FIREBASE_API_KEY      — project + web API key
//   FB_ADMIN_EMAIL, FB_ADMIN_PASSWORD          — the dedicated server admin login
//                                                (its uid must have an admins/{uid}
//                                                 doc with role:'super', active:true)

const FB_PROJECT = process.env.FIREBASE_PROJECT_ID || 'PASTE_PROJECT_ID';
const FB_KEY = process.env.FIREBASE_API_KEY || '';
const FB_BASE = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;

const FB_ADMIN_EMAIL = process.env.FB_ADMIN_EMAIL || '';
const FB_ADMIN_PASSWORD = process.env.FB_ADMIN_PASSWORD || '';

export function fbConfigured() { return !!FB_KEY && !FB_PROJECT.startsWith('PASTE'); }
// True when the server can authenticate as the admin user (privileged writes).
export function fbAdminConfigured() { return fbConfigured() && !!FB_ADMIN_EMAIL && !!FB_ADMIN_PASSWORD; }

// ── Admin sign-in (Identity Toolkit) ─────────────────────────────────
// Exchanges the dedicated admin email+password for a short-lived ID token,
// cached in warm-invocation module scope until ~1 min before it expires.
let _tok = null, _tokExp = 0;
export async function adminIdToken() {
  if (!fbAdminConfigured()) return null;
  const now = Date.now();
  if (_tok && now < _tokExp) return _tok;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FB_ADMIN_EMAIL, password: FB_ADMIN_PASSWORD, returnSecureToken: true })
  });
  const d = await r.json();
  if (!r.ok || !d.idToken) throw new Error('admin auth failed: ' + (d.error?.message || r.status));
  _tok = d.idToken;
  _tokExp = now + (parseInt(d.expiresIn, 10) || 3600) * 1000 - 60000;   // refresh 1 min early
  return _tok;
}
// Authorization header for privileged calls (empty object when no admin creds,
// so the helpers degrade to the old key-only behaviour for public reads).
async function authHeader() {
  const t = await adminIdToken().catch(() => null);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function toFsValue(v) {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFirestore(v) } };
  return { stringValue: String(v) };
}
export function toFirestore(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = toFsValue(v);
  return out;
}
export function fromFsValue(v) {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(fromFsValue);
  if (v.mapValue) return fromFirestore(v.mapValue.fields || {});
  return null;
}
export function fromFirestore(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromFsValue(v);
  return out;
}

export async function fsGet(path) {
  const r = await fetch(`${FB_BASE}/${path}?key=${FB_KEY}`, { headers: await authHeader() });
  if (!r.ok) return null;
  const d = await r.json();
  return d.fields ? { id: String(d.name).split('/').pop(), ...fromFirestore(d.fields) } : null;
}
export async function fsPatch(path, fields) {
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`${FB_BASE}/${path}?${mask}&key=${FB_KEY}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ fields: toFirestore(fields) })
  });
  return r.json();
}
export async function fsCreate(collection, fields, docId) {
  const url = docId
    ? `${FB_BASE}/${collection}?documentId=${encodeURIComponent(docId)}&key=${FB_KEY}`
    : `${FB_BASE}/${collection}?key=${FB_KEY}`;
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ fields: toFirestore(fields) })
  });
  return r.json();
}
export async function fsQuery(collection, field, op, value) {
  const r = await fetch(`${FB_BASE}:runQuery?key=${FB_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op, value: toFsValue(value) } }
      }
    })
  });
  const data = await r.json();
  return (Array.isArray(data) ? data : []).filter(d => d.document).map(d => ({
    id: d.document.name.split('/').pop(), ...fromFirestore(d.document.fields)
  }));
}
