// Vercel Serverless Function — /api/insurance-save
// A coach uploads their OWN team insurance policy from the code-gated coach page.
// Re-checks the team code SERVER-SIDE, then writes a PENDING record to the
// admin-only team_insurance collection and emails Keith for review.
//
// Env: FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FB_ADMIN_* (admin-token writes),
//      SENDGRID_API_KEY, ADMIN_EMAIL (notification).

import { fsGet, fsPatch, fsQuery, fbConfigured, fbAdminConfigured, adminIdToken } from './_firestore.js';
import { sendMail, emailConfigured, adminAddress, shell, esc } from './_email.js';

// Real PDFs go to Firebase Storage (no 1MB-per-doc Firestore limit). The request
// body still carries the base64 — keep it under Vercel's ~4.5MB body cap.
const MAX_BODY = 4.3 * 1024 * 1024;      // ~3MB PDF after base64, under Vercel's ~4.5MB body cap
const FALLBACK_DOC = 950 * 1024;         // if Storage is unavailable, inline base64 ≤ ~700KB PDF
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'small-town-select.firebasestorage.app';

function slugFile(s) { return String(s || 'policy').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'policy'; }

// Upload a base64 data-URI PDF to Storage at insurance/<teamId>/<file> via the
// Firebase Storage REST endpoint (authed as the dedicated admin user). Returns a
// tokened download URL that admin.html can open directly.
async function uploadToStorage(teamId, dataUri, name) {
  const token = await adminIdToken();
  if (!token) throw new Error('no admin token');
  const base64 = String(dataUri).replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  const path = `insurance/${teamId}/${Date.now()}-${slugFile(name || 'policy')}`.replace(/(\.pdf)?$/i, '.pdf');
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Firebase ${token}`, 'Content-Type': 'application/pdf' }, body: buf });
  const meta = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('storage upload failed: ' + (meta && meta.error && meta.error.message || r.status));
  const dl = meta.downloadTokens || (meta.metadata && meta.metadata.firebaseStorageDownloadTokens) || '';
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media${dl ? '&token=' + dl : ''}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!fbConfigured()) return res.status(501).json({ error: 'not_configured' });
  if (!fbAdminConfigured()) return res.status(501).json({ error: 'admin_auth_not_configured' });

  const b = req.body || {};
  const { teamId, code } = b;
  if (!teamId || !code) return res.status(400).json({ error: 'Missing team or code' });
  if (b.doc_data && String(b.doc_data).length > MAX_BODY) {
    return res.status(413).json({ error: 'That PDF is too large to upload here — please email it to your director instead.' });
  }

  try {
    let team = await fsGet(`teams/${teamId}`);
    if (!team) { const q = await fsQuery('teams', 'slug', 'EQUAL', teamId); team = q[0]; }
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (String(team.team_code).toUpperCase() !== String(code).toUpperCase()) return res.status(403).json({ error: 'Wrong team code' });

    // Store the PDF: prefer Firebase Storage; fall back to inline base64 only for
    // small files if Storage upload fails (so a submission is never lost).
    let docUrl = '';
    if (b.doc_data) {
      try { docUrl = await uploadToStorage(team.id, b.doc_data, b.doc_name); }
      catch (e) {
        if (String(b.doc_data).length <= FALLBACK_DOC) docUrl = String(b.doc_data);
        else return res.status(502).json({ error: 'Could not store the PDF right now — please email it to your director instead.' });
      }
    }

    const rec = {
      team_id: team.id, team_name: team.name || '', status: 'pending', source: 'uploaded',
      carrier: String(b.carrier || '').slice(0, 120),
      policy_no: String(b.policy_no || '').slice(0, 80),
      coverage_start: String(b.coverage_start || '').slice(0, 10),
      coverage_end: String(b.coverage_end || '').slice(0, 10),
      doc_name: String(b.doc_name || '').slice(0, 160),
      doc_url: docUrl,
      submitted_at: new Date().toISOString(), reviewed_at: '', note: '',
    };
    await fsPatch(`team_insurance/${team.id}`, rec);
    try { await fsPatch(`teams/${team.id}`, { insurance_status: 'pending' }); } catch (e) {}

    // Notify Keith directly (the public site is behind the password gate, so a
    // self-HTTP call to /api/notify-registration would 401 — send straight through).
    try {
      const to = adminAddress();
      if (emailConfigured() && to) {
        const base = process.env.SITE_URL || 'https://ststournaments.com';
        const rows = '<table style="width:100%;border-collapse:collapse">' +
          `<tr><td style="padding:6px 0;color:#64748b">Team</td><td style="padding:6px 0"><b>${esc(team.name || '')}</b></td></tr>` +
          `<tr><td style="padding:6px 0;color:#64748b">Carrier</td><td style="padding:6px 0">${esc(rec.carrier || '—')}</td></tr>` +
          `<tr><td style="padding:6px 0;color:#64748b">Policy #</td><td style="padding:6px 0">${esc(rec.policy_no || '—')}</td></tr>` +
          `<tr><td style="padding:6px 0;color:#64748b">Coverage</td><td style="padding:6px 0">${esc(rec.coverage_start || '?')} → ${esc(rec.coverage_end || '?')}</td></tr>` +
          '</table>';
        const html = shell('insurance', 'Insurance policy uploaded — needs review', rows, `${base}/admin.html`, 'Review in Admin');
        const text = `${team.name || 'A team'} uploaded an insurance policy for review. Carrier: ${rec.carrier || '—'}, Policy ${rec.policy_no || '—'}, Coverage ${rec.coverage_start || '?'}–${rec.coverage_end || '?'}. Review it in the Admin → Insurance tab.`;
        await sendMail({ to, subject: `Insurance uploaded — ${team.name || 'a team'} (review needed)`, html, text });
      }
    } catch (e) { /* non-fatal */ }

    return res.status(200).json({ ok: true, status: 'pending' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
