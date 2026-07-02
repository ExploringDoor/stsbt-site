// Vercel Serverless Function — /api/coming?form=<formId>
// PUBLIC, PII-FREE list of the teams registered for a tournament, with their
// confirmed (paid) status. Powers the "Who's Coming" list: a team shows as soon as
// it registers (Pending), then flips to Confirmed once paid.
//
// Reads the PII-gated `registrations` collection as the admin robot, but returns
// ONLY team name + age + division + town + confirmed. NEVER coach name/email/phone
// or any payment/card detail.

import { fsQuery, fbConfigured } from './_firestore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const formId = (req.query && req.query.form) || '';
  if (!formId) return res.status(400).json({ error: 'form required' });
  if (!fbConfigured()) return res.status(200).json({ teams: [] });

  try {
    const regs = await fsQuery('registrations', 'form_id', 'EQUAL', String(formId));
    const seen = {};
    const teams = (regs || [])
      .filter((r) => r && r.team_name && (r.status || 'completed') !== 'archived')
      .filter((r) => { const k = String(r.team_name).toLowerCase() + '|' + (r.age_class || ''); if (seen[k]) return false; seen[k] = 1; return true; })
      .map((r) => ({
        name: r.team_name,
        age_class: r.age_class || '',
        division: r.division || '',
        town: r.town || '',
        confirmed: (r.payment_status === 'paid' || r.payment_status === 'free'),
      }));
    return res.status(200).json({ teams });
  } catch (e) {
    return res.status(200).json({ teams: [] });
  }
}
