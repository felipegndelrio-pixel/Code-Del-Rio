// Cloudflare Pages Function: /api/hotmart-webhook (URL a cadastrar no painel da Hotmart).
import { handleWebhook, webhookDepsFromEnv } from '../../api/_lib/handlers.js';
import type { Env } from '../../api/_lib/store.js';

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> => handleWebhook(request, webhookDepsFromEnv(env));
