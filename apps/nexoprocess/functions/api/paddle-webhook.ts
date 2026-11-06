// Cloudflare Pages Function: /api/paddle-webhook (eventos assinados da Paddle Billing).
// O destino de notificação na conta Paddle é ação do fundador, fora do repositório.
import { licenseDepsFromEnv } from '../../api/_lib/handlers.js';
import { handlePaddleWebhook, paddleDepsFromEnv } from '../../api/_lib/paddle.js';
import type { Env } from '../../api/_lib/store.js';

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> =>
  handlePaddleWebhook(request, paddleDepsFromEnv(env, licenseDepsFromEnv(env)));
