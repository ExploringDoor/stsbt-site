# Small Town Select Tournaments — Setup & Go-Live Checklist

This site runs on **sample data** out of the box, so every page works for preview
before any accounts exist. To make it live, complete the steps below.

Stack: static HTML + Firebase/Firestore (client SDK + REST) + Vercel serverless `api/*`.
Payments via **CardConnect / CardPointe** (Fiserv). Email via **SendGrid**. Same proven
hosting pattern as the D27 / DVSL sites — **separate** project.

---

## 0. Local preview (no accounts needed)
```
cd ~/Desktop/stsbt-site
npx serve -l 8011 .      # then open http://localhost:8011
```
Pages render from built-in sample data (`js/sts-data.js`). Admin opens in
**demo mode** (no login) until Firebase is live AND demo mode is turned off.

---

## 1. Firebase (database + admin login)
The Firebase Web config is **already pasted** into `js/firebase-init.js` (project
`small-town-select`). The site flips from sample data to live Firestore automatically
once **demo mode is off** (see §6) — the api key is already real.

You need **two** super-admin identities, and missing the second is the classic
launch-day failure:

1. **Keith's login** — Authentication → add his Email/Password user → copy the **UID**
   → Firestore: create `admins/{UID}` = `{ role:'super', active:true, events:[],
   name:'Keith Philips', email:'…' }`. This is what lets him into `admin.html`.
2. **The server robot** — the serverless charge/roster functions sign in as a dedicated
   Firebase Auth user (`FB_ADMIN_EMAIL` / `FB_ADMIN_PASSWORD`) to write paid/team/roster
   docs. That user **also needs its own** `admins/{UID}` = `{ role:'super', active:true }`.
   ⚠️ If it isn't super, a card **charges at the gateway but the registration never marks
   paid and no team page is created** (writes are denied). Verify with `/api/admin-health`
   (§5).

Bootstrap order (or the rules lock everyone out): create the user(s) → create their
`admins/{uid}` docs → confirm the **Directors** panel loads in `admin.html` → **only then**
publish `firestore.rules`. Break-glass: the project owner can always edit `admins/*` in the
console.

### Adding directors (Season Admins) — built into the admin
`admin.html` → **Directors** (super only): **+ Add Director** → name/email + their Firebase
Auth **UID** + the **events** they run. They sign in and see only those events. Disable =
instant revoke (`active:false`), never deleted. Each director's `events[]` is a list of
**form ids**; cap 10. Preview a director's scoped view with `admin.html?as=uid-carl`.

---

## 2. Vercel (hosting + serverless functions)
1. Push to a GitHub repo, import into Vercel (no build step — `vercel.json` is set).
2. Add Environment Variables (Project → Settings → Environment Variables):

| Variable | What | Needed for |
|---|---|---|
| `FIREBASE_PROJECT_ID` | `small-town-select` | server writes |
| `FIREBASE_API_KEY` | Firebase Web API key | server writes |
| `FB_ADMIN_EMAIL` | the server robot's Firebase Auth email | server writes (paid / team / roster) |
| `FB_ADMIN_PASSWORD` | that robot user's password | server writes |
| `SENDGRID_API_KEY` | SendGrid API key | email |
| `MAIL_FROM` | verified sender, e.g. `noreply@ststournaments.com` | email from-address |
| `ADMIN_EMAIL` | `keithphilips34@gmail.com` | who gets alerts |
| `SITE_URL` | the real domain, e.g. `https://ststournaments.com` | email links / redirects |
| `CARDCONNECT_SITE` | sandbox `quickscores-uat` → **prod `<site>`** | payments (server) |
| `CARDCONNECT_MERCHID` | sandbox `810000003251` → **prod MID** | payments |
| `CARDCONNECT_API_USER` | REST API username | payments |
| `CARDCONNECT_API_PASS` | REST API password | payments |
| `CARDCONNECT_CURRENCY` | `USD` | payments |
| `SITE_GATE` | a password to keep the site private pre-launch — **DELETE at launch** | preview wall |
| `FIREBASE_STORAGE_BUCKET` | bucket id | champion-photo uploads |
| `ROSTER_PID_SALT` | any random string | player-id hashing |
| `SEASON_YEAR` | `2027` | season tagging |

---

## 3. Email — SendGrid (alerts to Keith + coach confirmations/receipts)
1. SendGrid → create an **API key** → set `SENDGRID_API_KEY`.
2. **Verify the sender**: single-sender verify `noreply@ststournaments.com`, or (better)
   domain-authenticate `ststournaments.com` with the SPF/DKIM DNS records SendGrid gives you.
   Set `MAIL_FROM` to that verified address.
3. Set `ADMIN_EMAIL` = Keith's inbox and `SITE_URL` = the real domain (every email link uses it).
4. Test: `GET /api/email-test?to=you@example.com` → confirm it arrives (check spam).
If email isn't configured the code **no-ops safely** (nothing else breaks), so you can launch
the rest first — but coaches won't get confirmations until this is set.

---

## 4. Payments — CardConnect / CardPointe (Fiserv)
**Already built and sandbox-tested.** The card is entered in CardConnect's **hosted iframe
tokenizer** (the PAN never touches us); the token is posted to `api/cardconnect-charge.js`,
which authorizes + captures via the Gateway API, marks the registration paid, auto-creates
the team page, and emails Keith + the coach.

- The iframe host is `config.js` → `cardconnect.site` (currently sandbox `quickscores-uat`).
- The server creds are the `CARDCONNECT_*` Vercel env vars (currently sandbox).

**To go live, complete Fiserv's "validation":** their integration email includes a
**validation form** (JotForm) and a rep contact — they ask you to reach out first. Once
validated, they issue your **production** `site` + `MID` + REST `user`/`pass`. Then swap, in
**two places that must match**:
1. `config.js` → `cardconnect.site` = the production `<site>` (the iframe host), and
2. Vercel env → `CARDCONNECT_SITE` / `CARDCONNECT_MERCHID` / `CARDCONNECT_API_USER` /
   `CARDCONNECT_API_PASS` = the production values.
If only one side changes, the token and the charge target different gateways and every
payment fails.

Best practices already met (verified against the sandbox gateway): `ecomind:E`, cardholder
name, AVS street + zip, and CVV (the iframe binds CVV to the token — `cvvresp:M`).

Refunds: Keith does them in the **CardPointe** portal. The admin Entries table surfaces the
**`cc_retref` (CardConnect retrieval ref) + card last-4** for matching (read-only helper, no
programmatic refunds).

---

## 5. Server writes & security
The serverless writers (`api/cardconnect-charge.js`, `api/roster-save.js`, etc.) sign in as
the **FB_ADMIN robot user** and write as a trusted identity, so the hardened rules can keep
anonymous access to **registration *create* only**.

Verify on the **deployed** site (after the gate is removed, §6):
```
GET /api/admin-health   →   { payments_configured:true, admin_sign_in:"ok", is_super:true }
```
All three must be true before taking real money. `firestore.rules`: anon can only *create* a
shape-pinned registration; forms/teams/games writes require super/director. Publish the rules
and confirm the live project matches the repo. Validate the abuse matrix in a staging project:
forged `paid` create → denied · unauthenticated reg update → denied · director reading another
event's entries → denied · director writing `admins/*` → denied.

---

## 6. GO-LIVE switches (launch day — do these last)
1. **Turn off demo mode** — `config.js`: `demoDefault:false` **and** `previewMode:false`.
   This is the master switch; while it's on, the public site runs on **fake sample data and
   fake payment success** (charges nothing, writes nothing). Commit + redeploy.
2. **Remove the password wall** — delete the `SITE_GATE` env var in Vercel **and** delete
   `middleware.js`. It gates the **entire** site including `/api/*`, so real teams (and your
   own API checks) can't get through while it's up.
3. **Seed the live forms** — the **2027 Fall/Spring** season Team Registration forms must
   exist in Firestore. Build them in `admin.html` → **Forms** (they currently exist only as
   demo samples). Set the real fee + `active:true`.
4. **Delete test data** — remove any sandbox leftovers (e.g. a "ZZ Payment Test" entry) so
   they don't show in the directory / Who's Coming.
5. **One real end-to-end test charge** on the production deploy before you announce.

---

## 7. Branding to drop in later
- **Logo:** add Keith's STS crest at `assets/sts-crest.png`, set `USE_CREST_IMG = true` at
  the top of `js/sts-chrome.js`. (A clean "STS" monogram shows until then.)
- **Hero image:** the homepage hero is a navy gradient; drop a photo in if desired.
- **Team logos:** `logos/<team-slug>.png` (falls back to an initials circle).

---

## What's built
Homepage · forms-driven **Register** (per-tournament/season/product) · **Thanks** (team code)
· **Admin** (Entries table w/ payment + `cc_retref` refund helper, Forms manager, Teams,
Homepage editor, Prices, Directors) · auto **Team pages** · **Teams** directory · code-gated
**Roster** self-edit · schedule / scores / standings / brackets · auto **Champions** page ·
serverless: CardConnect charge, SendGrid email, roster-save.

## Still to do
Complete Fiserv production validation (creds + swap) · provision SendGrid (key + verified
sender) · flip the §6 go-live switches · seed the live 2027 season forms · director
permission-matrix UI (Phase 2).
