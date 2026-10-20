// Modelo XLSX oficial (protegido) e exportação de dados XLSX/CSV no MESMO
// formato — o arquivo exportado pode ser reimportado.
//
// Proteção: impede alterações ACIDENTAIS (células bloqueadas, estrutura do
// arquivo travada). Não é criptografia nem segurança contra usuários avançados;
// por isso não usamos senha.
import { demoProcess } from '../domain/demo';
import type { Activity, DurationUnit, ElementType, LeanClass, ProcessModel } from '../domain/types';
import { CALC_HEADERS, FIELDS, PROCESS_FIELDS, type FieldKey } from './fields';
import { csvCell } from './csv';

export const INPUT_ROWS = 300;
export const LEGEND = 'Campos coloridos: preencher. Campos cinza: calculados ou protegidos.';

const INPUT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F7FA' } } as const; // ciano claro
const LOCKED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } } as const; // cinza
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1A33' } } as const;
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } } as const;
const THIN = { style: 'thin', color: { argb: 'FFCBD5E1' } } as const;

const TYPE_TXT: Record<ElementType, string> = { start: 'início', task: 'atividade', decision: 'decisão', end: 'fim' };
const UNIT_TXT: Record<DurationUnit, string> = { min: 'minutos', h: 'horas', d: 'dias' };
const LEAN_TXT: Record<LeanClass, string> = { VA: 'agrega valor', NNVA: 'necessário', W: 'desperdício' };
const PERIOD_TXT = { dia: 'dia', semana: 'semana', mes: 'mês', ano: 'ano' } as const;

export function activityValues(a: Activity): Record<FieldKey, string | number | null> {
  const yn = (b?: boolean) => (b ? 'sim' : b === false ? 'não' : null);
  return {
    id_atividade: a.id,
    etapa_macro: a.stage,
    atividade: a.name,
    ordem: a.order,
    tipo_elemento: TYPE_TXT[a.type],
    duracao: a.duration ?? null,
    unidade_duracao: UNIT_TXT[a.unit],
    responsavel: a.owner ?? null,
    quantidade_pessoas: a.people ?? null,
    proxima_atividade: a.next.length ? a.next.join(', ') : null,
    proxima_se_sim: a.nextYes ?? null,
    proxima_se_nao: a.nextNo ?? null,
    classificacao_lean: a.lean ? LEAN_TXT[a.lean] : a.type === 'task' || a.type === 'decision' ? 'não classificado' : null,
    tempo_espera: a.wait ?? null,
    retrabalho: yn(a.rework),
    frequencia_pct: a.frequencyPct ?? null,
    atividade_critica: yn(a.critical),
    volume_periodo: a.volume ?? null,
    custo_hora: a.costPerHour ?? null,
    custo_variavel: a.variableCost ?? null,
    duracao_minima: a.minDuration ?? null,
    duracao_maxima: a.maxDuration ?? null,
    observacoes: a.notes ?? null,
  };
}

function processValues(p: ProcessModel): Record<string, string | number | null> {
  return {
    nome_processo: p.name,
    descricao: p.description ?? null,
    area: p.area ?? null,
    dono_processo: p.processOwner ?? null,
    volume: p.volume ?? null,
    periodo_volume: PERIOD_TXT[p.volumePeriod],
    dias_operacao_mes: p.operatingDaysPerMonth ?? null,
    horas_por_dia: p.hoursPerDay,
    custo_hora_padrao: p.defaultCostPerHour ?? null,
    custo_variavel_inclui_mao_de_obra: p.variableCostIncludesLabor ? 'sim' : p.variableCostIncludesLabor === false ? 'não' : null,
  };
}

// Os tipos do ExcelJS 4 não declaram `dataValidations` (existe em tempo de execução).
const dv = (ws: import('exceljs').Worksheet) => (ws as unknown as { dataValidations: { add: (range: string, v: Record<string, unknown>) => void } }).dataValidations;

const colLetter = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

export interface WorkbookOptions {
  /** Dados a preencher (exportação). Ausente = modelo limpo. */
  process?: ProcessModel;
  includeExample?: boolean;
}

export async function buildWorkbook(opts: WorkbookOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const { default: Excel } = await import('exceljs');
  const wb = new Excel.Workbook();
  wb.creator = 'NexoProcess';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const filled = opts.process;

  // ---------- Leia-me
  const info = wb.addWorksheet('Leia-me', { properties: { tabColor: { argb: 'FF22D3EE' } } });
  info.columns = [{ width: 28 }, { width: 12 }, { width: 70 }, { width: 26 }];
  const lines: [string, string?][] = [
    ['Como preencher o modelo do NexoProcess'],
    ['1. Na aba “Processo”, preencha nome e (se souber) volume e custos.'],
    ['2. Na aba “Atividades”, uma linha por atividade, na ordem em que acontecem.'],
    ['3. Mínimo necessário: Etapa macro, Atividade, Ordem, Duração e Unidade.'],
    ['4. Decisões: Tipo = decisão e preencha “Próxima se SIM” e “Próxima se NÃO” com códigos.'],
    ['5. Salve e importe o arquivo no NexoProcess. Os dados são lidos no seu navegador.'],
    [''],
    [LEGEND],
    ['A proteção evita alterações acidentais; não é um mecanismo de segurança. Não há senha.'],
    [''],
  ];
  lines.forEach(([t], i) => {
    const c = info.getCell(i + 1, 1);
    c.value = t;
    if (i === 0) c.font = { bold: true, size: 14 };
    if (t === LEGEND) c.font = { bold: true };
  });
  const dictStart = lines.length + 1;
  ['Campo (cabeçalho)', 'Mínimo?', 'O que é', 'Exemplo'].forEach((h, i) => {
    const c = info.getCell(dictStart, i + 1);
    c.value = h;
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
  });
  FIELDS.forEach((f, i) => {
    const r = info.getRow(dictStart + 1 + i);
    r.values = [f.label, f.minimal ? 'sim' : 'opcional', f.help, f.example];
    r.getCell(3).alignment = { wrapText: true, vertical: 'top' };
  });

  // ---------- Processo
  const pr = wb.addWorksheet('Processo', { properties: { tabColor: { argb: 'FF8B5CF6' } } });
  pr.columns = [{ width: 38 }, { width: 34 }, { width: 52 }];
  ['Campo', 'Valor (preencha aqui)', 'Ajuda'].forEach((h, i) => {
    const c = pr.getCell(1, i + 1);
    c.value = h;
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
  });
  const pv = filled ? processValues(filled) : { horas_por_dia: 8, periodo_volume: 'mês' };
  PROCESS_FIELDS.forEach((f, i) => {
    const row = i + 2;
    const label = pr.getCell(row, 1);
    label.value = f.label;
    label.fill = LOCKED_FILL;
    const val = pr.getCell(row, 2);
    val.value = (pv as Record<string, string | number | null>)[f.key] ?? null;
    val.protection = { locked: false };
    val.fill = INPUT_FILL;
    val.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    const help = pr.getCell(row, 3);
    help.value = f.help;
    help.fill = LOCKED_FILL;
    const addr = `B${row}`;
    if (f.kind === 'number')
      dv(pr).add(addr, {
        type: 'decimal',
        operator: f.key === 'horas_por_dia' ? 'between' : 'greaterThanOrEqual',
        formulae: f.key === 'horas_por_dia' ? [1, 24] : [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Valor inválido',
        error: f.key === 'horas_por_dia' ? 'Informe entre 1 e 24 horas.' : 'Informe um número maior ou igual a zero.',
      });
    if (f.kind === 'period') dv(pr).add(addr, { type: 'list', allowBlank: true, formulae: ['"dia,semana,mês,ano"'], showErrorMessage: true, errorTitle: 'Período inválido', error: 'Escolha dia, semana, mês ou ano.' });
    if (f.kind === 'bool') dv(pr).add(addr, { type: 'list', allowBlank: true, formulae: ['"sim,não"'], showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Escolha sim ou não.' });
  });
  const hoursRow = PROCESS_FIELDS.findIndex((f) => f.key === 'horas_por_dia') + 2;
  pr.getCell(PROCESS_FIELDS.length + 3, 1).value = LEGEND;
  pr.getCell(PROCESS_FIELDS.length + 3, 1).font = { italic: true };

  // ---------- Atividades
  const ws = wb.addWorksheet('Atividades', { views: [{ state: 'frozen', ySplit: 1 }], properties: { tabColor: { argb: 'FF14B8A6' } } });
  addActivitySheet(ws, filled?.activities ?? [], hoursRow, true);

  // ---------- Custos por função
  const cs = wb.addWorksheet('Custos por função');
  cs.columns = [{ width: 30 }, { width: 22 }];
  ['Função / responsável', 'Custo-hora carregado (R$)'].forEach((h, i) => {
    const c = cs.getCell(1, i + 1);
    c.value = h;
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
  });
  const roles = Object.entries(filled?.costPerHourByRole ?? {});
  for (let r = 2; r <= 61; r++) {
    for (let c = 1; c <= 2; c++) {
      const cell = cs.getCell(r, c);
      cell.protection = { locked: false };
      cell.fill = INPUT_FILL;
    }
    const e = roles[r - 2];
    if (e) {
      cs.getCell(r, 1).value = e[0];
      cs.getCell(r, 2).value = e[1];
    }
  }
  dv(cs).add('B2:B61', { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], allowBlank: true, showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Informe um número maior ou igual a zero.' });

  // ---------- Exemplo (somente leitura)
  if (opts.includeExample !== false) {
    const ex = wb.addWorksheet('Exemplo', { views: [{ state: 'frozen', ySplit: 1 }] });
    addActivitySheet(ex, demoProcess().activities, hoursRow, false);
  }

  for (const sheet of wb.worksheets) {
    // Sem senha: proteção contra edição acidental. Permite selecionar e formatar colunas.
    await sheet.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true, autoFilter: true, sort: false });
  }
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return lockStructure(new Uint8Array(buf));
}

function addActivitySheet(ws: import('exceljs').Worksheet, acts: Activity[], hoursRow: number, editable: boolean) {
  const cols = [...FIELDS.map((f) => ({ header: f.label, width: f.width })), ...CALC_HEADERS.map((h) => ({ header: h, width: 16 }))];
  ws.columns = cols.map((c) => ({ width: c.width }));
  cols.forEach((c, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = c.header;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { wrapText: true, vertical: 'middle' };
    const f = FIELDS[i];
    if (f) cell.note = `${f.help}${f.example ? `\nExemplo: ${f.example}` : ''}`;
  });
  ws.getRow(1).height = 32;
  const L = (k: FieldKey) => colLetter(FIELDS.findIndex((f) => f.key === k) + 1);
  const dur = L('duracao');
  const unit = L('unidade_duracao');
  const ppl = L('quantidade_pessoas');
  const cph = L('custo_hora');
  const calc0 = FIELDS.length + 1;
  const hCol = colLetter(calc0);
  const eCol = colLetter(calc0 + 1);
  const rows = editable ? Math.max(INPUT_ROWS, acts.length + 20) : acts.length;
  for (let r = 2; r <= rows + 1; r++) {
    const a = acts[r - 2];
    const vals = a ? activityValues(a) : undefined;
    FIELDS.forEach((f, i) => {
      const cell = ws.getCell(r, i + 1);
      if (vals) cell.value = vals[f.key];
      if (editable) {
        cell.protection = { locked: false };
        cell.fill = INPUT_FILL;
      } else cell.fill = LOCKED_FILL;
    });
    const fh = ws.getCell(r, calc0);
    fh.value = { formula: `IF(${dur}${r}="","",IF(${unit}${r}="minutos",${dur}${r}/60,IF(${unit}${r}="horas",${dur}${r},IF(${unit}${r}="dias",${dur}${r}*Processo!$B$${hoursRow},""))))` };
    const fe = ws.getCell(r, calc0 + 1);
    fe.value = { formula: `IF(OR(${hCol}${r}="",${ppl}${r}=""),"",${hCol}${r}*${ppl}${r})` };
    const fc = ws.getCell(r, calc0 + 2);
    fc.value = { formula: `IF(OR(${eCol}${r}="",${cph}${r}=""),"",${eCol}${r}*${cph}${r})` };
    for (const c of [fh, fe, fc]) {
      c.fill = LOCKED_FILL;
      c.numFmt = '0.00';
      c.protection = { locked: true };
    }
  }
  if (!editable) return;
  const last = rows + 1;
  const rng = (k: FieldKey) => `${L(k)}2:${L(k)}${last}`;
  const list = (k: FieldKey, values: string, msg: string) =>
    dv(ws).add(rng(k), { type: 'list', allowBlank: true, formulae: [`"${values}"`], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Valor não permitido', error: msg });
  list('tipo_elemento', 'início,atividade,decisão,fim', 'Escolha: início, atividade, decisão ou fim.');
  list('unidade_duracao', 'minutos,horas,dias', 'Escolha: minutos, horas ou dias.');
  list('classificacao_lean', 'agrega valor,necessário,desperdício,não classificado', 'Escolha uma classificação da lista.');
  list('retrabalho', 'sim,não', 'Escolha sim ou não.');
  list('atividade_critica', 'sim,não', 'Escolha sim ou não.');
  const num = (k: FieldKey, msg: string, type: 'decimal' | 'whole' = 'decimal', max?: number) =>
    dv(ws).add(rng(k), {
      type,
      operator: max === undefined ? 'greaterThanOrEqual' : 'between',
      formulae: max === undefined ? [0] : [0, max],
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Número inválido',
      error: msg,
    });
  num('duracao', 'Duração: informe um número maior ou igual a zero (ex.: 15 ou 1,5).');
  num('tempo_espera', 'Espera: informe um número maior ou igual a zero.');
  num('duracao_minima', 'Mínimo: informe um número maior ou igual a zero.');
  num('duracao_maxima', 'Máximo: informe um número maior ou igual a zero.');
  num('quantidade_pessoas', 'Pessoas: informe um número inteiro de 0 a 500.', 'whole', 500);
  num('frequencia_pct', 'Frequência: informe um percentual de 0 a 100.', 'decimal', 100);
  num('ordem', 'Ordem: informe um número maior ou igual a zero.');
  num('custo_hora', 'Custo-hora: informe um valor maior ou igual a zero.');
  num('custo_variavel', 'Custo variável: informe um valor maior ou igual a zero.');
  num('volume_periodo', 'Volume: informe um número maior ou igual a zero.');
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: FIELDS.length } };
}

/** Trava a estrutura do arquivo (impede apagar/renomear/mover abas) — sem senha. */
async function lockStructure(xlsx: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(xlsx);
  const path = 'xl/workbook.xml';
  let xml = await zip.file(path)!.async('string');
  if (!xml.includes('<workbookProtection')) {
    const tag = '<workbookProtection lockStructure="1"/>';
    // Ordem do esquema OOXML: workbookPr → workbookProtection → bookViews.
    if (/<workbookPr[^>]*\/>/.test(xml)) xml = xml.replace(/(<workbookPr[^>]*\/>)/, `$1${tag}`);
    else xml = xml.replace(/<bookViews>/, `${tag}<bookViews>`);
    zip.file(path, xml);
  }
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

// ---------- CSV

/** CSV com separador ";" e BOM (abre corretamente no Excel em pt-BR). */
export function processToCsv(p: ProcessModel): string {
  const lines = [FIELDS.map((f) => csvCell(f.label)).join(';')];
  for (const a of [...p.activities].sort((x, y) => x.order - y.order)) {
    const v = activityValues(a);
    lines.push(FIELDS.map((f) => csvCell(v[f.key])).join(';'));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function templateCsv(): string {
  return processToCsv(demoProcess());
}
