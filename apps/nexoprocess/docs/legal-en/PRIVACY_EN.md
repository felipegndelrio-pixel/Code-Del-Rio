# NexoProcess — Privacy Policy (DRAFT v0.1 — not reviewed by a lawyer)

> DRAFT. Not for publication. Open points are marked `TO VALIDATE`.

Last updated: 01/11/2026 (draft)

## 1. Summary
Your process data stays on your device. We only handle the data needed to check your purchase.

## 2. What stays on your device
Stored in your browser (IndexedDB / localStorage): your processes, drafts, backups, preferences (theme, language), tips already seen, and the access token and license key used to keep you signed in. The app's service worker caches only app files, never your process data.

Spreadsheets you import are read in memory. The file itself is not stored; only the extracted data, the file name and a hash are kept on your device.

## 3. What is sent to our server
| When | What is sent | Why |
|---|---|---|
| Sign in | The purchase e-mail and the license key | Verify the purchase with Gumroad and issue an access token |
| Background renewal (at most once an hour, online only) | The access token and the license key | Check the purchase is still valid (refund, chargeback, dispute) |

## 4. What we keep on the server
A purchase record: e-mail, product, sale identifier, status (active or revoked), event and date. Server logs show the e-mail masked. Your processes and spreadsheets are **not** sent or stored.

## 5. Third parties
- **Gumroad** sells the product, holds the license key and checks the purchase. Payments are processed through Stripe by Gumroad. We do not receive card data.
- **Hosting provider** (static files and the API) receives technical request metadata (IP, user agent, time, URL).
- **Database provider** stores the purchase record.
- No analytics, advertising cookies or external fonts are used.

TO VALIDATE: the exact legal name and privacy terms of each provider, and the data-processing agreements in place.

## 6. Your choices
- Backup and restore your data in the app.
- "Delete local data" removes everything the app stored on the device, including the access token.
- To ask about or request deletion of your purchase record, contact support.

## 7. Legal bases and your rights
TO VALIDATE (lawyer): legal bases and rights text for buyers outside Brazil (for example GDPR in the EU/UK, CCPA/CPRA in California), international transfer wording, retention period, and who is the controller. The Brazilian LGPD text is in the Portuguese policy; it is not copied here.

## 8. Children
TO VALIDATE (lawyer).

## 9. Contact
Use the support e-mail shown in the app.
