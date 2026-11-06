# Privacy Policy EN: evidence map (INTERNAL, not published)

Not one of the three legal texts; the build and `nexo:site:en` ignore this file. Created 04/11/2026 for the founder's review (C5).
Base: `wip/en-foundation`, read against the tree at the commit that adds this file. Paths are under `apps/nexoprocess/`.
Legend: **PROVADO** = the code or schema shows it; **POLÍTICA** = a commitment, no code can prove it; **NÃO COMPROVADO** = the code does not support the sentence as written (decision needed).

## Result

- **U1 (§2 "backups" stored in the browser): contradicted by the code. FIXED 04/11/2026**: the word was removed from the text.
- **U2 (§3.1 "Visits from the EU are not measured"): RESOLVED 06/11/2026.** Founder fact: the "exclude EU visitors" option does not exist in the current Cloudflare Web Analytics dashboard, so the sentence was false. It was removed and replaced with: "Visits from all countries are measured the same way. You can block the script with your browser or a content blocker; the public pages work without it." Code check: `public/en/*.html` have no script of their own; the only script is the injected beacon (`scripts/lib/en-site.mjs`), and nothing depends on it.
- **U3 (§4 "status (active or revoked)"): imprecise. FIXED 04/11/2026**: text now says "status".
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
| ~~backups~~ (removed from the text) | Nothing stores a backup in the browser. A backup is a JSON **file the user downloads** (`db.ts:257-266`, `exportBackup`); IndexedDB has only the two stores above (`db.ts:51-52`). | **CORRIGIDO (U1)** |
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
| ~~"Visits from the EU are not measured."~~ (removed 06/11/2026) | Replaced by "Visits from all countries are measured the same way... the public pages work without it." Pages `/en/` have no script of their own besides the injected beacon (`public/en/*.html`; `scripts/lib/en-site.mjs:21-27`) | **RESOLVIDO (U2)** |

## §4 What we keep on the server

| Sentence | Evidence | State |
|---|---|---|
| e-mail, product, sale id | `email`, `product_id`, `transaction_id` (`api/_lib/schema-purchases.sql:15-18`) | PROVADO |
| amount and currency paid (PRIVACY §4) | `amount numeric(14,2)`, `currency text` (`schema-purchases.sql:25,27`); filled from the sale (`api/_lib/store.ts:14-16,74-76`) | PROVADO |
| event and date | `last_event`, `last_event_occurred_at`, `updated_at` (`schema-purchases.sql:28-30`) | PROVADO |
| **"status"** (was "active or revoked") | `status` has nine values (`active`, `partially_refunded`, `refund_pending_approval`, `refunded`, `chargeback_warning`, `charged_back`, `cancelled`, `expired`, `payment_failed`) plus boolean `access_active` (`schema-purchases.sql:19-24,26`) | **CORRIGIDO (U3)** |
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

## Terms of Use (`TERMS_EN.md`): factual sentences

Added 04/11/2026 (the first version of this file covered only the Privacy Policy). Paths under `apps/nexoprocess/`.

| Sentence | Evidence | State |
|---|---|---|
| §2 "US$ 39, one-time" | Landing price: `public/en/index.html:7,34,88`. The charged price is configured in the Gumroad product, not in code | PROVADO (landing); the charge itself: **V3, Gumroad panel** |
| §2 "Taxes may be added at checkout by Gumroad" | Checkout is only a link (`VITE_GUMROAD_CHECKOUT_URL`); tax is Gumroad's behaviour | **V3: depends on a third-party doc** |
| §2 "sign in with the e-mail used in the purchase and the license key" | `decide(..., expectedEmail)` rejects `email_diferente` (`api/_lib/gumroad.ts:129`); key sent to Gumroad `verify` (`gumroad.ts:94`) | PROVADO |
| §2 "No fixed device limit" | `increment_uses_count: 'false'` always (`gumroad.ts:3,94`); no device count anywhere | PROVADO |
| §2 "Excessive or shared use may lead to the key being disabled" | Manual revoke by the founder (`docs/GUMROAD_ENTITLEMENT.md` §13.3). No automatic detection | **POLÍTICA (P5)** |
| §3 "signed token stored on your device" | Token verified with the public key (`src/license/token.ts:44-46`), stored under `nexo.license` (`src/license/config.ts:37`) | PROVADO |
| §3 "renews it in the background when you are online" | `LicenseGate.tsx:34-36` (`navigator.onLine`, token older than `refreshAfterSec` = 3600 s, `config.ts:34`). Server re-checks Gumroad only if the token is at least 86 400 s old, otherwise returns it unchanged (`gumroad.ts:260`) | PROVADO (see note N1) |
| §3 / landing "30 days" offline | Token `exp = now + (ttlDays ?? 30) days` (`gumroad.ts:304`; `api/_lib/handlers.ts:63,130`). Constant `LICENSE_OFFLINE_DAYS = 30` (`scripts/lib/en-site.mjs:7`), tested in `tests/api/en-site.test.ts` | PROVADO (depends on `LICENSE_TTL_DAYS` staying unset: `docs/LANCAMENTO_EN.md:38`) |
| §3 "Access ends at the next online license check after a refund, chargeback or unresolved dispute" | `refunded` → revoke; `chargebacked` or `disputed` without `dispute_won` → revoke (`gumroad.ts:139-143,165-166`). On `nao_encontrado` the app clears the token and goes to `/entrar?motivo=revogado` (`LicenseGate.tsx:36-38`) | PROVADO (see note N1) |
| §3 "A partial refund keeps your access" | `gumroad.ts:148`: "reembolso parcial não aparece no verify: acesso mantido (D6)"; schema keeps `access_active` for `partially_refunded` (`schema-purchases.sql:21,435-449`) | PROVADO |
| §3 "If we cannot verify automatically, the app asks you to contact support, and access can be granted manually" | Server answers **422 `ativacao_manual`** with a contact-support message (`gumroad.ts:207-212,297`); app maps 422 to `license.error.manual` (`config.ts:145`). Manual grant via `gumroad_manual` (`docs/GUMROAD_ENTITLEMENT.md` §13.2; `gumroad.ts:295`) | PROVADO |
| §4 "processes, spreadsheets... stay on your device; we do not receive them" | Same as Privacy §1: IndexedDB (`src/storage/db.ts:51-52`), CSP `connect-src 'self'` (`public/_headers:10`) | PROVADO |
| §4 "the app has a backup/restore function" | `exportBackup` (`db.ts:265`), `restoreBackup` (`db.ts:286`) | PROVADO |
| §4 "Clearing browser data or private browsing can erase your work" | Data lives only in IndexedDB/localStorage (`db.ts:51-52`). `clearAll` also removes every `nexo.*` key, including `nexo.license.key` (`db.ts:246-253`; key name `config.ts:59`) | PROVADO |
| §5 "Do not try to bypass the license check" | A rule, not a code fact. The check is client-side for the PWA (token verification, `token.ts:44`) | **POLÍTICA (P6)** |
| §1 "Sold by Felipe Del Rio, an individual based in Brazil" | Founder's identity | **POLÍTICA** (founder confirms) |
| §7 "total liability limited to the amount you paid"; §9 Brazilian law | Legal positions of the founder; no lawyer review | **POLÍTICA (P3)** |

**N1 (nuance, not a contradiction):** the client tries to renew when the token is older than 1 hour, but the server only re-checks Gumroad when the token is at least 24 hours old. So "next online license check" means, in practice, up to about 24 h after the refund while online, and up to 30 days offline. The Terms and the landing do not promise a shorter time.

**Not proven by code in the Terms:** only the third-party items (V3) and the founder's commitments (P5, P6, P3). Nothing in the Terms contradicts the code.

## Decisions taken (04/11/2026, authority delegated by the founder)

1. U1: removed "backups" from §2.
2. U2: sentence removed 06/11/2026 (the Cloudflare EU option does not exist); no pre-sale action pending.
3. U3: "status" only.
4. V1, V2: the founder should open the Cloudflare Web Analytics docs and the Gumroad payments page and confirm (not re-read today).
5. P1-P4 are commitments; keep only what the founder can honour.
