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
    // While the whole site is password-gated (pre-launch), PUBLIC pages default to
    // the populated demo so a single link always shows the full site — no ?demo=1
    // needed. Admin still defaults to REAL data so edits save. ?demo=0 opts out
    // (sticky). SET TO false AT LAUNCH so real visitors see the real (empty→live) data.
    demoDefault: true,
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
    ageGroups: ['6U Modified CP', '7U Coach Pitch', '8U Coach Pitch', '8U Kid Pitch', '9U', '10U', '11U', '12U', '13U', '14U', '15U', '16U', '17U', '18U'],

    // ── Pricing defaults (cents). Keith overrides per-form in admin. ─────
    pricing: {
      convenienceFeeCents: 300,   // $3.00 — shown as a flat per-entry fee
      defaultEntryCents:  12500,  // $125.00 — default per-team tournament entry
      insuranceCents:     0       // set per season in admin
    },

    // ── Payment ──────────────────────────────────────────────────────────
    // CardConnect / CardPointe (Fiserv) — hosted iFrame tokenizer + api/cardconnect-charge.js.
    // The iframe host is `cardconnect.site` above; server creds (CARDCONNECT_*) live in Vercel
    // env, never here. Flip site + env from sandbox to production together after Fiserv validation.
    payment: {
      processor: 'cardconnect',
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
      { city: 'Abilene', places: ['Abilene Legacy Field 1'] },
      { city: 'Aledo', places: ['Aledo Field 1', 'Aledo Field 3', 'Aledo Field 4', 'Aledo Field 5', 'Aledo Field 6', 'Aledo Field 7'] },
      { city: 'Azle', places: ['Azle Shady Grove Park'] },
      { city: 'Bangs', places: ['Bangs F1', 'Bangs F2', 'Bangs F3'] },
      { city: 'Bertram', places: ['Bertram Field 1', 'Bertram Field 2', 'Bertram Field 3', 'Bertram-Field 2', 'Bertram-Softball Field'] },
      { city: 'Bosqueville', places: ['Bosqueville Field 1'] },
      { city: 'Brownwood', places: ['Brownwood Blue 1 Field', 'Brownwood Blue 2 Field', 'Brownwood Blue 3 Field', 'Brownwood Blue 4 Field', 'Brownwood Green 1 Field', 'Brownwood Green 2 Field', 'Brownwood Green 3 Field', 'Brownwood Green 4 Field', 'Brownwood Yellow 1 Field', 'Brownwood Yellow 2 Field', 'Brownwood Yellow 3 Field', 'Brownwood Yellow 4 Field'] },
      { city: 'Burnet', places: ['Burnet Field 1', 'Burnet Field 2', 'Burnet Field 3', 'Burnet Field 4', 'Burnet Field 5', 'Burnet Field 6', 'Burnet Field 7'] },
      { city: 'China Spring', places: ['China Spring Field #1', 'China Spring Field #2', 'China Spring Field #3', 'China Spring Field #4', 'China Spring Field #5', 'China Spring Field #6'] },
      { city: 'Cleburne', places: ['Cleburne Field 1', 'Cleburne Field 2', 'Cleburne Field 3', 'Cleburne Field 4', 'Cleburne Field 5', 'Cleburne Field 6', 'Cleburne Field 7'] },
      { city: 'Clifton', places: ['Clifton Field 1', 'Clifton Field 2', 'Clifton Field 3', 'Clifton Field 4', 'Clifton Field 6', 'Clifton Field 7', 'Clifton Field 8', 'Clifton Field 9'] },
      { city: 'Clyde', places: ['Clyde Field 1', 'Clyde Field 2', 'Clyde Field 3', 'Clyde Field 4', 'Clyde Field 5', 'Clyde Field 6'] },
      { city: 'Early', places: ['Early 14U Field'] },
      { city: 'Ennis', places: ['Ennis Field 1', 'Ennis Field 2', 'Ennis Field 3', 'Ennis Field 4', 'Ennis Field 5', 'Ennis Field 6', 'Ennis Field 7', 'Ennis Field 8'] },
      { city: 'Gatesville', places: ['Gatesville Arnold Field', 'Gatesville Box Field', 'Gatesville HEB Field', 'Gatesville Hyles Field', 'Gatesville Jaycee Field', 'Gatesville Sullivan Field'] },
      { city: 'Georgetown', places: ['Georgetown Field 1', 'Georgetown Field 2', 'Georgetown Field 3', 'Georgetown Field 4', 'Georgetown Field 5', 'Georgetown Field 6', 'Georgetown Field 7'] },
      { city: 'Glen Rose', places: ['Glen Rose Field 1', 'Glen Rose Field 2', 'Glen Rose Field 3', 'Glen Rose Field 4', 'Glen Rose Field 5', 'Glen Rose Field 6', 'Glen Rose HS Softball Field'] },
      { city: 'Granbury', places: ['Granbury City Park Field 1', 'Granbury City Park Field 4', 'Granbury City Park Field 5', 'Granbury City Park Field 6', 'Granbury Moore Street Field 7', 'Granbury Moore Street Field 8', 'Granbury Moore Street Field 9'] },
      { city: 'Hillsboro', places: ['Hillsboro Field 1', 'Hillsboro Field 2', 'Hillsboro Field 3', 'Hillsboro Field 4'] },
      { city: 'Johnson Park', places: ['Johnson Park Ball Field'] },
      { city: 'Joshua', places: ['Joshua Field 1', 'Joshua Field 2'] },
      { city: 'Lorena', places: ['Lorena Field 1', 'Lorena Field 2', 'Lorena Field 3', 'Lorena Field 4'] },
      { city: 'Palmer', places: ['Palmer Field 1', 'Palmer Field 2'] },
      { city: 'PSR', places: ['PSR Parker', 'PSR Parsons', 'PSR Remi', 'PSR Sue Parsons'] },
      { city: 'Riverbend Park', places: ['Riverbend Park North #1', 'Riverbend Park North #2', 'Riverbend Park North #3', 'Riverbend Park North #4', 'Riverbend Park South #1', 'Riverbend Park South #2', 'Riverbend Park South #3', 'Riverbend Park South #4'] },
      { city: 'San Angelo', places: ['San Angelo Q1 F1', 'San Angelo Q1 F2', 'San Angelo Q1 F3', 'San Angelo Q2 F1', 'San Angelo Q2 F2', 'San Angelo Q2 F3', 'San Angelo Q2 F4', 'San Angelo Q3 F1', 'San Angelo Q3 F2', 'San Angelo Q3 F3', 'San Angelo Q3 F4', 'San Angelo Q4 F1', 'San Angelo Q4 F2', 'San Angelo Q4 F3', 'San Angelo Q4 F4'] },
      { city: 'Stephenville', places: ['Stephenville HS BB Field', 'Stephenville HS SB Field', 'Stephenville Lions Club Field', 'Stephenville McClesky Field', 'Stephenville NYC 1', 'Stephenville NYC 2', 'Stephenville OYC 1 Field', 'Stephenville OYC 2 Field', 'Stephenville OYC 3 Field', 'Stephenville OYC 4 Field', 'Stephenville Optimist', 'Stephenville Purple Goat Baseball Field', 'Stephenville Purple Goat Softball Field', 'Stephenville Saint Gobain'] },
      { city: 'Troy', places: ['Troy Baseball F1', 'Troy Baseball F2', 'Troy F1', 'Troy F2'] },
      { city: 'Waxahachie', places: ['Waxahachie Curry Field', 'Waxahachie Patrick Field', 'Waxahachie Robnett Field', 'Waxahachie Stevenson Field', 'Waxahachie Volentine Field'] },
      { city: 'Weatherford', places: ['Weatherford Brunsun Field', 'Weatherford Carmichael Field', 'Weatherford Charles Field', 'Weatherford Williams Field'] },
      { city: 'Whitney', places: ['Whitney Baseball Field', 'Whitney Softball Field'] },
    ],
    fieldGeo: {
      'aledo field 1': '32.726889,-97.631337',
      'aledo field 3': '32.726889,-97.631337',
      'aledo field 4': '32.726889,-97.631337',
      'aledo field 5': '32.726889,-97.631337',
      'aledo field 6': '32.726889,-97.631337',
      'aledo field 7': '32.726889,-97.631337',
      'bangs f1': '31.716793,-99.132755',
      'bangs f2': '31.716793,-99.132755',
      'bangs f3': '31.716793,-99.132755',
      'brownwood blue 1 field': '31.665467,-98.97732',
      'brownwood blue 2 field': '31.665467,-98.97732',
      'brownwood blue 3 field': '31.665467,-98.97732',
      'brownwood blue 4 field': '31.665467,-98.97732',
      'brownwood green 1 field': '31.665467,-98.97732',
      'brownwood green 2 field': '31.665467,-98.97732',
      'brownwood green 3 field': '31.665467,-98.97732',
      'brownwood green 4 field': '31.665467,-98.97732',
      'brownwood yellow 1 field': '31.665467,-98.97732',
      'brownwood yellow 2 field': '31.665467,-98.97732',
      'brownwood yellow 3 field': '31.665467,-98.97732',
      'brownwood yellow 4 field': '31.665467,-98.97732',
      'burnet field 1': '30.744024,-98.231502',
      'burnet field 2': '30.744024,-98.231502',
      'burnet field 3': '30.744024,-98.231502',
      'burnet field 4': '30.744024,-98.231502',
      'burnet field 5': '30.744024,-98.231502',
      'burnet field 6': '30.744024,-98.231502',
      'burnet field 7': '30.744024,-98.231502',
      'cleburne field 1': '32.340358,-97.371669',
      'cleburne field 2': '32.340358,-97.371669',
      'cleburne field 3': '32.340358,-97.371669',
      'cleburne field 4': '32.340358,-97.371669',
      'cleburne field 5': '32.340358,-97.371669',
      'cleburne field 6': '32.340358,-97.371669',
      'cleburne field 7': '32.340358,-97.371669',
      'clifton field 1': '31.788779,-97.590808',
      'clifton field 2': '31.788779,-97.590808',
      'clifton field 3': '31.788779,-97.590808',
      'clifton field 4': '31.788779,-97.590808',
      'clifton field 6': '31.788779,-97.590808',
      'clifton field 7': '31.788779,-97.590808',
      'clifton field 8': '31.788779,-97.590808',
      'clifton field 9': '31.788779,-97.590808',
      'clyde field 1': '32.415463,-99.527474',
      'clyde field 2': '32.415463,-99.527474',
      'clyde field 3': '32.415463,-99.527474',
      'clyde field 4': '32.415463,-99.527474',
      'clyde field 5': '32.415463,-99.527474',
      'clyde field 6': '32.415463,-99.527474',
      'ennis field 1': '32.312444,-96.655208',
      'ennis field 2': '32.312444,-96.655208',
      'ennis field 3': '32.312444,-96.655208',
      'ennis field 4': '32.312444,-96.655208',
      'ennis field 5': '32.312444,-96.655208',
      'ennis field 6': '32.312444,-96.655208',
      'ennis field 7': '32.312444,-96.655208',
      'ennis field 8': '32.312444,-96.655208',
      'gatesville box field': '31.436137,-97.708285',
      'gatesville heb field': '31.436137,-97.708285',
      'gatesville jaycee field': '31.436137,-97.708285',
      'gatesville sullivan field': '31.436137,-97.708285',
      'georgetown field 1': '30.651951,-97.671084',
      'georgetown field 2': '30.651951,-97.671084',
      'georgetown field 3': '30.651951,-97.671084',
      'georgetown field 4': '30.651951,-97.671084',
      'georgetown field 5': '30.651951,-97.671084',
      'georgetown field 6': '30.651951,-97.671084',
      'georgetown field 7': '30.651951,-97.671084',
      'glen rose field 1': '32.228007,-97.766299',
      'glen rose field 2': '32.228007,-97.766299',
      'glen rose field 3': '32.228007,-97.766299',
      'glen rose field 4': '32.228007,-97.766299',
      'glen rose field 5': '32.228007,-97.766299',
      'glen rose field 6': '32.228007,-97.766299',
      'granbury city park field 1': '32.444497,-97.802198',
      'granbury city park field 4': '32.444497,-97.802198',
      'granbury city park field 5': '32.444497,-97.802198',
      'granbury city park field 6': '32.444497,-97.802198',
      'granbury moore street field 7': '32.448558,-97.794037',
      'granbury moore street field 8': '32.448558,-97.794037',
      'granbury moore street field 9': '32.448558,-97.794037',
      'hillsboro field 1': '32.0316561,-97.1190348',
      'hillsboro field 2': '32.0316561,-97.1190348',
      'hillsboro field 3': '32.0316561,-97.1190348',
      'hillsboro field 4': '32.0312741,-97.1191421',
      'joshua field 1': '32.474503,-97.387301',
      'joshua field 2': '32.474503,-97.387301',
      'palmer field 1': '32.4326394,-96.6845866',
      'palmer field 2': '32.4326394,-96.6845866',
      'psr parker': '31.78238,-97.576686',
      'psr parsons': '31.78238,-97.576686',
      'psr remi': '31.78238,-97.576686',
      'riverbend park north #1': '31.596871,-97.165562',
      'riverbend park north #2': '31.596871,-97.165562',
      'riverbend park north #3': '31.596871,-97.165562',
      'riverbend park north #4': '31.596871,-97.165562',
      'riverbend park south #1': '31.596871,-97.165562',
      'riverbend park south #2': '31.596871,-97.165562',
      'riverbend park south #3': '31.596871,-97.165562',
      'riverbend park south #4': '31.596871,-97.165562',
      'san angelo q1 f1': '31.45479,-100.407545',
      'san angelo q1 f2': '31.45479,-100.407545',
      'san angelo q1 f3': '31.45479,-100.407545',
      'san angelo q2 f1': '31.45479,-100.407545',
      'san angelo q2 f2': '31.45479,-100.407545',
      'san angelo q2 f3': '31.45479,-100.407545',
      'san angelo q2 f4': '31.45479,-100.407545',
      'san angelo q3 f1': '31.45479,-100.407545',
      'san angelo q3 f2': '31.45479,-100.407545',
      'san angelo q3 f3': '31.45479,-100.407545',
      'san angelo q3 f4': '31.45479,-100.407545',
      'san angelo q4 f1': '31.45479,-100.407545',
      'san angelo q4 f2': '31.45479,-100.407545',
      'san angelo q4 f3': '31.45479,-100.407545',
      'san angelo q4 f4': '31.45479,-100.407545',
      'stephenville hs sb field': '32.216918,-98.236508',
      'stephenville nyc 1': '32.213248,-98.197202',
      'stephenville nyc 2': '32.213248,-98.197202',
      'stephenville oyc 1 field': '32.213248,-98.197202',
      'stephenville oyc 2 field': '32.213248,-98.197202',
      'stephenville oyc 3 field': '32.213248,-98.197202',
      'stephenville oyc 4 field': '32.213248,-98.197202',
      'stephenville purple goat softball field': '32.231743,-98.183288',
      'stephenville saint gobain': '32.213248,-98.197202',
      'troy baseball f1': '31.210373,-97.307805',
      'troy baseball f2': '31.210373,-97.307805',
      'troy f1': '31.219429,-97.302589',
      'troy f2': '31.219429,-97.302589',
      'waxahachie patrick field': '32.39601,-96.856443',
      'waxahachie robnett field': '32.39601,-96.856443',
      'waxahachie stevenson field': '32.39601,-96.856443',
      'waxahachie volentine field': '32.39601,-96.856443',
      'weatherford carmichael field': '32.746158,-97.810453',
      'weatherford charles field': '32.746158,-97.810453',
      'weatherford williams field': '32.746158,-97.810453',
      'whitney softball field': '31.967673,-97.323591',
    },

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
