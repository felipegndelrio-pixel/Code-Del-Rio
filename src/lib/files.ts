// Validação de anexos: extensão + tamanho + assinatura binária (magic bytes).
// Não confia apenas no nome nem no MIME informado pelo navegador.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

type Kind = { ext: string[]; mime: string; check: (b: Uint8Array) => boolean };

const starts = (b: Uint8Array, sig: number[], offset = 0) => sig.every((x, i) => b[offset + i] === x);
const isZip = (b: Uint8Array) => starts(b, [0x50, 0x4b, 0x03, 0x04]);
const isOle = (b: Uint8Array) => starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const isText = (b: Uint8Array) => {
  const n = Math.min(b.length, 4096);
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32)) return false;
  }
  return true;
};

const KINDS: Kind[] = [
  { ext: ['pdf'], mime: 'application/pdf', check: (b) => starts(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  { ext: ['png'], mime: 'image/png', check: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { ext: ['jpg', 'jpeg'], mime: 'image/jpeg', check: (b) => starts(b, [0xff, 0xd8, 0xff]) },
  { ext: ['webp'], mime: 'image/webp', check: (b) => starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8) },
  { ext: ['xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', check: isZip },
  { ext: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', check: isZip },
  { ext: ['pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', check: isZip },
  { ext: ['xls'], mime: 'application/vnd.ms-excel', check: isOle },
  { ext: ['csv'], mime: 'text/csv', check: isText },
  { ext: ['txt'], mime: 'text/plain', check: isText },
];

export const ACCEPT_ATTR = KINDS.flatMap((k) => k.ext.map((e) => `.${e}`)).join(',');

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export type FileCheck = { ok: true; mime: string } | { ok: false; error: string };

/** Valida tamanho, extensão permitida e se o conteúdo corresponde à extensão. */
export function validateFileBytes(name: string, size: number, head: Uint8Array): FileCheck {
  if (size <= 0) return { ok: false, error: 'Arquivo vazio' };
  if (size > MAX_FILE_BYTES) return { ok: false, error: 'Arquivo excede 20 MB' };
  const ext = extensionOf(name);
  const kind = KINDS.find((k) => k.ext.includes(ext));
  if (!kind) return { ok: false, error: `Extensão .${ext || '?'} não permitida` };
  if (!kind.check(head)) return { ok: false, error: `O conteúdo do arquivo não corresponde a .${ext}` };
  return { ok: true, mime: kind.mime };
}

export function sanitizeFileName(name: string): string {
  const ext = extensionOf(name);
  const base = name
    .slice(0, name.length - (ext ? ext.length + 1 : 0))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 100);
  return `${base || 'arquivo'}${ext ? '.' + ext : ''}`;
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
