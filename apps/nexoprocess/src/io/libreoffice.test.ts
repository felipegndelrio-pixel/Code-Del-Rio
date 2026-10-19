// Verifica, no LibreOffice real (headless), que a proteção do modelo é reconhecida:
// abas protegidas e células de entrada desprotegidas. Pulado se o soffice não existir.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildWorkbook } from './workbook';

const soffice = ['/usr/bin/soffice', '/usr/bin/libreoffice'].find((p) => existsSync(p));

describe.skipIf(!soffice)('modelo XLSX no LibreOffice', () => {
  it('abas protegidas e células de entrada editáveis após conversão para ODS', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexo-lo-'));
    const xlsx = join(dir, 'modelo.xlsx');
    writeFileSync(xlsx, await buildWorkbook());
    execFileSync(soffice!, ['--headless', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'ods', '--outdir', dir, xlsx], { timeout: 120_000, stdio: 'ignore' });
    const zip = await JSZip.loadAsync(readFileSync(join(dir, 'modelo.ods')));
    const content = await zip.file('content.xml')!.async('string');
    const tables = [...content.matchAll(/<table:table [^>]*table:name="([^"]+)"[^>]*>/g)].map((m) => ({ name: m[1], protected: /table:protected="true"/.test(m[0]) }));
    expect(tables.map((t) => t.name)).toEqual(['Leia-me', 'Processo', 'Atividades', 'Custos por função', 'Exemplo']);
    expect(tables.every((t) => t.protected)).toBe(true);
    // Estilos de célula desprotegidos existem (células de entrada) …
    expect(content).toMatch(/style:cell-protect="none"/);
    // Limitação conhecida (documentada): o LibreOffice não preserva a trava de
    // estrutura sem senha (workbookProtection lockStructure). Registramos o fato.
    expect(content).not.toMatch(/table:structure-protected="true"/);
  }, 180_000);
});
