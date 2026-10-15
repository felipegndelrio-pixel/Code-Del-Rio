// Importação/exportação reais contra o stack local: template → importação,
// rejeição controlada, atualização por código, ida e volta XLSX/CSV,
// permissões na exportação e na importação.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { createProject, createUser, sql, type TestUser } from './helpers';
import { addMember, loadDataset, runImport } from '../../src/lib/api';
import { buildTemplate, buildWorkbook, toCsv, toSheetRows, workbookToBuffer, type Dataset } from '../../src/lib/sheets/export';
import {
  autoMap,
  buildPayload,
  collectFileCodes,
  detectEntity,
  diffRows,
  readCsv,
  readWorkbook,
  validateSheet,
  type ValidRow,
  type ValidationContext,
} from '../../src/lib/sheets/import';
import { SHEET_BY_ENTITY, SHEETS, type EntityKey } from '../../src/lib/sheets/schema';

let gerente: TestUser;
let resp: TestUser;
let outsider: TestUser;
let project: { id: string; code: string };

beforeAll(async () => {
  gerente = await createUser('imp-gerente', { canCreate: true });
  resp = await createUser('imp-resp');
  outsider = await createUser('imp-intruso', { canCreate: true });
  project = await createProject(gerente, { name: 'Projeto Importação', budget_planned: 50000 });
  await addMember(gerente.client, project.id, resp.email, 'responsavel');
});

afterAll(async () => {
  await sql.end();
});

function contextFrom(d: Dataset, fileCodes: ValidationContext['fileCodes'], ignoreBlank = true): ValidationContext {
  const rows = toSheetRows(d);
  const knownCodes = Object.fromEntries(
    SHEETS.map((s) => [s.entity, new Set(rows[s.entity].map((r) => String(r.code)))]),
  ) as Record<EntityKey, Set<string>>;
  return { knownCodes, fileCodes, userEmails: new Set(d.profiles.map((p) => p.email)), ignoreBlank };
}

async function workbookToPayload(buf: ArrayBuffer, d: Dataset, ignoreBlank = true) {
  const sheets = await readWorkbook(buf);
  const items = sheets.map((sheet) => {
    const entity = detectEntity(sheet);
    return { entity, sheet, mapping: entity ? autoMap(sheet.headers, SHEET_BY_ENTITY[entity]) : [] };
  });
  const ctx = contextFrom(d, collectFileCodes(items), ignoreBlank);
  const valid: Partial<Record<EntityKey, ValidRow[]>> = {};
  const errors: unknown[] = [];
  const diffs: Record<string, ReturnType<typeof diffRows>> = {};
  const current = toSheetRows(d);
  for (const it of items) {
    if (!it.entity) continue;
    const r = validateSheet(it.entity, it.sheet, it.mapping, ctx);
    valid[it.entity] = r.rows;
    errors.push(...r.errors);
    diffs[it.entity] = diffRows(it.entity, r.rows, current[it.entity]);
  }
  return { payload: buildPayload(valid), errors, diffs, items };
}

describe('Template oficial → importação', () => {
  it('importa projeto de teste com marcos, EAP, ações, riscos e dependências', async () => {
    const wb = buildTemplate();
    const P = 'PRJ-T' + Date.now().toString().slice(-6);
    wb.getWorksheet('Projetos')!.addRow([P, 'Implantação ERP (teste)', 'Projeto de teste', null, null, 'TI', null, null, gerente.email, 'Em andamento', 'Alta', new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31)), null, null, 200000, 20000]);
    wb.getWorksheet('Cronograma')!.addRow([`${P}-E1`, P, null, 'Desenho', null, 'Sim', null, '2026-01-01', '2026-02-28', null, null, 50, 1]);
    wb.getWorksheet('Cronograma')!.addRow([`${P}-E2`, P, null, 'Construção', null, 'Sim', null, '2026-03-01', '2026-06-30', null, null, 0, 2, null, null, null, `${P}-E1`]);
    wb.getWorksheet('Marcos')!.addRow([`${P}-M1`, P, `${P}-E1`, 'Desenho aprovado', null, '15/02/2026']);
    wb.getWorksheet('Ações')!.addRow([`${P}-A1`, P, `${P}-E1`, `${P}-M1`, 'Levantar requisitos', null, null, gerente.email, 'Equipe TI', '2026-01-05', '2026-01-30', null, 'Em andamento', 'Crítica', 'Alta', 30]);
    wb.getWorksheet('Ações')!.addRow([`${P}-A2`, P, null, null, 'Validar requisitos', null, null, null, null, '2026-02-01', '2026-02-10', null, 'Não iniciada', 'Média', 'Média', 0, null, null, null, `${P}-A1`]);
    wb.getWorksheet('Riscos')!.addRow([null, P, 'Atraso de integração', null, 'Técnico', null, null, 3, 4]);
    const buf = await workbookToBuffer(wb);

    const before = await loadDataset(gerente.client, { auditLimit: 0 });
    const { payload, errors } = await workbookToPayload(buf, before);
    expect(errors).toEqual([]);

    const dry = await runImport(gerente.client, payload, true);
    expect(dry.errors).toEqual([]);
    expect(dry.committed).toBe(false);
    expect(dry.summary.actions.inserted).toBe(2);
    const afterDry = await sql.query('select count(*)::int n from public.projects where code = $1', [P]);
    expect(afterDry.rows[0].n).toBe(0); // dry-run não grava nada

    const res = await runImport(gerente.client, payload, false);
    expect(res.errors).toEqual([]);
    expect(res.committed).toBe(true);
    expect(res.summary).toMatchObject({
      projects: { inserted: 1 },
      wbs_items: { inserted: 2 },
      milestones: { inserted: 1 },
      actions: { inserted: 2 },
      risks: { inserted: 1 },
    });
    const dep = await sql.query(
      `select a.code, d.code dep from public.action_dependencies x join public.actions a on a.id = x.action_id join public.actions d on d.id = x.depends_on_id where a.code = $1`,
      [`${P}-A2`],
    );
    expect(dep.rows).toEqual([{ code: `${P}-A2`, dep: `${P}-A1` }]);
    const pr = await sql.query(`select manager_id, status, budget_planned from public.projects where code = $1`, [P]);
    expect(pr.rows[0]).toMatchObject({ manager_id: gerente.id, status: 'em_andamento', budget_planned: '200000.00' });
    const wd = await sql.query(`select count(*)::int n from public.wbs_dependencies d join public.wbs_items w on w.id = d.successor_id where w.code = $1`, [`${P}-E2`]);
    expect(wd.rows[0].n).toBe(1);
  });
});

describe('Rejeição controlada', () => {
  it('validação local aponta erros por linha (tipo, obrigatório, enum, referência, datas)', async () => {
    const wb = buildTemplate();
    const ws = wb.getWorksheet('Ações')!;
    ws.addRow([null, 'PRJ-NAOEXISTE', null, null, 'Ação com projeto inexistente']);
    ws.addRow([null, project.code, null, null, null]); // sem título
    ws.addRow([null, project.code, null, null, 'Status inválido', null, null, null, null, null, null, null, 'Talvez']);
    ws.addRow([null, project.code, null, null, 'Prazo antes do início', null, null, null, null, '2026-05-10', '2026-05-01']);
    ws.addRow([null, project.code, null, null, 'Avanço 150', null, null, null, null, null, null, null, null, null, null, 150]);
    ws.addRow([null, project.code, null, null, 'Data inexistente', null, null, null, null, '31/02/2026']);
    const d = await loadDataset(gerente.client, { auditLimit: 0 });
    const { errors } = await workbookToPayload(await workbookToBuffer(wb), d);
    const rows = (errors as { row: number; message: string }[]).map((e) => e.row);
    expect(rows).toEqual(expect.arrayContaining([2, 3, 4, 5, 6, 7]));
    expect(JSON.stringify(errors)).toMatch(/PRJ-NAOEXISTE/);
    expect(JSON.stringify(errors)).toMatch(/obrigatório/);
    expect(JSON.stringify(errors)).toMatch(/inexistente/);
  });

  it('servidor rejeita o lote inteiro se uma linha falhar (sem gravação parcial)', async () => {
    const count = async () => (await sql.query('select count(*)::int n from public.actions where project_id = $1', [project.id])).rows[0].n;
    const before = await count();
    const res = await runImport(
      gerente.client,
      {
        actions: [
          { project_code: project.code, title: 'Linha válida', _row: 2 },
          { project_code: project.code, title: 'Linha inválida', progress: 500, _row: 3 },
          { project_code: project.code, title: 'Dono desconhecido', owner_email: 'ninguem@x.com', _row: 4 },
        ],
      },
      false,
    );
    expect(res.committed).toBe(false);
    expect(res.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(await count()).toBe(before);
  });

  it('limite de linhas por importação é aplicado no servidor', async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({ project_code: project.code, title: `Ação ${i}` }));
    const { error } = await gerente.client.rpc('import_records', { p_payload: { actions: rows }, p_dry_run: true });
    expect(error?.message).toMatch(/5\.000/);
  });
});

describe('Atualização por código e permissões', () => {
  it('atualiza apenas as colunas presentes; demais campos permanecem', async () => {
    const { data: a } = await gerente.client
      .from('actions')
      .insert({ project_id: project.id, title: 'Ação original', description: 'Manter', priority: 'alta' })
      .select()
      .single();
    const res = await runImport(gerente.client, { actions: [{ code: a.code, project_code: project.code, title: 'Título novo' }] }, false);
    expect(res.summary.actions.updated).toBe(1);
    const { data: b } = await gerente.client.from('actions').select('*').eq('id', a.id).single();
    expect(b).toMatchObject({ title: 'Título novo', description: 'Manter', priority: 'alta' });
  });

  it('não move registro para outro projeto via código', async () => {
    const other = await createProject(gerente, { name: 'Outro' });
    const { data: a } = await gerente.client.from('actions').insert({ project_id: project.id, title: 'Fica aqui' }).select().single();
    const res = await runImport(gerente.client, { actions: [{ code: a.code, project_code: other.code, title: 'x' }] }, false);
    expect(res.committed).toBe(false);
    expect(res.errors[0].message).toMatch(/outro projeto/);
  });

  it('responsável atualiza execução da própria ação via planilha, mas não cria ações', async () => {
    const { data: a } = await gerente.client
      .from('actions')
      .insert({ project_id: project.id, title: 'Ação do responsável', owner_id: resp.id })
      .select()
      .single();
    const ok = await runImport(resp.client, { actions: [{ code: a.code, project_code: project.code, progress: 70, status: 'em_andamento' }] }, false);
    expect(ok.errors).toEqual([]);
    expect(ok.committed).toBe(true);
    const deny = await runImport(resp.client, { actions: [{ project_code: project.code, title: 'Criada pelo responsável' }] }, false);
    expect(deny.committed).toBe(false);
    expect(deny.errors[0].message).toMatch(/row-level security|permiss/i);
    const deny2 = await runImport(resp.client, { actions: [{ code: a.code, project_code: project.code, due_date: '2030-01-01' }] }, false);
    expect(deny2.committed).toBe(false);
  });

  it('não membro não importa para projeto alheio', async () => {
    const res = await runImport(outsider.client, { risks: [{ project_code: project.code, title: 'Invasão', probability: 1, impact: 1 }] }, false);
    expect(res.committed).toBe(false);
    expect(res.errors[0].message).toMatch(/não encontrado ou sem acesso/);
  });

  it('exportação respeita permissões (não membro não recebe dados do projeto)', async () => {
    const d = await loadDataset(outsider.client);
    expect(d.projects.find((p) => p.id === project.id)).toBeUndefined();
    expect(d.actions.find((a) => a.project_id === project.id)).toBeUndefined();
    expect(d.audit.find((a) => a.project_id === project.id)).toBeUndefined();
  });
});

describe('Ida e volta (exportar → importar)', () => {
  it('XLSX exportado reimporta sem alterações e preserva integridade', async () => {
    const d = await loadDataset(gerente.client);
    expect(d.actions.length).toBeGreaterThan(3);
    const wb = buildWorkbook(d, { generatedBy: gerente.email, filters: 'teste' });
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(
      expect.arrayContaining(['Resumo', 'Projetos', 'Ações', 'Cronograma', 'Marcos', 'Riscos', 'Problemas', 'Stakeholders', 'Decisões', 'Indicadores', 'Histórico']),
    );
    const buf = await workbookToBuffer(wb);
    const { payload, errors, diffs } = await workbookToPayload(buf, d, false);
    expect(errors).toEqual([]);
    for (const [entity, list] of Object.entries(diffs)) {
      expect(list.filter((x) => x.kind !== 'sem_alteracao'), entity).toEqual([]);
    }
    const res = await runImport(gerente.client, payload, true);
    expect(res.errors).toEqual([]);
    for (const [entity, s] of Object.entries(res.summary)) {
      expect(s.inserted + s.updated, `${entity} deveria ficar inalterado`).toBe(0);
    }
  });

  it('alteração feita na planilha exportada é aplicada e auditada', async () => {
    const d = await loadDataset(gerente.client);
    const wb = buildWorkbook(d, { generatedBy: gerente.email, filters: '' });
    const buf1 = await workbookToBuffer(wb);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf1);
    const ws = wb2.getWorksheet('Ações')!;
    const headers = Array.from(ws.getRow(1).values as unknown[], (h) => String(h ?? ""));
    const iTitle = headers.findIndex((h) => h.startsWith('Ação'));
    const iProg = headers.findIndex((h) => h.startsWith('Avanço'));
    const iCode = headers.findIndex((h) => h === 'Código');
    let target = '';
    ws.eachRow((row, n) => {
      if (n > 1 && !target && row.getCell(iTitle).value === 'Título novo') {
        target = String(row.getCell(iCode).value);
        row.getCell(iProg).value = 55;
      }
    });
    expect(target).toMatch(/^ACT-/);
    const { payload } = await workbookToPayload(await workbookToBuffer(wb2), d);
    const res = await runImport(gerente.client, payload, false);
    expect(res.errors).toEqual([]);
    expect(res.summary.actions.updated).toBe(1);
    const r = await sql.query('select progress from public.actions where code = $1', [target]);
    expect(r.rows[0].progress).toBe(55);
    const au = await sql.query(`select old_value, new_value, actor_id from public.audit_log where record_code = $1 and field = 'progress' order by id desc limit 1`, [target]);
    expect(au.rows[0]).toMatchObject({ new_value: 55, actor_id: gerente.id });
  });

  it('CSV exportado reimporta sem alterações', async () => {
    const d = await loadDataset(gerente.client, { auditLimit: 0 });
    const rows = toSheetRows(d);
    for (const entity of ['actions', 'risks', 'projects'] as EntityKey[]) {
      const sheet = readCsv(toCsv(entity, rows[entity]), 'arquivo.csv');
      expect(detectEntity(sheet)).toBe(entity);
      const mapping = autoMap(sheet.headers, SHEET_BY_ENTITY[entity]);
      const ctx = contextFrom(d, collectFileCodes([{ entity, sheet, mapping }]), false);
      const v = validateSheet(entity, sheet, mapping, ctx);
      expect(v.errors).toEqual([]);
      expect(diffRows(entity, v.rows, rows[entity]).filter((x) => x.kind !== 'sem_alteracao')).toEqual([]);
      const res = await runImport(gerente.client, buildPayload({ [entity]: v.rows }), true);
      expect(res.errors).toEqual([]);
      expect(res.summary[entity].inserted + res.summary[entity].updated).toBe(0);
    }
  });
});
