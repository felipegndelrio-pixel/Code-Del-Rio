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
  /** Código da transação validado; null se ausente ou fora do formato aceito. */
  transaction: string | null;
  /** Veio um código de transação, mas fora do formato (tratado como ausente). */
  transactionInvalid: boolean;
  action: HotmartAction;
}

const GRANT = /APPROVED|COMPLETE/i; // compra aprovada / completa (fim da garantia)
const REVOKE = /REFUND|CHARGEBACK|CANCEL|EXPIRED|PROTEST|DISPUTE/i; // reembolso, chargeback, cancelamento…

const get = (o: unknown, path: string[]): unknown => path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

/**
 * Formato aceito para o código da transação (ex.: HP1234567890): letras, números, "_" e "-",
 * até 64. É o que permite usá-lo com segurança no filtro do PostgREST. Fora disso, a
 * transação é tratada como ausente: nunca reativa uma licença revogada.
 */
const TRANSACTION = /^[A-Za-z0-9_-]{1,64}$/;

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

/** Corpo do webhook como objeto: JSON (2.0.0) ou formulário (1.0). JSON inválido vira {}. */
function parseBody(text: string, headers: Headers): unknown {
  const type = headers.get('content-type') ?? '';
  if (/json/i.test(type) || /^\s*\{/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

// TEMPORÁRIO (v2.4.5, diagnóstico do reembolso): payload para o log da função, com os dados
// pessoais e os segredos mascarados. Mantém a estrutura (nomes e posição dos campos) e os
// valores técnicos (event, transaction, status, ids, datas). Remover depois do diagnóstico.
const SENSITIVE_KEY = /(^|_)(e?mail|name|nome|phone|telefone|document|doc|cpf|cnpj|address|endereco|zip_?code|zip|cep|street|city|neighborhood|complement|number|ip|hottok|token|card|password)(_|$)/i;
const SNAKE = (k: string) => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
const maskValue = (v: unknown): unknown => (typeof v === 'string' && v.includes('@') ? v.replace(/^(.).*(@.*)$/, '$1***$2') : v === null || v === undefined || v === '' ? v : '[omitido]');
function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SENSITIVE_KEY.test(SNAKE(k)) ? (x && typeof x === 'object' ? '[omitido]' : maskValue(x)) : redact(x)]));
  return v;
}
/** Payload mascarado e truncado (4 KB) para log. Nunca contém e-mail completo, nome, documento, telefone, endereço ou hottok. */
export function redactPayload(text: string, headers: Headers): string {
  const out = JSON.stringify(redact(parseBody(text, headers)));
  return out.length > 4096 ? `${out.slice(0, 4096)}…(truncado)` : out;
}

/** Mesmo parse de parseHotmart, sobre um corpo já lido (e com tamanho já conferido). */
export function parseHotmartText(text: string, headers: Headers): HotmartEvent {
  const body = parseBody(text, headers);

  const event = str(get(body, ['event'])) ?? str(get(body, ['status'])) ?? str(get(body, ['data', 'purchase', 'status'])) ?? '';
  const transaction = str(get(body, ['data', 'purchase', 'transaction'])) ?? str(get(body, ['transaction']));
  const valid = transaction !== null && TRANSACTION.test(transaction);
  return {
    hottok: headers.get('x-hotmart-hottok') ?? str(get(body, ['hottok'])),
    event,
    email: str(get(body, ['data', 'buyer', 'email'])) ?? str(get(body, ['buyer', 'email'])) ?? str(get(body, ['email'])),
    productId: str(get(body, ['data', 'product', 'id'])) ?? str(get(body, ['prod'])) ?? str(get(body, ['product', 'id'])),
    transaction: valid ? transaction : null,
    transactionInvalid: transaction !== null && !valid,
    action: classify(event),
  };
}
