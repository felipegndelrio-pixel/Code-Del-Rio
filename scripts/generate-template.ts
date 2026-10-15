// Gera docs/template-importacao.xlsx a partir da mesma definição usada pela aplicação.
import { writeFileSync } from 'node:fs';
import { buildTemplate, workbookToBuffer } from '../src/lib/sheets/export';

const out = process.argv[2] ?? 'docs/template-importacao.xlsx';
writeFileSync(out, Buffer.from(await workbookToBuffer(buildTemplate())));
console.log(`Template gerado em ${out}`);
