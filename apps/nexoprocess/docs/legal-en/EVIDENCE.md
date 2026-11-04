# Privacy Policy EN: evidence map (INTERNAL, not published)

Not one of the three legal texts; the build and `nexo:site:en` ignore this file. Created 04/11/2026 for the founder's review (C5).
Base: `wip/en-foundation`, read against the tree at the commit that adds this file. Paths are under `apps/nexoprocess/`.
Legend: **PROVADO** = the code or schema shows it; **POLÍTICA** = a commitment, no code can prove it; **NÃO COMPROVADO** = the code does not support the sentence as written (decision needed).

## Result

- **1 sentence contradicted by the code:** §2 "backups" stored in the browser (U1).
- **1 sentence true only after a founder action:** §3.1 "Visits from the EU are not measured" (U2).
- **1 sentence imprecise:** §4 "status (active or revoked)" (U3).
- **4 items are commitments, not code facts:** retention 5 years, 30-day reply, legal bases, children (P1–P4). **2 items depend on third-party docs, not re-read today** (V1–V2).
- Everything else is PROVADO.

## §1 Summary

| Sentence | Evidence | State |
|---|---|---|
| "Your process data stays on your device." | Projects live in IndexedDB `workspaces`/`drafts` (`src/storage/db.ts:12,51-52`). The only fetches are the license calls (`src/license/config.ts:102,132`). CSP `connect-src 'self'` (`public/_headers:10`) | PROVADO |
| "...and to count visits to our public pages." (C1) | Beacon injected only into `/en/` pages (`scripts/lib/en-site.mjs:14,28`); CSP for `/en/*` (`public/_headers:13-17`) | PROVADO |

## §2 What stays on your device

| Sentence | Evidence | State |
|---|---|---|
| processes | `db.createObjectStore('workspaces')` (`src/storage/db.ts:51`) | PROVADO |
| drafts | `createObjectStore('drafts')` (`db.ts:52`); form drafts in localStorage with prefix (`src/storage/localDraft.ts:9,17`) | PROVADO |
| **backups** | Nothing stores a backup in the browser. A backup is a JSON **file the user downloads** (`db.ts:257-266`, `exportBackup`); IndexedDB has only the two stores above (`db.ts:51-52`). | **NÃO COMPROVADO (U1)** |
| preferences: theme | `localStorage 'nexo.theme'` (`src/state/theme.ts:4,22`) | PROVADO |
| preferences: language | `localStorage 'nexo-ui.lang'` (`src/i18n/locale.ts:13`) | PROVADO |
| tips already seen | `'nexo.dica.instalar'` (`src/components/InstallHint.tsx:10,27`); tour flags (`src/components/Tour.tsx:25,35`) | PROVADO |
| access token | `'nexo.license'` (`src/license/config.ts:37,49`) | PROVADO |
| license key | `'nexo.license.key'` (`config.ts:59,71`) | PROVADO |
| "The service worker caches only app files, never your process data." | Workbox `globPatterns` = js/css/html/svg/png/ico/woff2, `runtimeCaching: []`, `/api/` and `/en/` denied for the fallback (`vite.config.ts:97,100-103`) | PROVADO |
| Imports read in memory; file not stored; only extracted data, file name, hash kept | File is read to an `ArrayBuffer` and hashed (`src/io/parse.ts:111,123`); parse returns `fileName`, `hash`, sheets (`parse.ts:12-14,137,147`); stored as `source.fileName/fileHash` (`src/pages/Import.tsx:84`, type `src/domain/types.ts:240`). No code writes the file itself | PROVADO |

## §3 What is sent to our server

| Sentence | Evidence | State |
|---|---|---|
| Sign in sends purchase e-mail + license key | `payloadBody = { email, license_key }` → `POST /api/gumroad-license` (`src/license/config.ts:129-132`) | PROVADO |
| Server verifies with Gumroad | `GUMROAD_VERIFY_URL` (`api/_lib/gumroad.ts:11`, call at `:86`) | PROVADO |
| Renewal sends token + license key, online only | `{ token, license_key }` (`config.ts:129`); only `navigator.onLine` (`src/license/LicenseGate.tsx:34`) | PROVADO |
| Renewal "at most once an hour" | Attempted on app open when the token is older than 3600 s (`config.ts:34`, `LicenseGate.tsx:34`) | PROVADO (it is a check on open, not a timer) |

### §3.1 Analytics

| Sentence | Evidence | State |
|---|---|---|
| Public pages under `/en/` use Cloudflare Web Analytics, as a script | `CF_BEACON` and snippet (`scripts/lib/en-site.mjs:14,28`); pages carry `{{CF_WA_SNIPPET}}` (`scripts/build-en-site.mjs`, page template) | PROVADO |
| The app does not load the script / sends nothing to it | App CSP `script-src 'self'`, `connect-src 'self'` (`public/_headers:10`, `vercel.json:39`); `/en/*` is the only route with the beacon host (`_headers:13-17`, `vercel.json:64`); tests `tests/api/vercel-headers.test.ts`, `tests/e2e/landing-en.spec.ts` | PROVADO |
| What Cloudflare reports; no cookies/localStorage; no fingerprinting | Cloudflare's own documentation (read 01/11/2026 per `docs/LANCAMENTO_EN.md` §6.2). Not re-read today (network) | **V1: depends on a third-party doc** |
| **"Visits from the EU are not measured."** (D-L10) | A Cloudflare dashboard setting. No code or file here controls it | **NÃO COMPROVADO (U2): false until the founder turns the option on and checks it** |

## §4 What we keep on the server

| Sentence | Evidence | State |
|---|---|---|
| e-mail, product, sale id | `email`, `product_id`, `transaction_id` (`api/_lib/schema-purchases.sql:15-18`) | PROVADO |
| amount and currency paid (PRIVACY §4) | `amount numeric(14,2)`, `currency text` (`schema-purchases.sql:25,27`); filled from the sale (`api/_lib/store.ts:14-16,74-76`) | PROVADO |
| event and date | `last_event`, `last_event_occurred_at`, `updated_at` (`schema-purchases.sql:28-30`) | PROVADO |
| **"status (active or revoked)"** | `status` has nine values (`active`, `partially_refunded`, `refund_pending_approval`, `refunded`, `chargeback_warning`, `charged_back`, `cancelled`, `expired`, `payment_failed`) plus boolean `access_active` (`schema-purchases.sql:19-24,26`) | **Imprecise (U3)** |
| Server logs show the e-mail masked | `maskEmail` (`api/_lib/handlers.ts:39`); every Gumroad log line with an e-mail uses it (`api/_lib/gumroad.ts:268,272,280,283,293`). The ping logs a `who` value (`gumroad.ts:354,357`): not re-checked that it is masked | PROVADO for the license route; ping `who`: A VALIDAR |
| Processes/spreadsheets are not sent or stored | No endpoint accepts them (only `functions/api/*.ts` license/ping/webhook routes); schema has no such column | PROVADO |
| "kept while the license is valid and up to 5 years for tax and accounting" (D-L8) | No job deletes rows; nothing enforces 5 years | **POLÍTICA (P1)** |

## §5 Third parties

| Sentence | Evidence | State |
|---|---|---|
| Gumroad sells, holds the key, checks the purchase | `verify` call (`gumroad.ts:11,86`) | PROVADO |
| Stripe (via Gumroad) processes payments; we get no card data | No code in the repo handles card data (checkout is a Gumroad link, `VITE_GUMROAD_CHECKOUT_URL`). That Gumroad uses Stripe: founder's Gumroad setup, not code | **V2: depends on Gumroad's setup/docs** |
| Cloudflare hosts the app and the API | Pages Functions in `functions/api/*.ts`; `public/_headers` | PROVADO (hosting is the production choice: `docs/DEPLOY_CLOUDFLARE.md`) |
| Supabase stores the purchase record | `supabaseStore` (`api/_lib/store.ts:32,48,93`) | PROVADO |
| No ad cookies or external fonts; app has no analytics | `font-src 'self'` (`public/_headers:10`); grep for font/analytics hosts in `src`, `index.html`, `_headers`, `vercel.json` found none | PROVADO |

## §6 Your choices

| Sentence | Evidence | State |
|---|---|---|
| Backup and restore in the app | `exportBackup`/`parseBackup` (`db.ts:265,269`); buttons in `src/pages/Home.tsx` | PROVADO |
| "Delete local data" removes projects and drafts | `clearAll` clears `workspaces` and `drafts` (`db.ts:246-248`), called by `wipe` (`Home.tsx:58-60`) | PROVADO |
| ...and the access token and the license key | `clearAll` removes every localStorage key starting with `nexo.` (`db.ts:250`); `nexo.license` and `nexo.license.key` match (`config.ts:37,59`) | PROVADO |
| (not claimed) language preference | `nexo-ui.lang` is outside the prefix and survives (`locale.ts:13`) | Not in the text; true |

## §7-§9

| Sentence | Evidence | State |
|---|---|---|
| Rights by e-mail; reply within 30 days (D-L9) | An operational commitment | **POLÍTICA (P2)** |
| Legal bases: contract and legitimate interest | A legal position of the founder | **POLÍTICA (P3)** |
| Controller = the seller named in the Terms | Terms §1 | PROVADO (text) |
| Not intended for children under 16 (D-L11) | No age gate in the app | **POLÍTICA (P4)** |

## Open decisions for the founder

1. **U1:** remove the word "backups" from §2 (recommended), or say instead that backups are files you download and the app keeps no copy.
2. **U2:** keep the sentence only if the Cloudflare EU option is switched on before sales; re-check after switching.
3. **U3:** change "status (active or revoked)" to "status" (recommended), or "access status".
4. **V1, V2:** open the Cloudflare Web Analytics docs and the Gumroad payments page and confirm.
5. **P1-P4** are commitments; keep only what the founder can honour.
