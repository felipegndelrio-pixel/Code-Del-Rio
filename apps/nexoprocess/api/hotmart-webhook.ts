// Vercel Function: POST /api/hotmart-webhook (URL a cadastrar no painel da Hotmart).
import { handleWebhook, webhookDepsFromEnv } from './_lib/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handleWebhook(request, webhookDepsFromEnv(process.env));
}
