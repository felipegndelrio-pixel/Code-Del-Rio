// Gera planilhas de teste a partir do template oficial da aplicação.
// Uso: npx tsx tests/e2e/make-fixtures.ts <dir> <projectCode> <ownerEmail>
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTemplate, workbookToBuffer } from '../../src/lib/sheets/export';

const [dir, projectCode, owner] = process.argv.slice(2);
const bad = buildTemplate();
bad.getWorksheet('Ações')!.addRow([null, projectCode, null, null, 'Ação inválida', null, null, null, null, null, null, null, 'Talvez']);
writeFileSync(join(dir, 'invalida.xlsx'), Buffer.from(await workbookToBuffer(bad)));
const good = buildTemplate();
good.getWorksheet('Ações')!.addRow([null, projectCode, null, null, 'Ação importada via planilha', null, null, owner, null, '2026-11-01', '2026-11-30']);
good.getWorksheet('Riscos')!.addRow([null, projectCode, 'Risco importado', null, null, null, null, 2, 2]);
writeFileSync(join(dir, 'valida.xlsx'), Buffer.from(await workbookToBuffer(good)));
