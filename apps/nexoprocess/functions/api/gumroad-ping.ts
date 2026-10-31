// Cloudflare Pages Function: /api/gumroad-ping?secret=… (gatilho de reverificação; o
// cadastro desta URL na conta Gumroad é ação do fundador).
import { licenseDepsFromEnv } from '../../api/_lib/handlers.js';
import { gumroadDepsFromEnv, handleGumroadPing } from '../../api/_lib/gumroad.js';
import type { Env } from '../../api/_lib/store.js';

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> =>
  handleGumroadPing(request, gumroadDepsFromEnv(env, licenseDepsFromEnv(env)));
