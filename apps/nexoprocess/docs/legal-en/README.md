# English legal texts — APPROVED

Status: **approved by the founder on 02/11/2026** (decisions D-L1 to D-L13); last updated 04/11/2026. These texts were **not** reviewed by a lawyer.

- Files: `TERMS_EN.md`, `PRIVACY_EN.md`, `REFUND_EN.md`.
- Contact is the `{{SUPPORT_EMAIL}}` marker, replaced at build time with `VITE_SUPPORT_EMAIL`; the sale build fails if a marker is left over.
- Approval switch: each file starts with `status:` (`draft` or `approved`). The sale build requires all three to be `approved` and free of open-point or draft markers (see `docs/LANCAMENTO_EN.md` §6.3).
- After editing, run `npm run nexo:site:en` to regenerate `public/en/*.html`. The PT texts are unchanged.
