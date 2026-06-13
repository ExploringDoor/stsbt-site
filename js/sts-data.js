// ─────────────────────────────────────────────────────────────────────
// STS data layer — the single client API for forms, registrations, teams.
// Reads/writes Firestore when firebase-init is configured; otherwise serves
// built-in SAMPLE data so every page renders for preview (writes mutate the
// in-memory copy so the admin feels live within a session).
//
// Usage (per page):  import * as STS from './js/sts-data.js';
// ─────────────────────────────────────────────────────────────────────
import { db, isConfigured } from './firebase-init.js';
import {
  collection, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

export { isConfigured };

// ── helpers ──────────────────────────────────────────────────────────
export function money(cents) {
  var n = (Number(cents) || 0) / 100;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function genTeamCode() {
  var c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', out = '';
  for (var i = 0; i < 5; i++) out += c[Math.floor(Math.random() * c.length)];
  return out;
}
export function abbr(name) {
  var w = String(name || '').replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/);
  if (!w[0]) return 'STS';
  if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
  return (w[0][0] + w[1][0] + (w[2] ? w[2][0] : '')).toUpperCase();
}
// Keith's eligibility cutoff: a player's age as of May 1 of the SEASON year.
// The season runs Aug 1 → Jul 31, so from Aug 1 onward the cutoff is NEXT May 1
// (on/after Aug 1 2026 → May 1 2027). Matches the server (api/_age.js) so the site
// auto-rolls into the new season with no config change. This derived age is the
// ONLY age info shown publicly — never the birthdate.
export function cutoffYear() {
  var n = new Date();
  return n.getMonth() >= 7 ? n.getFullYear() + 1 : n.getFullYear();
}
export function ageCutoffLabel() { return 'May 1, ' + cutoffYear(); }
export function ageAsOfMay1(dob) {
  if (!dob) return '';
  var d = new Date(dob + 'T12:00:00'); if (isNaN(d)) return '';
  var cut = new Date(cutoffYear() + '-05-01T12:00:00');
  var age = cut.getFullYear() - d.getFullYear(), m = cut.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && cut.getDate() < d.getDate())) age--;
  return age >= 0 ? age : '';
}
// Public age for a roster entry: the server-stamped age51 (real docs carry no dob),
// falling back to computing from dob when present (sample/admin data).
export function playerAge(p) {
  if (!p) return '';
  if (p.age51 != null && p.age51 !== '') return p.age51;
  return p.dob ? ageAsOfMay1(p.dob) : '';
}

// ── SAMPLE DATA (used until Firebase is configured) ──────────────────
var AGE_PRICES = [
  { label: '7U', cents: 12500 }, { label: '8U Coach Pitch', cents: 12500 }, { label: '8U Kid Pitch', cents: 12500 },
  { label: '9U', cents: 12500 }, { label: '10U', cents: 12500 }, { label: '11U', cents: 12500 },
  { label: '12U', cents: 12500 }, { label: '13U', cents: 12500 }, { label: '14U', cents: 12500 }
];
var WAIVER = 'All coaches must complete the season Team Registration before registering and paying for any tournaments. All teams must carry team insurance purchased through Small Town Select, or add Small Town Select as additionally insured on their team insurance.';

var SAMPLE_FORMS = [
  { id: 'season-baseball', title: '2026 Fall/Spring Baseball Team Registration', type: 'season', sport: 'baseball', order: 1, active: true, archived: false, convenience_fee_cents: 300, price_options: [{ label: 'Season Registration', cents: 2500 }], waiver_text: WAIVER, location: '', event_dates: 'Aug 1, 2025 – Jul 31, 2026' },
  { id: 'season-softball', title: '2026 Fall/Spring Softball Team Registration', type: 'season', sport: 'softball', order: 2, active: true, archived: false, convenience_fee_cents: 300, price_options: [{ label: 'Season Registration', cents: 2500 }], waiver_text: WAIVER, location: '', event_dates: 'Aug 1, 2025 – Jul 31, 2026' },
  { id: 'brownwood-summer-slam', title: 'Brownwood "Summer Slam Series"', type: 'tournament', sport: 'baseball', divisions: ['Minors', 'Triple-A'], order: 3, active: true, archived: false, convenience_fee_cents: 300, price_options: AGE_PRICES, waiver_text: WAIVER, location: 'Brownwood, TX', event_dates: 'June 13–14, 2026' },
  { id: 'iowa-park-heat-wave', title: 'Iowa Park "Heat Wave"', type: 'tournament', sport: 'baseball', divisions: ['Minors', 'Triple-A', 'Majors'], order: 4, active: true, archived: false, convenience_fee_cents: 300, price_options: AGE_PRICES, waiver_text: WAIVER, location: 'Iowa Park, TX', event_dates: 'June 13–14, 2026' },
  { id: 'hill-county-bash', title: 'Hillsboro "Hill County All-Star Bash"', type: 'tournament', sport: 'softball', divisions: ['Class C', 'Class B', 'Class A'], order: 5, active: true, archived: false, convenience_fee_cents: 300, price_options: AGE_PRICES, waiver_text: WAIVER, location: 'Wallace Park, Hillsboro, TX', event_dates: 'June 13, 2026' },
  { id: 'team-insurance', title: '2026 STS Team Insurance', type: 'product', sport: 'both', order: 6, active: true, archived: false, convenience_fee_cents: 0, price_options: [{ label: 'Team Insurance', cents: 5000 }], waiver_text: '', location: '', event_dates: 'Aug 1, 2025 – Jul 31, 2026' },
  { id: 'georgetown-fathers-day', title: 'Georgetown "Father\'s Day Classic"', type: 'tournament', sport: 'baseball', divisions: ['Minors', 'Triple-A', 'Majors'], order: 7, active: true, archived: false, convenience_fee_cents: 300, price_options: AGE_PRICES, waiver_text: WAIVER, location: 'Georgetown, TX', event_dates: 'June 20–21, 2026' },
  { id: 'clyde-summer-sizzle', title: 'Clyde "Summer Sizzle"', type: 'tournament', sport: 'baseball', divisions: ['Minors', 'Triple-A'], order: 8, active: true, archived: false, convenience_fee_cents: 300, price_options: AGE_PRICES, waiver_text: WAIVER, location: 'Clyde, TX', event_dates: 'June 27–28, 2026' },
  { id: 'san-angelo-belt-showdown', title: 'San Angelo "Stars & Stripes Belt Showdown"', type: 'tournament', sport: 'baseball', divisions: ['Minors', 'Triple-A'], order: 9, active: true, archived: false, convenience_fee_cents: 300, price_options: AGE_PRICES, waiver_text: WAIVER, location: 'San Angelo, TX', event_dates: 'July 11–12, 2026' },
  { id: 'gamepro-baseballs', title: 'STS GamePro Baseballs', type: 'product', sport: 'both', order: 10, active: true, archived: false, convenience_fee_cents: 0, price_options: [{ label: '1 Dozen', cents: 6000 }, { label: '2 Dozen', cents: 11000 }, { label: '3 Dozen', cents: 15000 }], waiver_text: '', location: '', event_dates: '' }
];

var SAMPLE_TEAMS = [
  { id: 'blacksox', name: 'Blacksox', slug: 'blacksox', sport: 'baseball', division: 'Minors', age_class: '7U', town: 'Brownwood, TX', coach_name: 'Tanir Horton', live: true, status: 'active', team_code: 'BLK7X', tournaments: ['Brownwood "Summer Slam Series"'], roster: [{ name: 'Tanir Horton', num: '1', dob: '2015-04-10', grade: '4' }, { name: 'C. Horton', num: '7', dob: '2015-09-02', grade: '4' }], w: 0, l: 0 },
  { id: 'btx-vice', name: 'BTX Vice', slug: 'btx-vice', sport: 'baseball', division: 'Minors', age_class: '10U', town: 'Belton, TX', coach_name: 'Randy Bates', live: true, status: 'active', team_code: 'VICE0', tournaments: ['Iowa Park "Heat Wave"'], roster: [{ name: 'Randy Bates', num: '3', dob: '2014-06-20', grade: '5' }], w: 0, l: 0 },
  { id: 'ctx-wolfpack', name: 'CTX Wolfpack', slug: 'ctx-wolfpack', sport: 'baseball', division: 'Triple-A', age_class: '12U', town: 'Waco, TX', coach_name: 'Dan Chiappe', live: true, status: 'active', team_code: 'WOLF2', tournaments: ['Brownwood "Summer Slam Series"', 'Iowa Park "Heat Wave"'], roster: [{ name: 'Dan Chiappe', num: '24', dob: '2013-03-15', grade: '6' }, { name: 'C. Horton', num: '14', dob: '2015-09-02', grade: '4', guest: true }], w: 0, l: 0 },
  // auto-created from a FREE ($0) season registration (reg r6) — see createTeamFromRegistration
  { id: 'comanche-bears', name: 'Comanche Bears', slug: 'comanche-bears', sport: 'baseball', division: 'Triple-A', age_class: '11U', town: 'Comanche, TX', coach_name: 'Will Rhodes', live: true, status: 'active', team_code: 'BEAR4', reg_id: 'r6', tournaments: ['2026 Fall/Spring Baseball Team Registration'], roster: [], w: 0, l: 0 }
];

var SAMPLE_REGS = [
  { id: 'r1', form_id: 'season-baseball', entry_no: 566900, status: 'completed', team_name: 'Blacksox', sport: 'baseball', division: 'Minors', age_class: '7U', town: 'Brownwood, TX', coach_name: 'Tanir Horton', coach_email: 'tanirhorton426@yahoo.com', coach_phone: '972-921-1760', waiver_agreed: true, payment_status: 'paid', amount_cents: 0, card_last4: '4242', clover_order_id: 'ORD-5566', paid_at: '2025-07-10T10:26:00', team_id: 'blacksox', team_code: 'BLK7X', created_at: '2025-07-10T10:26:00' },
  { id: 'r2', form_id: 'season-baseball', entry_no: 566904, status: 'completed', team_name: 'BTX Vice', sport: 'baseball', division: 'Minors', age_class: '10U', town: 'Belton, TX', coach_name: 'Randy Bates', coach_email: 'randybates@jimcosales.net', coach_phone: '817-874-9202', waiver_agreed: true, payment_status: 'paid', amount_cents: 0, card_last4: '1881', clover_order_id: 'ORD-5567', paid_at: '2025-07-10T10:48:00', team_id: 'btx-vice', team_code: 'VICE0', created_at: '2025-07-10T10:48:00' },
  { id: 'r3', form_id: 'brownwood-summer-slam', entry_no: 566929, status: 'completed', team_name: 'CTX Wolfpack', sport: 'baseball', division: 'Triple-A', age_class: '12U', town: 'Waco, TX', coach_name: 'Dan Chiappe', coach_email: 'wolfpackbaseballctx@gmail.com', coach_phone: '512-626-2921', waiver_agreed: true, payment_status: 'paid', amount_cents: 12800, card_last4: '0199', clover_order_id: 'ORD-5571', paid_at: '2025-07-10T12:08:00', team_id: 'ctx-wolfpack', team_code: 'WOLF2', created_at: '2025-07-10T12:08:00' },
  { id: 'r4', form_id: 'iowa-park-heat-wave', entry_no: 566980, status: 'completed', team_name: 'DTX Rangers', sport: 'baseball', division: 'Majors', age_class: '13U', town: 'Dallas, TX', coach_name: 'Emanuel Mercado', coach_email: 'lilerat@yahoo.com', coach_phone: '972-804-5982', waiver_agreed: true, payment_status: 'pending', amount_cents: 12800, card_last4: '', clover_order_id: '', paid_at: '', team_id: '', team_code: 'RNGR1', created_at: '2025-07-11T09:15:00' },
  { id: 'r5', form_id: 'hill-county-bash', entry_no: 567001, status: 'completed', team_name: 'Lady Heat', sport: 'softball', division: 'Class B', age_class: '12U', town: 'Hillsboro, TX', coach_name: 'Jared Carey', coach_email: 'jaredcarey@yahoo.com', coach_phone: '806-778-5237', waiver_agreed: true, payment_status: 'unpaid', amount_cents: 12800, card_last4: '', clover_order_id: '', paid_at: '', team_id: '', team_code: 'HEAT9', created_at: '2025-07-11T14:02:00' },
  { id: 'r6', form_id: 'season-baseball', entry_no: 567002, status: 'completed', team_name: 'Comanche Bears', sport: 'baseball', division: 'Triple-A', age_class: '11U', town: 'Comanche, TX', coach_name: 'Will Rhodes', coach_email: 'wrhodes@example.com', coach_phone: '325-555-0148', waiver_agreed: true, payment_status: 'free', amount_cents: 0, card_last4: '', clover_order_id: '', paid_at: '', team_id: 'comanche-bears', team_code: 'BEAR4', created_at: '2025-07-11T16:20:00' }
];

// session-local mutable copies for sample mode
var _forms = SAMPLE_FORMS.map(function (f) { return Object.assign({}, f); });
var _teams = SAMPLE_TEAMS.map(function (t) { return Object.assign({}, t); });
var _regs = SAMPLE_REGS.map(function (r) { return Object.assign({}, r); });
var _entrySeq = 567100;

// ── Admins / directors (Season Admins) — doc id === Firebase Auth UID ─
var SAMPLE_ADMINS = [
  { id: 'uid-keith', email: 'keithphilips34@gmail.com', name: 'Keith Philips', role: 'super',    events: [], active: true },
  { id: 'uid-carl',  email: 'carl@example.com',  name: 'Carl Moore',  role: 'director', events: ['brownwood-summer-slam'], active: true },
  { id: 'uid-sonny', email: 'sonny@example.com', name: 'Sonny Wilson', role: 'director', events: ['iowa-park-heat-wave', 'hill-county-bash'], active: true }
];
var _admins = SAMPLE_ADMINS.map(function (a) { return Object.assign({}, a); });
// Sample mode has no Auth — the admin page picks a "preview as" identity (default super).
var _sampleScope = _admins[0];
export function _setSampleScope(adminId) {
  if (isConfigured) return _sampleScope;   // identity comes from Firebase Auth in prod
  var a = _admins.find(function (x) { return x.id === adminId; });
  if (a) _sampleScope = a;
  return _sampleScope;
}

// ── Games (schedule + scores) — form_id is the event/scoping key ─────
var SAMPLE_GAMES = [
  { id: 'g1', form_id: 'brownwood-summer-slam', sport: 'baseball', division: 'Triple-A', away: 'CTX Wolfpack', home: 'Blacksox', date: '2026-06-13', time: '09:00', field: 'Field 1', away_score: 7, home_score: 4, done: true },
  { id: 'g2', form_id: 'brownwood-summer-slam', sport: 'baseball', division: 'Triple-A', away: 'Blacksox', home: 'Brownwood Bombers', date: '2026-06-13', time: '11:30', field: 'Field 1', away_score: 5, home_score: 5, done: true },
  { id: 'g3', form_id: 'brownwood-summer-slam', sport: 'baseball', division: 'Triple-A', away: 'CTX Wolfpack', home: 'Brownwood Bombers', date: '2026-06-13', time: '14:00', field: 'Field 2', away_score: null, home_score: null, done: false },
  { id: 'g4', form_id: 'brownwood-summer-slam', sport: 'baseball', division: 'Triple-A', away: 'Blacksox', home: 'CTX Wolfpack', date: '2026-06-14', time: '10:00', field: 'Field 1', away_score: null, home_score: null, done: false },
  { id: 'g5', form_id: 'iowa-park-heat-wave', sport: 'baseball', division: 'Majors', away: 'DTX Rangers', home: 'BTX Vice', date: '2026-06-13', time: '09:00', field: 'North', away_score: 10, home_score: 2, done: true },
  { id: 'g6', form_id: 'iowa-park-heat-wave', sport: 'baseball', division: 'Majors', away: 'BTX Vice', home: 'DTX Rangers', date: '2026-06-14', time: '12:00', field: 'North', away_score: null, home_score: null, done: false },
  { id: 'g7', form_id: 'hill-county-bash', sport: 'softball', division: 'Class B', away: 'Lady Heat', home: 'Hill County Storm', date: '2026-06-13', time: '10:00', field: 'Field A', away_score: 8, home_score: 3, done: true },
  { id: 'g8', form_id: 'hill-county-bash', sport: 'softball', division: 'Class B', away: 'Hill County Storm', home: 'Lady Heat', date: '2026-06-13', time: '13:00', field: 'Field A', away_score: null, home_score: null, done: false },
  // a sample single-elim bracket on the Brownwood event (g = bracket game number; away/home may be WG-n refs)
  { id: 'b1', form_id: 'brownwood-summer-slam', sport: 'baseball', division: 'Triple-A', g: 1, away: 'CTX Wolfpack', home: 'Lonestar Reds', date: '2026-06-14', time: '13:00', field: 'Field 1', away_score: 11, home_score: 1, done: true },
  { id: 'b2', form_id: 'brownwood-summer-slam', sport: 'baseball', division: 'Triple-A', g: 2, away: 'Blacksox', home: 'Brownwood Bombers', date: '2026-06-14', time: '15:30', field: 'Field 1', away_score: 4, home_score: 7, done: true },
  { id: 'b3', form_id: 'brownwood-summer-slam', sport: 'baseball', division: 'Triple-A', g: 3, away: 'WG-1', home: 'WG-2', date: '2026-06-14', time: '18:00', field: 'Field 1', away_score: null, home_score: null, done: false },
  // a sample DOUBLE-elim bracket on Iowa Park (winners + losers + grand final), played out → champion
  { id: 'ip-b1', form_id: 'iowa-park-heat-wave', sport: 'baseball', division: 'Majors', g: 1, away: 'DTX Rangers', home: 'Hill Hawks',    date: '2026-06-13', time: '09:00', field: 'North', away_score: 8, home_score: 3, done: true },
  { id: 'ip-b2', form_id: 'iowa-park-heat-wave', sport: 'baseball', division: 'Majors', g: 2, away: 'BTX Vice',    home: 'Lonestar Reds', date: '2026-06-13', time: '11:30', field: 'North', away_score: 5, home_score: 4, done: true },
  { id: 'ip-b3', form_id: 'iowa-park-heat-wave', sport: 'baseball', division: 'Majors', g: 3, away: 'WG-1', home: 'WG-2', date: '2026-06-13', time: '14:00', field: 'North', away_score: 6, home_score: 5, done: true },
  { id: 'ip-b4', form_id: 'iowa-park-heat-wave', sport: 'baseball', division: 'Majors', g: 4, away: 'LG-1', home: 'LG-2', date: '2026-06-13', time: '14:00', field: 'South', away_score: 7, home_score: 2, done: true },
  { id: 'ip-b5', form_id: 'iowa-park-heat-wave', sport: 'baseball', division: 'Majors', g: 5, away: 'WG-4', home: 'LG-3', date: '2026-06-14', time: '10:00', field: 'North', away_score: 1, home_score: 9, done: true },
  { id: 'ip-b6', form_id: 'iowa-park-heat-wave', sport: 'baseball', division: 'Majors', g: 6, away: 'WG-3', home: 'WG-5', date: '2026-06-14', time: '13:00', field: 'North', away_score: 4, home_score: 2, done: true },
  { id: 'ip-b7', form_id: 'iowa-park-heat-wave', sport: 'baseball', division: 'Majors', g: 7, away: 'WG-6', home: 'LG-6', date: '2026-06-14', time: '15:30', field: 'North', away_score: null, home_score: null, done: false }
];
var _games = SAMPLE_GAMES.map(function (g) { return Object.assign({}, g); });
var _gameSeq = 9000;   // unique sample-mode ids for batch-created games

// ── TEAM INSURANCE (admin-only) ──────────────────────────────────────
// One record per team_id. status: none implied (no record) | pending | approved
// | rejected. source: 'purchased' (bought through the site → auto-approved) or
// 'uploaded' (team's own policy → needs admin approval). Lives in the gated
// team_insurance collection; never shown on the public team page.
var SAMPLE_INSURANCE = [
  { team_id: 'blacksox', team_name: 'Blacksox', status: 'approved', source: 'purchased', carrier: 'Small Town Select Group Policy', policy_no: 'STS-2026-0142', doc_name: '', doc_url: '', coverage_start: '2025-08-01', coverage_end: '2026-07-31', submitted_at: '2025-07-12T09:00:00', reviewed_at: '2025-07-12T09:05:00', note: '' },
  { team_id: 'ctx-wolfpack', team_name: 'CTX Wolfpack', status: 'pending', source: 'uploaded', carrier: 'Bolt Insurance', policy_no: 'BLT-99812', doc_name: 'wolfpack-coi-2026.pdf', doc_url: 'assets/sample-coi.pdf', coverage_start: '2025-08-01', coverage_end: '2026-07-31', submitted_at: '2025-07-20T14:30:00', reviewed_at: '', note: '' },
  { team_id: 'btx-vice', team_name: 'BTX Vice', status: 'rejected', source: 'uploaded', carrier: 'K&K Insurance', policy_no: 'KK-2231', doc_name: 'vice-policy.pdf', doc_url: 'assets/sample-coi.pdf', coverage_start: '2025-08-01', coverage_end: '2026-07-31', submitted_at: '2025-07-18T10:00:00', reviewed_at: '2025-07-19T11:00:00', note: 'STS not listed as additionally insured — please add and re-upload.' },
];
var _insurance = SAMPLE_INSURANCE.map(function (x) { return Object.assign({}, x); });

// ── ACTIVITY FEED (admin notifications log) ──────────────────────────
// Every finalized event (registration, payment, roster change, insurance,
// order) appends a row here so the admin has a running log, not just email.
var SAMPLE_ACTIVITY = [
  { id: 'a1', type: 'roster', team_name: 'CTX Wolfpack', title: 'CTX Wolfpack roster updated', detail: '2 added', actor: 'Dan Chiappe', at: '2026-06-12T15:40:00' },
  { id: 'a2', type: 'insurance', team_name: 'Blacksox', title: 'Insurance purchased — Blacksox', detail: 'Tanir Horton', actor: 'Tanir Horton', at: '2026-06-12T14:05:00' },
  { id: 'a3', type: 'payment', team_name: 'CTX Wolfpack', title: 'Paid registration — CTX Wolfpack', detail: 'Brownwood "Summer Slam Series" · $128.00', actor: 'Dan Chiappe', at: '2026-06-11T12:08:00' },
  { id: 'a4', type: 'order', team_name: 'Blacksox', title: 'Order — STS GamePro Baseballs', detail: 'Blacksox · $60.00', actor: 'Tanir Horton', at: '2026-06-10T09:30:00' },
  { id: 'a5', type: 'registration', team_name: 'Comanche Bears', title: 'New team registered — Comanche Bears', detail: '2026 Fall/Spring Baseball Team Registration', actor: 'Will Rhodes', at: '2026-06-09T16:20:00' },
];
var _activity = SAMPLE_ACTIVITY.map(function (x) { return Object.assign({}, x); });

// ── SCALE MODE (?scale=N, sample/demo only) ──────────────────────────
// Synthesizes N extra registrations (+ live teams for the paid season ones) so
// the admin and public pages can be exercised at Keith's REAL volume (~1,150
// entries / ~700 teams) without touching Firebase. Deterministic: same N →
// same data. Try admin.html?scale=1163 or show Keith ?demo=1&scale=1163.
(function () {
  if (isConfigured) return;
  // Read ?scale=N from the URL; persist it in localStorage (like demo mode) so the
  // fake teams stay populated as you click around. ?scale=0 clears it.
  var n = 0, fromUrl = null;
  try { var sp = new URLSearchParams(location.search); if (sp.has('scale')) fromUrl = sp.get('scale'); } catch (e) {}
  try {
    if (fromUrl !== null) {
      n = parseInt(fromUrl, 10) || 0;
      if (n > 0) localStorage.setItem('sts-scale', String(n)); else localStorage.removeItem('sts-scale');
    } else {
      n = parseInt(localStorage.getItem('sts-scale'), 10) || 0;
    }
  } catch (e) { n = parseInt(fromUrl, 10) || 0; }
  if (n < 1) return;
  n = Math.min(n, 5000);
  var TOWNS = ['Brownwood', 'Early', 'Clyde', 'Abilene', 'San Angelo', 'Georgetown', 'Iowa Park', 'Hillsboro', 'Comanche', 'Stephenville', 'Belton', 'Waco', 'Killeen', 'Temple', 'Burnet', 'Llano', 'Goldthwaite', 'Hamilton', 'Dublin', 'Cisco'];
  var MASCOTS = ['Hawks', 'Mustangs', 'Raiders', 'Gators', 'Longhorns', 'Outlaws', 'Heat', 'Storm', 'Sluggers', 'Bandits', 'Bulldogs', 'Wranglers', 'Rattlers', 'Aces', 'Renegades', 'Scrappers', 'Vipers', 'Titans', 'Hounds', 'Stallions'];
  var FIRST = ['Jake', 'Cody', 'Travis', 'Lance', 'Misty', 'Shawna', 'Colt', 'Tanner', 'Reese', 'Dusty', 'Sierra', 'Wade'];
  var LAST = ['Henderson', 'McCoy', 'Whitfield', 'Drummond', 'Sparks', 'Holloway', 'Reyes', 'Tucker', 'Boyd', 'Lambert'];
  // weighted roughly like Keith's QuickScores: mostly season-baseball entries
  var FORM_MIX = ['season-baseball', 'season-baseball', 'season-baseball', 'season-baseball', 'season-baseball', 'season-baseball', 'season-baseball', 'season-softball', 'team-insurance', 'team-insurance', 'brownwood-summer-slam', 'iowa-park-heat-wave', 'hill-county-bash', 'georgetown-fathers-day'];
  var BB_AGES = ['7U', '8U Coach Pitch', '9U', '10U', '11U', '12U', '13U', '14U'];
  var SB_AGES = ['10U', '12U', '14U', '16U'];
  var BB_DIVS = ['Minors', 'Triple-A', 'Majors'], SB_DIVS = ['Class C', 'Class B', 'Class A'];
  var PAY_MIX = ['paid', 'paid', 'paid', 'paid', 'unpaid', 'pending', 'free'];
  // Deterministic fake roster for a team: 10–13 players, ages clustered just under
  // the age cap, a couple of guests. dob is included so the admin view + age math
  // look real; the public pages derive "Age (5/1)" from it via STS.playerAge.
  var P_FIRST = ['Mason', 'Liam', 'Noah', 'Ethan', 'Caleb', 'Hunter', 'Wyatt', 'Brody', 'Carson', 'Landon', 'Jaxon', 'Easton', 'Bryce', 'Tate', 'Kade', 'Riley', 'Parker', 'Aiden', 'Gage', 'Brooks', 'Knox', 'Ryder', 'Beau', 'Cooper'];
  var P_LAST = ['Henderson', 'McCoy', 'Whitfield', 'Drummond', 'Sparks', 'Holloway', 'Reyes', 'Tucker', 'Boyd', 'Lambert', 'Vaughn', 'Carter', 'Briggs', 'Mathis', 'Pope', 'Galloway', 'Hardin', 'Sutton', 'Means', 'Crowley'];
  function fakeRoster(ageClass, seed) {
    var cap = parseInt(String(ageClass), 10) || 12;   // "12U" → 12, "8U Coach Pitch" → 8
    var seasonYr = (window.LEAGUE_CONFIG && LEAGUE_CONFIG.season && LEAGUE_CONFIG.season.year) || 2026;
    var size = 10 + (seed % 4), roster = [], usedNums = {};
    for (var k = 0; k < size; k++) {
      var s = seed * 17 + k * 7;
      var age = cap - (k % 3); if (age < 4) age = cap;   // cluster just under the cap
      var by = seasonYr - age, mo = 1 + (s % 12), day = 1 + (s % 27);
      var num = 1 + (s % 45); while (usedNums[num]) num++; usedNums[num] = 1;
      var grade = age - 6; grade = grade <= 0 ? 'K' : String(grade);
      roster.push({
        num: String(num),
        name: P_FIRST[s % P_FIRST.length] + ' ' + P_LAST[(s * 3) % P_LAST.length],
        grade: grade,
        dob: by + '-' + String(mo).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
        guest: (k > 0 && k % 9 === 0)
      });
    }
    return roster;
  }
  for (var i = 0; i < n; i++) {
    var fid = FORM_MIX[i % FORM_MIX.length];
    var form = _forms.find(function (f) { return f.id === fid; }) || _forms[0];
    var sport = form.sport === 'softball' ? 'softball' : 'baseball';
    var town = TOWNS[i % TOWNS.length], mascot = MASCOTS[Math.floor(i / TOWNS.length) % MASCOTS.length];
    var cycle = Math.floor(i / (TOWNS.length * MASCOTS.length));
    var teamName = town + ' ' + mascot + (cycle ? ' ' + (cycle + 1) : '');
    var coach = FIRST[i % FIRST.length] + ' ' + LAST[(i * 3) % LAST.length];
    var pay = PAY_MIX[i % PAY_MIX.length];
    var fee = ((form.price_options && form.price_options[0] && form.price_options[0].cents) || (form.type === 'season' ? 2500 : 12800)) + (form.convenience_fee_cents || 0);
    if (fee === 0 && pay !== 'free') pay = 'free';
    var mo = 8 + (i % 10); var yr2 = mo > 12 ? '2026' : '2025'; mo = mo > 12 ? mo - 12 : mo;
    var created = yr2 + '-' + String(mo).padStart(2, '0') + '-' + String(1 + (i % 28)).padStart(2, '0') + 'T' + String(8 + (i % 12)).padStart(2, '0') + ':' + String((i * 13) % 60).padStart(2, '0') + ':00';
    var slug = slugify(teamName);
    var paidish = pay === 'paid' || pay === 'free';
    _regs.push({
      id: 'sc' + i, form_id: fid, entry_no: 567100 + i, status: (i % 23 === 0 ? 'archived' : 'completed'),
      team_name: teamName, sport: sport,
      division: sport === 'softball' ? SB_DIVS[i % 3] : BB_DIVS[i % 3],
      age_class: sport === 'softball' ? SB_AGES[i % SB_AGES.length] : BB_AGES[i % BB_AGES.length],
      town: town + ', TX', coach_name: coach,
      coach_email: coach.toLowerCase().replace(/\s+/g, '.') + i + '@example.com',
      coach_phone: '325-555-' + String(1000 + (i * 7) % 9000),
      waiver_agreed: true, payment_status: pay, amount_cents: fee,
      card_last4: pay === 'paid' ? String(1000 + (i * 37) % 9000) : '',
      clover_order_id: pay === 'paid' ? 'ORD-' + (6000 + i) : '',
      paid_at: paidish ? created : '', created_at: created,
      team_id: paidish && form.type === 'season' ? slug : '', team_code: 'SC' + String(100 + (i % 900))
    });
    // a live public team for each paid/free SEASON registration (≈ Keith's team count)
    if (paidish && form.type === 'season' && !_teams.some(function (t) { return (t.slug || t.id) === slug; })) {
      _teams.push({
        id: slug, slug: slug, name: teamName, sport: sport,
        division: sport === 'softball' ? SB_DIVS[i % 3] : BB_DIVS[i % 3],
        age_class: sport === 'softball' ? SB_AGES[i % SB_AGES.length] : BB_AGES[i % BB_AGES.length],
        town: town + ', TX', coach_name: coach, live: true, status: 'active',
        team_code: 'SC' + String(100 + (i % 900)), reg_id: 'sc' + i,
        tournaments: [form.title],
        roster: fakeRoster(sport === 'softball' ? SB_AGES[i % SB_AGES.length] : BB_AGES[i % BB_AGES.length], i),
        w: 0, l: 0
      });
    }
  }

  // ── INSURANCE: seed a realistic mix across generated teams ────────────
  try {
    var insSeen = {}; _insurance.forEach(function (r) { insSeen[r.team_id] = 1; });
    var CARRIERS = ['Bolt Insurance', 'K&K Insurance', 'Sadler Sports', 'Philadelphia Insurance'];
    _teams.filter(function (t) { return t.live && !insSeen[t.id]; }).forEach(function (t, k) {
      var m = k % 5;
      if (m === 0) return;   // ~20% have nothing on file
      var sub = '2025-07-' + String(8 + (k % 18)).padStart(2, '0') + 'T12:00:00';
      var rec = { team_id: t.id, team_name: t.name, coverage_start: '2025-08-01', coverage_end: '2026-07-31', submitted_at: sub, reviewed_at: '', note: '' };
      if (m === 1) Object.assign(rec, { status: 'pending', source: 'uploaded', carrier: CARRIERS[k % 4], policy_no: 'POL-' + (10000 + k), doc_name: slugify(t.name) + '-coi.pdf', doc_url: 'assets/sample-coi.pdf' });
      else if (m === 4) Object.assign(rec, { status: 'rejected', source: 'uploaded', carrier: 'K&K Insurance', policy_no: 'POL-' + (20000 + k), doc_name: slugify(t.name) + '-policy.pdf', doc_url: 'assets/sample-coi.pdf', reviewed_at: '2025-07-' + String(12 + (k % 16)).padStart(2, '0') + 'T09:00:00', note: 'STS not listed as additionally insured — please re-upload.' });
      else Object.assign(rec, { status: 'approved', source: (k % 2 ? 'purchased' : 'uploaded'), carrier: (k % 2 ? 'Small Town Select Group Policy' : 'Sadler Sports'), policy_no: 'POL-' + (30000 + k), doc_name: (k % 2 ? '' : slugify(t.name) + '-coi.pdf'), doc_url: (k % 2 ? '' : 'assets/sample-coi.pdf'), reviewed_at: '2025-07-' + String(9 + (k % 18)).padStart(2, '0') + 'T10:00:00' });
      _insurance.push(rec);
    });
  } catch (e) { /* demo-only */ }

  // ── ACTIVITY: seed a feed from the generated entries + insurance ──────
  try {
    _regs.slice(0, 40).forEach(function (r, k) {
      if (!/^sc/.test(r.id)) return;
      var paid = r.payment_status === 'paid', free = r.payment_status === 'free';
      if (!paid && !free) return;
      _activity.push({
        id: 'act' + k, type: paid ? 'payment' : 'registration', team_name: r.team_name,
        title: (paid ? 'Paid registration — ' : 'New team registered — ') + r.team_name,
        detail: free ? r.form_title || '' : ((r.form_title || '') + ' · $' + ((r.amount_cents || 0) / 100).toFixed(2)).replace(/^ · /, ''),
        actor: r.coach_name || '', at: r.created_at || '2026-06-01T12:00:00'
      });
    });
    _insurance.filter(function (x) { return x.source === 'purchased' && x.status === 'approved'; }).slice(0, 8).forEach(function (x, k) {
      _activity.push({ id: 'actins' + k, type: 'insurance', team_name: x.team_name, title: 'Insurance purchased — ' + x.team_name, detail: '', actor: '', at: x.submitted_at || '2026-06-05T12:00:00' });
    });
  } catch (e) { /* demo-only */ }

  // ── GAMES: fully populate every tournament that has none ──────────────
  // Powers schedule, standings, brackets, champions, and team records — all
  // derive from games. Pool round-robin (g==null) + a 4-team double-elim bracket
  // mirroring the proven iowa-park sample structure (champion = first seed).
  try {
    var FIELDS = ['Field 1', 'Field 2', 'North', 'South', 'Field A', 'Field B'];
    var gid = 70000;
    function emit(g) { g.id = 'scg' + (gid++); _games.push(g); }
    function poolGames(fid, sport, division, names, date) {
      // future date for the unplayed (upcoming) games so team pages show a schedule
      var later = date.replace(/-(\d\d)$/, function (m, d) { return '-' + String(Math.min(28, (+d) + 7)).padStart(2, '0'); });
      for (var a = 0; a < names.length; a++) for (var b = a + 1; b < names.length; b++) {
        var s = a * 7 + b * 3;
        var open = ((a + b) % 4) === 3;   // ~1 in 4 left unplayed → "Upcoming"
        emit({ form_id: fid, sport: sport, division: division, g: null, away: names[a], home: names[b],
          date: open ? later : date, time: ['09:00', '11:30', '14:00', '16:30'][(a + b) % 4], field: FIELDS[(a + b) % FIELDS.length],
          away_score: open ? null : 3 + (s % 9), home_score: open ? null : 2 + ((s * 2) % 8), done: !open });
      }
    }
    function bracketGames(fid, sport, division, t, date) {
      // proven structure: champion resolves to t[0]. g7 is the if-necessary game (unplayed).
      var rows = [
        { g: 1, away: t[0], home: t[3], as: 8, hs: 3 },
        { g: 2, away: t[1], home: t[2], as: 5, hs: 4 },
        { g: 3, away: 'WG-1', home: 'WG-2', as: 6, hs: 5 },
        { g: 4, away: 'LG-1', home: 'LG-2', as: 7, hs: 2 },
        { g: 5, away: 'WG-4', home: 'LG-3', as: 1, hs: 9 },
        { g: 6, away: 'WG-3', home: 'WG-5', as: 4, hs: 2 },
        { g: 7, away: 'WG-6', home: 'LG-6', as: null, hs: null, open: true }
      ];
      rows.forEach(function (r) {
        emit({ form_id: fid, sport: sport, division: division, g: r.g, away: r.away, home: r.home,
          date: date, time: ['09:00', '11:30', '14:00', '16:30'][r.g % 4], field: FIELDS[r.g % FIELDS.length],
          away_score: r.as, home_score: r.hs, done: !r.open });
      });
    }
    var liveBB = _teams.filter(function (t) { return t.live && t.sport === 'baseball'; }).map(function (t) { return t.name; });
    var liveSB = _teams.filter(function (t) { return t.live && t.sport === 'softball'; }).map(function (t) { return t.name; });
    var emptyTourneys = _forms.filter(function (f) {
      return f.type === 'tournament' && !_games.some(function (g) { return g.form_id === f.id; });
    });
    emptyTourneys.forEach(function (f, idx) {
      var sport = f.sport === 'softball' ? 'softball' : 'baseball';
      var src = sport === 'softball' ? liveSB : liveBB;
      if (src.length < 6) return;
      var div = (f.divisions && f.divisions[0]) || 'Minors';
      var picks = [];
      for (var p = 0; p < 6; p++) picks.push(src[(idx * 6 + p) % src.length]);
      var date = '2026-0' + (6 + (idx % 2)) + '-' + String(13 + (idx % 14)).padStart(2, '0');
      poolGames(f.id, sport, div, picks, date);
      if (idx === 0) {
        // NCS-style TIERED championship: 3 tiers, each its own bracket + champion
        ['Diamond', 'Platinum', 'Gold'].forEach(function (tier, ti) {
          var slice = [picks[ti % 6], picks[(ti + 1) % 6], picks[(ti + 2) % 6], picks[(ti + 3) % 6]];
          bracketGames(f.id, sport, tier, slice, date);
        });
      } else {
        bracketGames(f.id, sport, div, picks.slice(0, 4), date);
      }
    });
  } catch (e) { /* demo-only; never break the data module */ }
})();

// ── Firestore plumbing ───────────────────────────────────────────────
async function fsAll(col) {
  var snap = await getDocs(collection(db, col));
  return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
}
async function fsOne(col, id) {
  var s = await getDoc(doc(db, col, id));
  return s.exists() ? Object.assign({ id: s.id }, s.data()) : null;
}

// ── FORMS ────────────────────────────────────────────────────────────
export async function loadForms(opts) {
  opts = opts || {};
  var all = isConfigured ? await fsAll('forms') : _forms.slice();
  if (!opts.includeInactive) all = all.filter(function (f) { return f.active && !f.archived; });
  return all.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}
export async function getForm(id) {
  if (isConfigured) return fsOne('forms', id);
  return _forms.find(function (f) { return f.id === id; }) || null;
}
export async function saveForm(form) {
  if (isConfigured) {
    if (form.id) { await setDoc(doc(db, 'forms', form.id), form, { merge: true }); return form.id; }
    var ref = await addDoc(collection(db, 'forms'), form); return ref.id;
  }
  if (form.id) { var i = _forms.findIndex(function (f) { return f.id === form.id; }); if (i >= 0) _forms[i] = Object.assign(_forms[i], form); else _forms.push(form); return form.id; }
  form.id = slugify(form.title) || ('form-' + Date.now()); _forms.push(form); return form.id;
}
// Hard-delete a form (super only). Archiving is usually safer — this leaves any
// existing registrations/games without an event, so the admin warns first.
export async function deleteForm(id) {
  if (isConfigured) { await deleteDoc(doc(db, 'forms', id)); return; }
  var i = _forms.findIndex(function (f) { return f.id === id; }); if (i >= 0) _forms.splice(i, 1);
}

// ── REGISTRATIONS (entries) ──────────────────────────────────────────
export async function createRegistration(data) {
  var rec = Object.assign({
    status: 'completed', payment_status: (Number(data.amount_cents) > 0 ? 'unpaid' : 'free'),
    team_code: genTeamCode(), created_at: (isConfigured ? null : new Date().toISOString())
  }, data);
  rec.team_code = data.team_code || rec.team_code;
  if (isConfigured) {
    rec.created_at = serverTimestamp();
    // sequential-ish entry number via a counter doc (best-effort)
    rec.entry_no = await nextEntryNo();
    var ref = await addDoc(collection(db, 'registrations'), rec);
    return { id: ref.id, entry_no: rec.entry_no, team_code: rec.team_code };
  }
  rec.id = 'r' + (_regs.length + 1); rec.entry_no = ++_entrySeq; _regs.push(rec);
  return { id: rec.id, entry_no: rec.entry_no, team_code: rec.team_code };
}
async function nextEntryNo() {
  try {
    var snap = await getCountFromServer(collection(db, 'registrations'));
    return 566900 + (snap.data().count || 0) + 1;
  } catch (e) { return 566900 + Math.floor(Math.random() * 9000); }
}
export async function loadRegistrations(opts) {
  opts = opts || {};
  var all = isConfigured ? await fsAll('registrations') : _regs.slice();
  if (opts.status) all = all.filter(function (r) { return (r.status || 'completed') === opts.status; });
  if (opts.formId) all = all.filter(function (r) { return r.form_id === opts.formId; });
  return all.sort(function (a, b) { return (b.entry_no || 0) - (a.entry_no || 0); });
}
export async function updateRegistration(id, fields) {
  if (isConfigured) { await updateDoc(doc(db, 'registrations', id), fields); return; }
  var r = _regs.find(function (x) { return x.id === id; }); if (r) Object.assign(r, fields);
}
export async function getRegistrationBySession(sessionId) {
  if (isConfigured) {
    var snap = await getDocs(query(collection(db, 'registrations'), where('clover_session_id', '==', sessionId)));
    return snap.empty ? null : Object.assign({ id: snap.docs[0].id }, snap.docs[0].data());
  }
  return _regs.find(function (r) { return r.clover_session_id === sessionId; }) || null;
}

// ── TEAMS ────────────────────────────────────────────────────────────
export async function loadTeams(opts) {
  opts = opts || {};
  var all = isConfigured ? await fsAll('teams') : _teams.slice();
  if (!opts.includeHidden) all = all.filter(function (t) { return t.live && t.status !== 'archived'; });
  if (opts.sport) all = all.filter(function (t) { return t.sport === opts.sport; });
  return all.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
}
export async function getTeam(id) {
  if (isConfigured) {
    var byId = await fsOne('teams', id); if (byId) return byId;
    var snap = await getDocs(query(collection(db, 'teams'), where('slug', '==', id)));
    return snap.empty ? null : Object.assign({ id: snap.docs[0].id }, snap.docs[0].data());
  }
  return _teams.find(function (t) { return t.id === id || t.slug === id; }) || null;
}
export async function saveTeamRoster(teamId, roster, code) {
  // In production this routes through /api/roster-save.js (server re-checks the code).
  if (isConfigured) {
    var res = await fetch('/api/roster-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: teamId, roster: roster, code: code }) });
    if (!res.ok) throw new Error('Save failed'); return;
  }
  var t = _teams.find(function (x) { return x.id === teamId || x.slug === teamId; });
  if (!t) throw new Error('Team not found');
  if (String(t.team_code) !== String(code)) throw new Error('Wrong team code');
  t.roster = roster;
}
// Admin-only FULL roster (includes dob for eligibility). The PUBLIC teams doc no
// longer carries dob — birthdates live in the gated team_rosters/{teamId} collection
// (Admin-SDK writes via /api/roster-save; admins read it under the firestore rule).
// Sample mode keeps the full roster in-memory.
export async function getTeamRoster(teamId) {
  if (isConfigured) {
    try { var gr = await fsOne('team_rosters', teamId); if (gr && Array.isArray(gr.roster)) return gr.roster; } catch (e) {}
    var t = await getTeam(teamId); return (t && Array.isArray(t.roster)) ? t.roster : [];   // fallback: legacy / pre-split docs
  }
  var s = _teams.find(function (x) { return x.id === teamId || x.slug === teamId; });
  return (s && Array.isArray(s.roster)) ? s.roster : [];
}

// ── Insurance (admin-only) ───────────────────────────────────────────
export async function loadInsurance() {
  if (isConfigured) { try { return await fsAll('team_insurance'); } catch (e) { return []; } }
  return _insurance.slice();
}
export async function getTeamInsurance(teamId) {
  var all = await loadInsurance();
  return all.find(function (x) { return x.team_id === teamId || x.id === teamId; }) || null;
}
// Admin approve/reject (admin.html is signed-in super → may write team_insurance).
export async function setInsuranceStatus(teamId, patch) {
  if (isConfigured) { await setDoc(doc(db, 'team_insurance', teamId), patch, { merge: true }); return; }
  var rec = _insurance.find(function (x) { return x.team_id === teamId; });
  if (rec) Object.assign(rec, patch); else _insurance.push(Object.assign({ team_id: teamId }, patch));
}

// ── Activity feed (admin) ────────────────────────────────────────────
export async function loadActivity() {
  var all = isConfigured ? await fsAll('activity').catch(function () { return []; }) : _activity.slice();
  return all.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
}

// ── VENUES / FIELDS (admin-managed master list) ──────────────────────
// Editable list of host cities + their fields. Stored in site_content/venues;
// falls back to config.js venues (the seed). Powers the Locations page + the
// tournament creator's field picker.
var _venuesOverride = null;
function cloneCity(v) { return { city: v.city || '', places: (v.places || []).slice() }; }
export async function loadVenues() {
  if (_venuesOverride) return _venuesOverride.map(cloneCity);
  if (isConfigured) {
    try { var d = await fsOne('site_content', 'venues'); if (d && Array.isArray(d.venues) && d.venues.length) return d.venues.map(cloneCity); } catch (e) {}
  }
  return ((typeof window !== 'undefined' && window.LEAGUE_CONFIG && LEAGUE_CONFIG.venues) || []).map(cloneCity);
}
export async function saveVenues(venues) {
  var clean = (venues || []).map(cloneCity).filter(function (v) { return v.city; });
  if (isConfigured) { await setDoc(doc(db, 'site_content', 'venues'), { venues: clean }, { merge: true }); }
  else { _venuesOverride = clean; }
  return clean.length;
}
// Auto-create the public team page from a registration. The Clover webhook does
// this for PAID entries; this is the client-side path for FREE ($0) team entries
// (and any future server endpoint can call the same shape). Idempotent per
// REGISTRATION (re-submitting the same reg reuses its team) and collision-safe:
// two different registrations that share a team name get distinct team docs
// (slug, slug-2, slug-3…) so neither orphans the other. Returns the team slug.
function buildTeamDoc(reg, slug) {
  return {
    name: reg.team_name, slug: slug, sport: reg.sport || '', division: reg.division || '',
    age_class: reg.age_class || '', town: reg.town || '', reg_id: reg.id || '', team_code: reg.team_code || '',
    coach_name: reg.coach_name || '',   // NAME ONLY — never email/phone on a public team doc
    // PUBLIC doc roster — never a child's dob (PII stays in gated team_rosters/{id}).
    // age51 = derived age as of the May 1 cutoff, the only age info shown publicly.
    roster: (Array.isArray(reg.roster) ? reg.roster : []).map(function (p) {
      return { num: p.num || '', name: p.name || '', grade: p.grade || '', guest: !!p.guest, age51: p.dob ? ageAsOfMay1(p.dob) : '' };
    }),
    tournaments: reg.form_title ? [reg.form_title] : [],
    live: true, status: 'active', w: 0, l: 0, t: 0, rs: 0, ra: 0
  };
}
export async function createTeamFromRegistration(reg) {
  if (!reg || !reg.team_name) return null;
  var base = slugify(reg.team_name) || ('team-' + (reg.id || Date.now()));
  if (isConfigured) {
    // already created for THIS registration? reuse it (idempotent on resubmit)
    if (reg.id) {
      var mine = await getDocs(query(collection(db, 'teams'), where('reg_id', '==', reg.id)));
      if (!mine.empty) return mine.docs[0].id;
    }
    // find a free slug so we never clobber a different team with the same name
    var slug = base, i = 2;
    while (await fsOne('teams', slug)) { slug = base + '-' + i; i++; }
    await setDoc(doc(db, 'teams', slug), buildTeamDoc(reg, slug));
    if (reg.id) { try { await updateDoc(doc(db, 'registrations', reg.id), { team_id: slug }); } catch (e) {} }
    return slug;
  }
  var mineS = _teams.find(function (x) { return reg.id && x.reg_id === reg.id; });
  if (mineS) return mineS.slug || mineS.id;
  var s = base, k = 2;
  while (_teams.some(function (x) { return (x.slug || x.id) === s; })) { s = base + '-' + k; k++; }
  var td = buildTeamDoc(reg, s); td.id = s; _teams.push(td);
  var r = _regs.find(function (x) { return x.id === reg.id; }); if (r) r.team_id = s;
  return s;
}

// ── CHAMPIONS (admin-uploaded winner photos; merged with live bracket
// champions + the static data/champions-photos.json archive on champions.html) ──
var SAMPLE_CHAMPIONS = [];
var _champions = SAMPLE_CHAMPIONS.map(function (c) { return Object.assign({}, c); });
export async function loadChampions() {
  if (isConfigured) {
    var snap = await getDocs(collection(db, 'champions'));
    return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  }
  return _champions.slice();
}
export async function saveChampion(rec) {
  rec = Object.assign({ created_at: (isConfigured ? serverTimestamp() : new Date().toISOString()) }, rec);
  if (isConfigured) { var ref = await addDoc(collection(db, 'champions'), rec); return ref.id; }
  rec.id = 'champ-' + (_champions.length + 1); _champions.push(rec); return rec.id;
}
export async function deleteChampion(id) {
  if (isConfigured) { await deleteDoc(doc(db, 'champions', id)); return; }
  var i = _champions.findIndex(function (c) { return c.id === id; }); if (i >= 0) _champions.splice(i, 1);
}

// ── ADMINS / scope ───────────────────────────────────────────────────
// Returns { id, role, events[], name, email, active } or null (no access).
export async function getCurrentAdmin(uid) {
  if (!isConfigured) return _sampleScope || null;
  if (!uid) return null;
  var a = await fsOne('admins', uid);
  if (!a || a.active === false) return null;
  a.events = Array.isArray(a.events) ? a.events : [];
  return a;
}
export function adminOwns(admin, formId) {
  if (!admin) return false;
  if (admin.role === 'super') return true;
  return (admin.events || []).indexOf(formId) >= 0;
}
// Super → all forms; director → only owned (events[] = form_ids).
export async function loadFormsScoped(admin, opts) {
  var all = await loadForms(Object.assign({ includeInactive: true }, opts || {}));
  if (!admin || admin.role === 'super') return all;
  var own = admin.events || [];
  return all.filter(function (f) { return own.indexOf(f.id) >= 0; });
}
// Super → full read; director → per-event query (each form_id-scoped so rules pass).
export async function loadRegistrationsScoped(admin, opts) {
  opts = opts || {};
  if (!admin || admin.role === 'super') return loadRegistrations(opts);
  var own = admin.events || [];
  if (!own.length) return [];
  var rows;
  if (isConfigured) {
    var batches = await Promise.all(own.map(function (fid) {
      return getDocs(query(collection(db, 'registrations'), where('form_id', '==', fid)))
        .then(function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); });
    }));
    rows = batches.reduce(function (a, b) { return a.concat(b); }, []);
  } else {
    rows = _regs.filter(function (r) { return own.indexOf(r.form_id) >= 0; });
  }
  if (opts.status) rows = rows.filter(function (r) { return (r.status || 'completed') === opts.status; });
  return rows.sort(function (a, b) { return (b.entry_no || 0) - (a.entry_no || 0); });
}
// Directors panel (super-only; rules enforce server-side).
export async function loadAdmins() {
  if (isConfigured) return fsAll('admins');
  return _admins.slice();
}
export async function saveAdmin(admin) {
  var rec = {
    email: String(admin.email || '').toLowerCase().trim(),
    name: admin.name || '', role: (admin.role === 'super' ? 'super' : 'director'),
    events: Array.isArray(admin.events) ? admin.events.slice(0, 10) : [],   // ≤10 (kept small for the rules' membership check)
    active: admin.active !== false
  };
  if (isConfigured) {
    if (!admin.id) throw new Error('admin uid required (the director\'s Firebase Auth UID)');
    await setDoc(doc(db, 'admins', admin.id), rec, { merge: true });
    return admin.id;
  }
  var i = _admins.findIndex(function (x) { return x.id === admin.id; });
  if (i >= 0) _admins[i] = Object.assign(_admins[i], rec);
  else _admins.push(Object.assign({ id: admin.id || ('uid-' + slugify(rec.email)) }, rec));
  return admin.id;
}
export async function deleteAdmin(uid) {   // soft-disable (kill-switch), never hard-delete
  if (isConfigured) { await updateDoc(doc(db, 'admins', uid), { active: false }); return; }
  var a = _admins.find(function (x) { return x.id === uid; }); if (a) a.active = false;
}

// ── GAMES (schedule + scores) ────────────────────────────────────────
function sortGames(rows) {
  return rows.sort(function (a, b) {
    var d = String(a.date || '').localeCompare(String(b.date || '')); if (d) return d;
    return String(a.time || '').localeCompare(String(b.time || ''));
  });
}
function numScore(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
export async function loadGames(opts) {
  opts = opts || {};
  var all = isConfigured ? await fsAll('games') : _games.slice();
  if (opts.formId) all = all.filter(function (g) { return g.form_id === opts.formId; });
  if (opts.sport) all = all.filter(function (g) { return g.sport === opts.sport; });
  return sortGames(all);
}
// Super → all; director → only their events' games (per-event query so rules pass).
export async function loadGamesScoped(admin, opts) {
  opts = opts || {};
  if (!admin || admin.role === 'super') return loadGames(opts);
  var own = admin.events || [];
  if (!own.length) return [];
  var rows;
  if (isConfigured) {
    var batches = await Promise.all(own.map(function (fid) {
      return getDocs(query(collection(db, 'games'), where('form_id', '==', fid)))
        .then(function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); });
    }));
    rows = batches.reduce(function (a, b) { return a.concat(b); }, []);
  } else {
    rows = _games.filter(function (g) { return own.indexOf(g.form_id) >= 0; });
  }
  return sortGames(rows);
}
export async function saveGame(game) {
  if (!game.form_id) throw new Error('a game needs a form_id (its event)');
  var rec = {
    form_id: game.form_id, sport: game.sport || '', division: game.division || '',
    away: game.away || '', home: game.home || '',
    date: game.date || '', time: game.time || '', field: game.field || '',
    away_score: numScore(game.away_score),
    home_score: numScore(game.home_score),
    done: !!game.done
  };
  if (game.g != null) rec.g = game.g;   // bracket game number (kept on score edits)
  if (isConfigured) {
    if (game.id) { await setDoc(doc(db, 'games', game.id), rec, { merge: true }); return game.id; }
    var ref = await addDoc(collection(db, 'games'), rec); return ref.id;
  }
  if (game.id) { var i = _games.findIndex(function (g) { return g.id === game.id; }); if (i >= 0) _games[i] = Object.assign(_games[i], rec); return game.id; }
  rec.id = 'g' + (++_gameSeq); _games.push(rec); return rec.id;
}
// Save a batch of round-robin pool games (regular games, no bracket `g`).
// Remove this event's existing POOL games (g==null) so a regenerate REPLACES
// rather than stacking duplicates. (Bracket games are left alone — see clearBracket.)
export async function clearPool(formId, division) {
  var matchDiv = function (d) { return division === undefined || division === null || (d || '') === division; };
  if (isConfigured) {
    var snap = await getDocs(query(collection(db, 'games'), where('form_id', '==', formId)));
    await Promise.all(snap.docs.filter(function (d) { var x = d.data(); return x.g == null && matchDiv(x.division); }).map(function (d) { return deleteDoc(d.ref); }));
    return;
  }
  _games = _games.filter(function (g) { return !(g.form_id === formId && g.g == null && matchDiv(g.division)); });
}
export async function savePool(formId, meta, matchups) {
  meta = meta || {};
  await clearPool(formId, meta.division || '');   // replace just this division's pool

  for (var i = 0; i < matchups.length; i++) {
    var m = matchups[i];
    await saveGame({ form_id: formId, sport: meta.sport || '', division: meta.division || '',
      away: m.away, home: m.home, date: m.date || '', time: m.time || '', field: m.field || '',
      away_score: null, home_score: null, done: false });
  }
  return matchups.length;
}
export async function deleteGame(id) {
  if (isConfigured) { await deleteDoc(doc(db, 'games', id)); return; }
  var i = _games.findIndex(function (g) { return g.id === id; }); if (i >= 0) _games.splice(i, 1);
}

// Delete bracket games (those carrying a `g` number) for an event. If `division`
// is passed, only that tier/division's bracket is cleared (so tiered events —
// Diamond/Platinum/Gold, or 8U/10U — can coexist); omit it to clear ALL brackets.
export async function clearBracket(formId, division) {
  var matchDiv = function (d) { return division === undefined || division === null || (d || '') === division; };
  if (isConfigured) {
    var snap = await getDocs(query(collection(db, 'games'), where('form_id', '==', formId)));
    await Promise.all(snap.docs.filter(function (d) { var x = d.data(); return x.g != null && matchDiv(x.division); }).map(function (d) { return deleteDoc(d.ref); }));
    return;
  }
  _games = _games.filter(function (g) { return !(g.form_id === formId && g.g != null && matchDiv(g.division)); });
}
// Persist a generated bracket: `gen` = STSgen output [{g, away, home, date, time, field}].
// meta.division = the tier/division label. opts.replace===false skips clearing
// (used when saving several tiers in one event). Game ids include the division so
// two tiers numbered g:1..7 don't collide.
export async function saveBracket(formId, meta, gen, opts) {
  meta = meta || {}; opts = opts || {};
  var dv = meta.division || '';
  if (opts.replace !== false) await clearBracket(formId, dv);   // replace just this tier
  for (var i = 0; i < gen.length; i++) {
    var s = gen[i];
    var rec = {
      form_id: formId, sport: meta.sport || '', division: dv, g: s.g,
      away: String(s.away == null ? '' : s.away), home: String(s.home == null ? '' : s.home),
      date: s.date || '', time: s.time || '', field: s.field || '',
      away_score: null, home_score: null, done: false
    };
    if (isConfigured) { await addDoc(collection(db, 'games'), rec); }
    else { rec.id = 'b' + formId + '-' + (dv ? slugify(dv) + '-' : '') + s.g; _games.push(rec); }
  }
  return gen.length;
}

// Pure: derive standings rows from a games array (only finished games count).
// Standings + Keith's exact tie-breaker ladder (from his QuickScores config):
//   rank by Winning % → then break ties in order:
//   Head-to-Head (2-team ties only) → Total Runs Against (fewer) →
//   Avg Run Differential (higher) → Total Runs For (more) → Forfeits (fewer) → coin flip.
export function computeStandings(games) {
  var t = {}, h2h = {};
  function row(name) { if (!t[name]) t[name] = { team: name, w: 0, l: 0, ties: 0, rs: 0, ra: 0, gp: 0, ff: 0 }; return t[name]; }
  function hh(a, b) { h2h[a] = h2h[a] || {}; if (!h2h[a][b]) h2h[a][b] = { w: 0, l: 0 }; return h2h[a][b]; }
  (games || []).forEach(function (g) {
    if (!g.done || g.away_score == null || g.home_score == null) return;
    if (!g.away || !g.home) return;
    var as = Number(g.away_score), hs = Number(g.home_score);
    if (!isFinite(as) || !isFinite(hs)) return;   // a hand-edited non-numeric score can't poison standings
    var a = row(g.away), h = row(g.home);
    a.gp++; h.gp++; a.rs += as; a.ra += hs; h.rs += hs; h.ra += as;
    if (as > hs) { a.w++; h.l++; hh(g.away, g.home).w++; hh(g.home, g.away).l++; if (g.forfeit) h.ff++; }
    else if (hs > as) { h.w++; a.l++; hh(g.home, g.away).w++; hh(g.away, g.home).l++; if (g.forfeit) a.ff++; }
    else { a.ties++; h.ties++; }
  });
  var rows = Object.keys(t).map(function (k) {
    var r = t[k];
    r.pct = (r.w + r.l + r.ties) ? (r.w + r.ties * 0.5) / (r.w + r.l + r.ties) : 0;
    r.diff = r.rs - r.ra;
    r.ardiff = r.gp ? (r.diff / r.gp) : 0;
    return r;
  });
  function h2hResult(a, b) { var x = (h2h[a.team] && h2h[a.team][b.team]) || { w: 0, l: 0 }; return x.w > x.l ? 1 : (x.l > x.w ? -1 : 0); }
  function tieSort(grp) {
    grp.sort(function (a, b) {
      if (grp.length === 2) { var hr = h2hResult(a, b); if (hr !== 0) return -hr; }   // 2-team head-to-head
      if (a.ra !== b.ra) return a.ra - b.ra;                 // fewer runs against
      if (b.ardiff !== a.ardiff) return b.ardiff - a.ardiff; // higher avg run differential
      if (b.rs !== a.rs) return b.rs - a.rs;                 // more runs for
      if (a.ff !== b.ff) return a.ff - b.ff;                 // fewer forfeits
      return 0;                                              // coin flip → stable order
    });
  }
  rows.sort(function (a, b) { return b.pct - a.pct; });
  var out = [], i = 0;
  while (i < rows.length) { var j = i; while (j < rows.length && rows[j].pct === rows[i].pct) j++; var grp = rows.slice(i, j); tieSort(grp); out = out.concat(grp); i = j; }
  out.forEach(function (s, idx) { s.rank = idx + 1; });
  return out;
}

// ── Site content / settings (homepage text, default prices) ──────────
export async function loadSiteContent(docId) {
  docId = docId || 'homepage';
  if (isConfigured) { var d = await fsOne('site_content', docId); return d || {}; }
  try { return JSON.parse(localStorage.getItem('sts-content-' + docId) || '{}'); } catch (e) { return {}; }
}
export async function saveSiteContent(docId, obj) {
  docId = docId || 'homepage';
  if (isConfigured) { await setDoc(doc(db, 'site_content', docId), obj, { merge: true }); return; }
  try { localStorage.setItem('sts-content-' + docId, JSON.stringify(obj)); } catch (e) {}
}

// convenience global (non-module consumers)
if (typeof window !== 'undefined') {
  window.STS = { money: money, abbr: abbr, slugify: slugify, isConfigured: isConfigured };
}
