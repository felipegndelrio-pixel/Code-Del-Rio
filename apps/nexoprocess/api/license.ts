// Vercel Function: POST /api/license (ativação e renovação do acesso).
import { handleLicense, licenseDepsFromEnv } from './_lib/handlers.js';

export function POST(request: Request): Promise<Response> {
  return handleLicense(request, licenseDepsFromEnv(process.env));
}
