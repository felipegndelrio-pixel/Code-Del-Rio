// Verifica o carregamento inicial do build de produção (Fase 1).
// Uso: npm run nexo:build && npm run nexo:check-bundle
// Falha (exit 1) se alguma regra for violada. Limites ajustáveis por variável.
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const KB = 1024;
const LIMITS = {
  htmlBytes: Number(process.env.MAX_HTML_BYTES ?? 5 * KB),
  entryGzip: Number(process.env.MAX_ENTRY_GZIP_KB ?? 130) * KB,
};
// Bibliotecas pesadas que não podem estar no carregamento inicial.
const FORBIDDEN_INITIAL = ['bpmn-js', 'diagram-js', 'exceljs', 'xlsx', 'jszip', 'recharts'];
// React não pode estar empacotado junto com os gráficos.
const REACT_PKGS = ['react', 'react-dom', 'scheduler'];

const pkgOf = (id) => id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1];
const gz = (file) => gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length;
const kb = (n) => (n / KB).toFixed(1).replace('.', ',') + ' KB';

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const report = JSON.parse(readFileSync(join(ROOT, '.reports/bundle-report.json'), 'utf8'));
const byFile = new Map(report.map((c) => [c.file, c]));
const entryFile = html.match(/<script type="module"[^>]*src="\/([^"]+\.js)"/)?.[1];
const initialFiles = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);

const failures = [];
const rows = [];
let initialGzip = 0;
for (const f of initialFiles) {
  const size = gz(f);
  initialGzip += size;
  const chunk = byFile.get(f);
  const pkgs = chunk ? [...new Set(chunk.modules.map(pkgOf).filter(Boolean))] : [];
  rows.push({ arquivo: f, gzip: kb(size), pacotes: pkgs.slice(0, 8).join(', ') + (pkgs.length > 8 ? ` (+${pkgs.length - 8})` : '') });
  for (const p of FORBIDDEN_INITIAL) if (pkgs.includes(p)) failures.push(`${p} está no carregamento inicial (${f}).`);
}

const htmlBytes = statSync(join(DIST, 'index.html')).size;
if (htmlBytes > LIMITS.htmlBytes) failures.push(`index.html tem ${htmlBytes} bytes (limite ${LIMITS.htmlBytes}).`);
if (!entryFile) failures.push('Não encontrei o script de entrada no index.html.');
const entryGzip = entryFile ? gz(entryFile) : 0;
if (entryGzip > LIMITS.entryGzip) failures.push(`Entrada ${entryFile} tem ${kb(entryGzip)} gzip (limite ${kb(LIMITS.entryGzip)}).`);

const reactChunks = report.filter((c) => c.modules.some((m) => REACT_PKGS.includes(pkgOf(m))));
for (const c of reactChunks) if (/charts|recharts/i.test(c.name)) failures.push(`React está dentro do chunk de gráficos (${c.file}).`);
const chartsChunks = report.filter((c) => c.modules.some((m) => pkgOf(m) === 'recharts')).map((c) => c.file);

console.table(rows);
console.log(`index.html: ${htmlBytes} bytes`);
console.log(`Entrada (${entryFile}): ${kb(entryGzip)} gzip`);
console.log(`Inicial (JS + CSS do index.html): ${kb(initialGzip)} gzip em ${initialFiles.length} arquivos`);
console.log(`Chunks com React: ${reactChunks.map((c) => c.file).join(', ')}`);
console.log(`Chunks com Recharts: ${chartsChunks.join(', ')}`);
if (failures.length) {
  console.error('\nFALHOU:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('\nOK: carregamento inicial dentro das regras da Fase 1.');
