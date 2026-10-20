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

export async function parseHotmart(req: Request): Promise<HotmartEvent> {
  const type = req.headers.get('content-type') ?? '';
  let body: unknown;
  const text = await req.text();
  if (/json/i.test(type) || /^\s*\{/.test(text)) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  } else body = Object.fromEntries(new URLSearchParams(text));

  const event = str(get(body, ['event'])) ?? str(get(body, ['status'])) ?? str(get(body, ['data', 'purchase', 'status'])) ?? '';
  return {
    hottok: req.headers.get('x-hotmart-hottok') ?? str(get(body, ['hottok'])),
    event,
    email: str(get(body, ['data', 'buyer', 'email'])) ?? str(get(body, ['buyer', 'email'])) ?? str(get(body, ['email'])),
    productId: str(get(body, ['data', 'product', 'id'])) ?? str(get(body, ['prod'])) ?? str(get(body, ['product', 'id'])),
    transaction: str(get(body, ['data', 'purchase', 'transaction'])) ?? str(get(body, ['transaction'])),
    action: classify(event),
  };
}
