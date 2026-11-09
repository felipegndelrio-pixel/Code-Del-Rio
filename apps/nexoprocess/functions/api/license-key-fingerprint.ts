// Cloudflare Pages Function: GET /api/license-key-fingerprint → { fp } (8 hex do par de licença deste ambiente).
// Pública e sem segredo (x e y são públicos). Usada por `npm run nexo:check-deploy` depois de cada deploy.
import { handleKeyFingerprint } from '../../api/_lib/handlers.js';
import type { Env } from '../../api/_lib/store.js';

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> => handleKeyFingerprint(request, env.LICENSE_PRIVATE_JWK);
