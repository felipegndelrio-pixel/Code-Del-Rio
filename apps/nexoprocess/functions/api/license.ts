// Cloudflare Pages Function: /api/license (ativação e renovação do acesso).
// Mesma lógica da Vercel (api/license.ts); as variáveis chegam em context.env.
import { handleLicense, licenseDepsFromEnv } from '../../api/_lib/handlers.js';
import type { Env } from '../../api/_lib/store.js';

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> => handleLicense(request, licenseDepsFromEnv(env));
