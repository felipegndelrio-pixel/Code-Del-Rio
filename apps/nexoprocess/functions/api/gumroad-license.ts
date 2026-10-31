// Cloudflare Pages Function: /api/gumroad-license (ativação e renovação EN, Gumroad).
import { licenseDepsFromEnv } from '../../api/_lib/handlers.js';
import { gumroadDepsFromEnv, handleGumroadLicense } from '../../api/_lib/gumroad.js';
import type { Env } from '../../api/_lib/store.js';

export const onRequest = ({ request, env }: { request: Request; env: Env }): Promise<Response> =>
  handleGumroadLicense(request, gumroadDepsFromEnv(env, licenseDepsFromEnv(env)));
