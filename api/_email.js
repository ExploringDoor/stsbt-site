// Shared SendGrid sender for STS serverless functions.
//
// Env (Vercel):
//   SENDGRID_API_KEY  — from sendgrid.com (the key Adam created)
//   MAIL_FROM         — verified sender, e.g. "Small Town Select Tournaments <noreply@ststournaments.com>"
//                       (defaults to noreply@ststournaments.com — the domain SendGrid verified)
//   ADMIN_EMAIL       — where admin notifications go (Keith; point at your own inbox to test)
//
// SendGrid returns 202 with an empty body on success.

const KEY = process.env.SENDGRID_API_KEY || '';
const FROM = process.env.MAIL_FROM || 'Small Town Select Tournaments <noreply@ststournaments.com>';

export function emailConfigured() { return !!KEY; }
export function adminAddress() { return process.env.ADMIN_EMAIL || ''; }

function parseFrom(s) {
  const m = /^\s*(.*?)\s*<\s*(.+?)\s*>\s*$/.exec(s);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: String(s).trim() };
}

export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!KEY) return { skipped: true, reason: 'SENDGRID_API_KEY not set' };
  if (!to) return { skipped: true, reason: 'no recipient' };
  const body = {
    personalizations: [{ to: [{ email: to }] }],
    from: parseFrom(FROM),
    subject: subject || '(no subject)',
    content: [
      { type: 'text/plain', value: text || ' ' },
      { type: 'text/html', value: html || '<p></p>' },
    ],
  };
  if (replyTo) body.reply_to = { email: replyTo };

  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 202) return { ok: true };
  let detail = '';
  try { detail = JSON.stringify(await r.json()); } catch (e) { detail = String(r.status); }
  throw new Error('SendGrid ' + r.status + ': ' + detail.slice(0, 300));
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Branded HTML wrapper (navy header + card) shared by every notification.
export function shell(kind, title, rowsHtml, ctaHref, ctaLabel) {
  const accent = kind === 'paid' ? '#166534' : kind === 'insurance' ? '#9a3412' : '#002D72';
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f1f5f9;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:#00224f;padding:16px 22px">
        <div style="color:#f6c453;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700">Small Town Select Tournaments</div>
      </div>
      <div style="padding:22px 24px">
        <div style="font-size:12px;color:${accent};letter-spacing:.08em;text-transform:uppercase;font-weight:700">${esc(title)}</div>
        <div style="font-size:14px;color:#334155;line-height:1.7;margin-top:12px">${rowsHtml}</div>
        ${ctaHref ? `<div style="margin-top:20px"><a href="${esc(ctaHref)}" style="display:inline-block;background:#00224f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700">${esc(ctaLabel || 'Open Admin')}</a></div>` : ''}
      </div>
    </div></div>`;
}
