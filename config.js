// ═════════════════════════════════════════════════════════════════════════
// SMALL TOWN SELECT TOURNAMENTS — site config
// ─────────────────────────────────────────────────────────────────────────
// Loaded first on every page via <script src="/config.js">. Every value that
// differs between deployments / seasons lives here. Mirrors the proven D27/DVSL
// config pattern (window.LEAGUE_CONFIG).
// ═════════════════════════════════════════════════════════════════════════

(function () {
  var CONFIG = {
    // Preview phase: shows a "Preview with sample data" invite (demo mode) sitewide.
    // SET TO false AT LAUNCH so real visitors never see the demo invite.
    previewMode: true,
    // CardConnect (CardPointe) — the iFrame Tokenizer host. NOT a secret (it's in the
    // iframe URL the customer loads). The API username/password/MID live in Vercel env.
    // Flip `site` to the production <site> at go-live.
    cardconnect: { site: 'quickscores-uat' },
    // ── Identity ─────────────────────────────────────────────────────────
    id: 'sts',
    name: 'Small Town Select',
    fullName: 'Small Town Select Tournaments',
    abbr: 'STS',
    tagline: 'Select baseball & softball tournaments across Texas',
    region: 'Texas',
    facebook: 'https://www.facebook.com/smalltownselectbaseballtournaments',

    // ── Season (Fall/Spring runs Aug 1 → Jul 31) ─────────────────────────
    season: {
      year: 2027,
      label: '2027 Fall/Spring',
      starts: '2026-08-01',
      ends: '2027-07-31',
      // "Age as of" date shown on registration forms (May 1 of the season year)
      ageAsOf: '2027-05-01'
    },

    // ── Divisions / classifications (teams pick at registration) ─────────
    divisions: {
      baseball: [
        { key: 'minors',   name: 'Minors',    note: 'AA / D3 — lower-caliber select' },
        { key: 'triple-a', name: 'Triple-A',  note: 'AAA / D2 — higher-caliber select' },
        { key: 'majors',   name: 'Majors',    note: 'Majors / D1 — highest-caliber select' }
      ],
      // Softball follows NCS rules → Class C / B / A
      softball: [
        { key: 'class-c', name: 'Class C', note: 'NCS rules' },
        { key: 'class-b', name: 'Class B', note: 'NCS rules' },
        { key: 'class-a', name: 'Class A', note: 'NCS rules' }
      ]
    },

    // ── Age groups (drive the per-age price options on a form) ───────────
    ageGroups: ['7U', '8U Coach Pitch', '8U Kid Pitch', '9U', '10U', '11U', '12U', '13U', '14U'],

    // ── Pricing defaults (cents). Keith overrides per-form in admin. ─────
    pricing: {
      convenienceFeeCents: 300,   // $3.00 — shown as a flat per-entry fee
      defaultEntryCents:  12500,  // $125.00 — default per-team tournament entry
      insuranceCents:     0       // set per season in admin
    },

    // ── Payment ──────────────────────────────────────────────────────────
    // CONFIRMED: Clover (clover.com Hosted Checkout API). See api/create-checkout.js
    // + api/clover-webhook.js. Secrets live in Vercel env, never here.
    payment: {
      processor: 'clover',
      env: 'sandbox'         // 'sandbox' | 'production'
    },

    // ── Contact / leadership ─────────────────────────────────────────────
    contact: {
      generalEmail: 'smalltownselect@gmail.com',
      director: { name: 'Keith Philips', role: 'Owner / Director', email: 'keithphilips34@gmail.com', phone: '254-592-8727' }
    },

    // ── Tournament directors — DISPLAY ONLY (homepage/Directors page) ────
    // ⚠️ NEVER an auth source. Real admin authority lives in the `admins/{uid}`
    //    Firestore collection (role + events[]), enforced by firestore.rules.
    directors: [
      { name: 'Keith Philips',  role: 'Owner / Director', area: '',       phone: '254-592-8727', email: 'keithphilips34@gmail.com' },
      { name: 'Carl Moore',     role: 'Director',         area: 'Cisco',  phone: '254-433-1083', email: 'Carlmoe9@gmail.com' },
      { name: 'Sonny Wilson',   role: 'Director',         area: 'Burnet', phone: '',             email: '' },
      { name: 'Adam Anderle',   role: 'Director',         area: 'Graham', phone: '',             email: 'adam@kramerconstructiontx.com' }
    ],

    // ── Liability disclaimer (shown sitewide in the footer) ──────────────
    disclaimer: 'Please understand that anyone who chooses to attend any Small Town Select Baseball Tournaments is assuming liability for themselves. Small Town Select Baseball Tournaments and its host locations are not responsible or liable for anyone who may become sick or ill from attending an event. Everyone is fully aware of the risks that come with attending an event or gathering with large numbers of people. By attending a Small Town Select Baseball Tournament you assume full self-responsibility for these risks and in no way can hold Small Town Select Baseball Tournaments or its host locations liable for any illnesses or viruses spread.',

    // ── Default registration waiver (pre-fills new forms; editable per form) ──
    defaultWaiver: 'By registering, I acknowledge that participation in Small Town Select Tournaments is at my own and my team\'s risk. Small Town Select Tournaments and its host locations are not responsible or liable for any injury, illness, loss, or damage arising from participation in or attendance at any event. All teams must complete the season Team Registration and must carry team insurance purchased through Small Town Select, or add Small Town Select as additionally insured on their own team policy. I have read, understand, and agree to these terms on behalf of my team.',

    // ── Products / add-ons (sold via registration forms) ─────────────────
    products: [
      { name: '2027 Team Insurance', note: 'Baseball & softball — valid Aug 1, 2026 to Jul 31, 2027 · 12U & under $120 · 13U-15U $160 · 16U-18U $195', form: 'team-insurance' },
      { name: 'STS GamePro Baseballs', note: 'Available in 1, 2, or 3-dozen packs', form: 'gamepro-baseballs' }
    ],

    // ── Venues, grouped by host city. Each place links to a live map +
    // directions (Google Maps query by name + city, TX). State is `region`. ──
    region: 'TX',
    venues: [
      { city: 'Abilene', places: ['Abilene Legacy Fields'] },
      { city: 'Aledo', places: ['Aledo Fields'] },
      { city: 'Azle', places: ['Shady Grove Park'] },
      { city: 'Bangs', places: ['Bangs Fields'] },
      { city: 'Bertram', places: ['Bertram Fields'] },
      { city: 'Bosqueville', places: ['Bosqueville Field'] },
      { city: 'Brownwood', places: ['Brownwood Blue Fields', 'Brownwood Green Fields', 'Brownwood Yellow Fields'] },
      { city: 'Burnet', places: ['Burnet Fields'] },
      { city: 'China Spring', places: ['China Spring Fields'] },
      { city: 'Cleburne', places: ['Cleburne Fields'] },
      { city: 'Clifton', places: ['Clifton Fields'] },
      { city: 'Clyde', places: ['Clyde Fields'] },
      { city: 'Early', places: ['Early Baseball Fields', 'Early Softball Field', 'Early 14U Field'] },
      { city: 'Ennis', places: ['Ennis Fields'] },
      { city: 'Gatesville', places: ['Arnold Field', 'Box Field', 'HEB Field', 'Hyles Field', 'Jaycee Field', 'Sullivan Field'] },
      { city: 'Georgetown', places: ['Georgetown Fields'] },
      { city: 'Glen Rose', places: ['Glen Rose Fields', 'Glen Rose HS Softball Field'] },
      { city: 'Granbury', places: ['Granbury City Park', 'Granbury Moore Street Fields'] },
      { city: 'Hillsboro', places: ['Hillsboro Fields'] },
      { city: 'Iowa Park', places: ['Iowa Park Fields'] },
      { city: 'Johnson', places: ['Johnson Park Ball Field'] },
      { city: 'Joshua', places: ['Joshua Fields'] },
      { city: 'Lorena', places: ['Lorena Fields'] },
      { city: 'Palmer', places: ['Palmer Fields'] },
      { city: 'Riverbend Park', places: ['Riverbend Park North', 'Riverbend Park South'] },
      { city: 'San Angelo', places: ['San Angelo Fields'] },
      { city: 'Stephenville', places: ['Stephenville HS Baseball Field', 'Stephenville HS Softball Field', 'Tarleton State University Baseball Field', 'Lions Club Fields', 'McClesky Fields', 'NYC Fields', 'Optimist Fields', 'OYC Fields', 'Purple Goat Fields', 'Saint Gobain Fields'] },
      { city: 'Troy', places: ['Troy Baseball Fields'] },
      { city: 'Waxahachie', places: ['Curry Field', 'Patrick Field', 'Robnett Field', 'Stevenson Field', 'Volentine Field'] },
      { city: 'Weatherford', places: ['Brunsun Field', 'Carmichael Field', 'Charles Field', 'Williams Field'] },
      { city: 'Whitney', places: ['Whitney Baseball Field', 'Whitney Softball Field'] }
    ],

    // ── Sponsors (from current hub) ──────────────────────────────────────
    sponsors: [
      { name: 'Brenem Productions', url: 'https://www.facebook.com/brenemproductions' },
      { name: 'Workhorse Hat Co.',  url: 'https://workhorsehatco.com' },
      { name: 'Stephenville Roofing', url: 'https://stephenvilleroofing.com' },
      { name: 'STS GamePro Baseballs', url: '' }
    ],

    // ── Theme (Texas navy + red + white, gold for championship accents) ──
    theme: {
      navy: '#002D72',
      red:  '#BF0A30',
      white: '#FFFFFF',
      gold: '#C9A227',
      ink:  '#0F172A',
      paper: '#F7F8FA',
      line: '#E5E7EB'
    },

    // ── Firebase (placeholder — see js/firebase-init.js) ─────────────────
    firebase: null,

    credit: { by: 'Mainline Web Design', byName: 'Adam Miller' }
  };

  if (typeof window !== 'undefined') window.LEAGUE_CONFIG = CONFIG;
  if (typeof self   !== 'undefined') self.LEAGUE_CONFIG   = CONFIG;
})();
