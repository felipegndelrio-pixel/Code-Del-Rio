// Leitura defensiva do webhook da Hotmart.
// A VALIDAR no primeiro "Enviar teste" do painel da Hotmart: não foi possível consultar a
// documentação oficial deste ambiente. Por isso aceitamos as duas formas conhecidas:
// - 2.0.0 (JSON): { event: "PURCHASE_APPROVED", data: { buyer: { email }, product: { id }, purchase: { transaction, status } } },
//   token no cabeçalho X-HOTMART-HOTTOK;
// - 1.0 (formulário): campos hottok, email, prod, transaction, status.
// O que não for reconhecido é ignorado (200), nunca concede acesso.

export type HotmartAction = 'grant' | 'revoke' | 'ignore';

export interface HotmartEvent {
  hottok: string | null;
  event: string;
  email: string | null;
  productId: string | null;
  transaction: string | null;
  action: HotmartAction;
}

const GRANT = /APPROVED|COMPLETE/i; // compra aprovada / completa (fim da garantia)
const REVOKE = /REFUND|CHARGEBACK|CANCEL|EXPIRED|PROTEST|DISPUTE/i; // reembolso, chargeback, cancelamento…

const get = (o: unknown, path: string[]): unknown => path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

export function classify(event: string): HotmartAction {
  if (REVOKE.test(event)) return 'revoke';
  if (GRANT.test(event)) return 'grant';
  return 'ignore';
}

/**
 * Lê o corpo sem passar de `maxBytes`: recusa pelo Content-Length declarado e, sem ele
 * (ou se mentir), para de ler ao ultrapassar o limite. null = grande demais.
 */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function parseHotmart(req: Request): Promise<HotmartEvent> {
  return parseHotmartText(await req.text(), req.headers);
}

/** Mesmo parse de parseHotmart, sobre um corpo já lido (e com tamanho já conferido). */
export function parseHotmartText(text: string, headers: Headers): HotmartEvent {
  const type = headers.get('content-type') ?? '';
  let body: unknown;
  if (/json/i.test(type) || /^\s*\{/.test(text)) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  } else body = Object.fromEntries(new URLSearchParams(text));

  const event = str(get(body, ['event'])) ?? str(get(body, ['status'])) ?? str(get(body, ['data', 'purchase', 'status'])) ?? '';
  return {
    hottok: headers.get('x-hotmart-hottok') ?? str(get(body, ['hottok'])),
    event,
    email: str(get(body, ['data', 'buyer', 'email'])) ?? str(get(body, ['buyer', 'email'])) ?? str(get(body, ['email'])),
    productId: str(get(body, ['data', 'product', 'id'])) ?? str(get(body, ['prod'])) ?? str(get(body, ['product', 'id'])),
    transaction: str(get(body, ['data', 'purchase', 'transaction'])) ?? str(get(body, ['transaction'])),
    action: classify(event),
  };
}
