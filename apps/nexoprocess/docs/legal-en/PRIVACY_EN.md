---
status: approved
---
# NexoProcess — Privacy Policy

Last updated: 04/11/2026

## 1. Summary
Your process data stays on your device. We only handle the data needed to check your purchase and to count visits to our public pages.

## 2. What stays on your device
Stored in your browser (IndexedDB / localStorage): your processes, drafts, backups, preferences (theme, language), tips already seen, and the access token and license key used to keep you signed in. The app's service worker caches only app files, never your process data.

Spreadsheets you import are read in memory. The file itself is not stored; only the extracted data, the file name and a hash are kept on your device.

## 3. What is sent to our server
| When | What is sent | Why |
|---|---|---|
| Sign in | The purchase e-mail and the license key | Verify the purchase with Gumroad and issue an access token |
| Background renewal (at most once an hour, online only) | The access token and the license key | Check the purchase is still valid (refund, chargeback, dispute) |

### 3.1 Website analytics (public pages only)
The public pages under `/en/` (the sales page and the legal pages) use **Cloudflare Web Analytics**, loaded as a script from Cloudflare. It measures visits and page performance. Per Cloudflare's documentation, it reports the page path, the referring site, the visitor's country, device type, browser and operating system, and page-load timings. Per the same documentation, it does not use cookies or `localStorage` and does not fingerprint visitors.

The app itself (what you use after signing in) does **not** load this script and sends nothing to Cloudflare Web Analytics.

Visits from the EU are not measured.

## 4. What we keep on the server
A purchase record: e-mail, product, sale identifier, status (active or revoked), amount and currency paid, event and date. Server logs show the e-mail masked. Your processes and spreadsheets are **not** sent or stored. Purchase records are kept while the license is valid and for up to 5 years for tax and accounting.

## 5. Third parties
- **Gumroad** sells the product, holds the license key and checks the purchase.
- **Stripe** (through Gumroad) processes payments. We do not receive card data.
- **Cloudflare** hosts the app and the API (it receives technical request metadata: IP, user agent, time, URL) and provides the analytics on the public pages only (section 3.1).
- **Supabase** stores the purchase record (database).
- No advertising cookies or external fonts are used, and the app has no analytics.

## 6. Your choices
- Backup and restore your data in the app.
- "Delete local data" removes your projects and drafts from the device, and also the access token and the license key.
- To ask about or request deletion of your purchase record, see section 7.

## 7. Controller, legal bases and your rights
Controller: the seller named in the Terms (Felipe Del Rio, an individual based in Brazil). Contact: {{SUPPORT_EMAIL}}

You may ask for access, correction, deletion and objection by e-mail to {{SUPPORT_EMAIL}}. We reply within 30 days. Legal bases: contract (the license) and legitimate interest (cookieless analytics on the public pages).

## 8. Children
Not intended for children under 16.

## 9. Contact
{{SUPPORT_EMAIL}}
