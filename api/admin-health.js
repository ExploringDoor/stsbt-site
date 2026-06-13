// Vercel Serverless Function — /api/admin-health.js
// Tiny diagnostic: confirms the server can sign in as the dedicated admin user
// (the no-key replacement for a service-account key). Returns booleans only —
// never credentials or token material. Safe to leave deployed.

import { fbConfigured, fbAdminConfigured, adminIdToken } from './_firestore.js';

export default async function handler(req, res) {
  const out = {
    firestore_configured: fbConfigured(),
    admin_env_present: fbAdminConfigured(),
    admin_sign_in: 'skipped',
  };
  if (out.admin_env_present) {
    try {
      const tok = await adminIdToken();
      out.admin_sign_in = tok ? 'ok' : 'failed';
    } catch (e) {
      // Generic reason only (e.g. INVALID_PASSWORD / EMAIL_NOT_FOUND) — helps
      // debugging without exposing anything sensitive.
      out.admin_sign_in = 'failed: ' + String(e.message || e).slice(0, 80);
    }
  }
  return res.status(200).json(out);
}
