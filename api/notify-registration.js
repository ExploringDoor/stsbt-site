// Vercel Serverless Function — /api/notify-registration.js
// Emails Keith when a team registers (and again when payment clears).
// Ported from the proven DVSL api/notify-admin.js (Resend, free tier).
//
// Env vars (Vercel project settings):
//   RESEND_API_KEY  — from https://resend.com (free tier)
//   ADMIN_EMAIL     — Keith's email (e.g. keithphilips34@gmail.com)
//
// If either is missing, returns 200 skipped=true so registration never breaks.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.RESEND_API_KEY;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  if (!API_KEY || !ADMIN_EMAIL) return res.status(200).json({ skipped: true, reason: 'Email not configured' });

  const { event = 'submitted', registration = {} } = req.body || {};
  const r = registration;
  const paid = event === 'paid';
  const subject = `STS: ${paid ? 'PAID' : 'New'} registration — ${r.team_name || 'team'} (${r.age_class || ''} ${r.division || ''})`.trim();

  const lines = [
    `Team: ${r.team_name || ''}`,
    `Form: ${r.form_title || r.form_id || ''}`,
    `Sport / Division / Age: ${r.sport || ''} · ${r.division || ''} · ${r.age_class || ''}`,
    `Coach: ${r.coach_name || ''}  ${r.coach_phone || ''}  ${r.coach_email || ''}`,
    `Town: ${r.town || ''}`,
    `Entry #: ${r.entry_no || ''}`,
    `Amount: ${r.amount_cents != null ? '$' + (r.amount_cents / 100).toFixed(2) : ''}`,
    paid ? `Card last 4: ${r.card_last4 || ''}` : '',
    paid ? `Clover order: ${r.clover_order_id || ''}` : '',
  ].filter(Boolean);

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:20px;background:#f8fafc">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:24px">
        <div style="font-size:12px;color:${paid ? '#166534' : '#64748b'};letter-spacing:.08em;text-transform:uppercase;font-weight:700">${paid ? 'PAID Registration' : 'New Registration'}</div>
        <div style="font-size:18px;font-weight:700;color:#0f172a;margin:6px 0 16px">${esc(r.team_name || 'Team')}</div>
        <div style="font-size:14px;color:#334155;line-height:1.7">${lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>
        <div style="margin-top:20px"><a href="${esc(process.env.SITE_URL || '')}/admin.html" style="display:inline-block;background:#002D72;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700">Open Admin</a></div>
      </div>
    </div>`;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Small Town Select <onboarding@resend.dev>', // sandbox sender until a domain is verified
        to: [ADMIN_EMAIL], subject, text: lines.join('\n'), html,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(500).json({ error: data.message || 'Resend failed' });
    return res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
