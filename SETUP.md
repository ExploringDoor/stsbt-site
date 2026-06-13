# Small Town Select Tournaments — Setup & Go-Live Checklist

This site runs on **sample data** out of the box, so every page works for preview
before any accounts exist. To make it live, complete the steps below.

Stack: static HTML + Firebase/Firestore (client SDK) + Vercel serverless `api/*`
functions. Same proven pattern as the D27 / DVSL sites — **separate** project.

---

## 0. Local preview (no accounts needed)
```
cd ~/Desktop/stsbt-site
npx serve -l 8011 .      # then open http://localhost:8011
```
Pages render from built-in sample data (`js/sts-data.js`). Admin opens in
**demo mode** (no login) until Firebase is configured.

---

## 1. Firebase (database + admin login) — NEW project, separate from D27/DVSL
1. console.firebase.google.com → **Add project** → e.g. `stsbt-tournaments`.
2. Build → **Firestore Database** → Create (production mode).
3. Build → **Authentication** → enable **Email/Password** → add a user for Keith
   (this is the admin login).
4. Project settings → **Your apps → Web app** → copy the `firebaseConfig`.
5. Paste it into **`js/firebase-init.js`** (replace the `PASTE_…` values). Once the
   `apiKey` no longer starts with `PASTE`, the whole site switches from sample data
   to live Firestore automatically.
6. Publish the rules in **`firestore.rules`** (Firestore → Rules → paste → Publish).

### Bootstrap the Super Admin — DO THIS BEFORE PUBLISHING RULES (or it locks everyone out)
The rules make every admin write require an `admins/{uid}` doc with `active:true`; the
first super can't be made through the app. **In order:**
1. Firebase **Authentication** → add Keith's user → copy his **User UID**.
2. Firestore console → create doc **`admins/{thatUID}`** =
   `{ role:'super', active:true, events:[], name:'Keith Philips', email:'…' }`.
3. Sign in to `admin.html`, confirm the **Directors** panel loads.
4. **Only then** publish `firestore.rules`.
Break-glass: the project owner can always edit `admins/*` directly in the console.

### Adding directors (Season Admins) — built into the admin
In `admin.html` → **Directors** (super only): **+ Add Director** → enter name/email, paste
their **Firebase Auth User UID** (create their login in Authentication first), and check the
**events** they run. They sign in and see only those events' entries (and, once built, that
event's schedule/scores). Disable = instant revoke (`active:false`), never deleted. Each
director's `events[]` is a list of **form ids** (the tournament form *is* the event); cap 10.
Preview a director's scoped view locally with `admin.html?as=uid-carl`.

---

## 2. Vercel (hosting + serverless functions)
1. Push this folder to a new GitHub repo, import into Vercel (no build step —
   `vercel.json` is already set).
2. Add Environment Variables (Project → Settings → Environment Variables):

| Variable | What | Needed for |
|---|---|---|
| `FIREBASE_PROJECT_ID` | STS Firebase project id | server writes |
| `FIREBASE_API_KEY` | Firebase Web API key | server writes |
| `RESEND_API_KEY` | resend.com API key (free) | email to Keith |
| `ADMIN_EMAIL` | `keithphilips34@gmail.com` | email to Keith |
| `SITE_URL` | e.g. `https://ststournaments.com` | redirects / links |
| `CLOVER_ENV` | `sandbox` then `production` | payments |
| `CLOVER_MERCHANT_ID` | Keith's Clover Merchant ID | payments |
| `CLOVER_PRIVATE_TOKEN` | Clover Ecommerce private token | payments |
| `CLOVER_WEBHOOK_SECRET` | Clover Hosted-Checkout signing secret | payments |

---

## 3. Email (Resend) — alerts to Keith on each registration
1. resend.com → free account → **API Keys** → create → set `RESEND_API_KEY`.
2. Set `ADMIN_EMAIL` to Keith's address. Until a domain is verified, mail sends
   from `onboarding@resend.dev` (fine for internal alerts).

---

## 4. Payments — Clover (CONFIRMED)
Processor is **Clover** (clover.com **Hosted Checkout API**) — already implemented in
`api/create-checkout.js` + `api/clover-webhook.js`. Steps:
1. Enable 2FA on Keith's Clover account.
2. Settings → Ecommerce → **Ecommerce API Tokens** → create the **private** token
   (one per merchant — confirm it isn't already used) → `CLOVER_PRIVATE_TOKEN`.
3. Grab the **Merchant ID** → `CLOVER_MERCHANT_ID`.
4. Settings → Ecommerce → **Hosted Checkout** → set webhook URL to
   `https://<domain>/api/clover-webhook` → **Generate** signing secret →
   `CLOVER_WEBHOOK_SECRET`. **Leave the dashboard redirect URLs blank** (they
   override the per-request ones).
5. Make a **sandbox test merchant** for QA; test end-to-end in `sandbox`, then flip
   `CLOVER_ENV` to `production` and swap to the production token/merchant.

Refunds are done by Keith **inside Clover** — the admin Entries table surfaces the
**card last-4 + Clover order id** for matching (read-only helper, no programmatic
refunds).

**Fallback:** if Clover onboarding stalls the July launch, Stripe Checkout is a
drop-in (same flow, last-4 arrives in the webhook). Only `create-checkout.js` +
`clover-webhook.js` change.

---

## 5. Server writes & security — a HARD payment-launch gate
**ALL THREE** serverless functions that write via the Firestore REST API + API key are
**unauthenticated** and will be **denied** by the hardened rules (which limit
`request.auth==null` to registration *create* only):
- `api/create-checkout.js` — patches the registration → `pending`
- `api/clover-webhook.js` — marks **paid** + auto-creates the **team page**
- `api/roster-save.js` — saves the **team roster**

**Required before payments go live:** migrate all three (+ `api/_firestore.js`) to the
**Firebase Admin SDK** with a service account (`FIREBASE_SERVICE_ACCOUNT` env), which writes
as a trusted identity and bypasses rules. A *partial* migration silently bricks checkout —
grep `api/` for `fsPatch`/`fsCreate` and confirm none remain on the REST path. Also **backfill
a `form_id`** on any existing `games`/`tournaments` docs (a scoped doc with no `form_id` fails
closed). The Clover webhook already fails closed in production if the signing secret is unset.

Until this is done, the **client flows** (browse, register, view teams, the whole Season-Admin
UI) all work; only the paid-confirmation / auto-team-create / roster-save server steps are gated.
Validate the whole gate in a **staging** Firebase project with the abuse matrix: forged `paid`
create → denied · unauthenticated reg update → denied (then works via Admin SDK) · director
`getDocs(registrations)` → denied · director writing `admins/*` → denied.

---

## 6. Branding to drop in later
- **Logo:** add Keith's real STS crest at `assets/sts-crest.png`, then set
  `USE_CREST_IMG = true` at the top of `js/sts-chrome.js`. (A clean "STS" monogram
  shows until then.)
- **Hero image:** the homepage hero is a navy gradient; drop a photo in and set it
  as the `.hero` background if desired.
- **Team logos:** `logos/<team-slug>.png` (falls back to an initials circle).

---

## What's built (Phase 1)
Homepage · forms-driven **Register** (per-tournament/season/product) · **Thanks**
(team code) · **Admin** (Entries table w/ payment + CC-txn refund helper, Forms
manager, Teams, Homepage editor, Prices) · auto **Team pages** · **Teams** directory
· code-gated **Roster** self-edit · serverless: Clover checkout + webhook, Resend
email, roster-save.

## Still to do (Phase 2/3)
Wire Clover live (creds + sandbox test) · server-write security (above) · schedule
builder (honoring team time-availability) · standings · brackets (port the D27
generator) · director permission-matrix UI.
