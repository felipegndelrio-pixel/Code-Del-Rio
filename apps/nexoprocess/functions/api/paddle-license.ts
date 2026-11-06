// Cloudflare Pages Function: /api/paddle-license (ativação e renovação EN, Paddle).
import { licenseDepsFromEnv } from '../../api/_lib/handlers.js';
import { handlePaddleLicense, paddleDepsFromEnv } from '../../api/_lib/paddle.js';
import type { Env } from '../../api/_lib/store.js';

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> =>
  handlePaddleLicense(request, paddleDepsFromEnv(env, licenseDepsFromEnv(env)));
