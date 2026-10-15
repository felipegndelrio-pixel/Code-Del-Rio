import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { loadDataset, runImport, type ImportResult } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { buildTemplate, buildWorkbook, toCsv, toSheetRows, workbookToBuffer, type Dataset } from '../lib/sheets/export';
import {
  MAX_IMPORT_BYTES,
  autoMap,
  buildPayload,
  collectFileCodes,
  detectEntity,
  diffRows,
  readCsv,
  readWorkbook,
  validateSheet,
  type Mapping,
  type ParsedSheet,
  type RowDiff,
  type RowError,
  type ValidRow,
} from '../lib/sheets/import';
import { SHEETS, SHEET_BY_ENTITY, type EntityKey } from '../lib/sheets/schema';
import { Badge, Button, Card, ErrorBox, Spinner, inputCls, useToast } from '../components/ui';

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface SheetState {
  sheet: ParsedSheet;
  entity: EntityKey | '';
  mapping: Mapping;
}

export default function ImportExport() {
  const { session } = useAuth();
  const toast = useToast();
  const base = useAsync(() => loadDataset(supabase, { auditLimit: 0 }), []);
  const [selected, setSelected] = useState<string[]>([]);
  const [withAudit, setWithAudit] = useState(true);
  const [csvEntity, setCsvEntity] = useState<EntityKey>('actions');
  const [busy, setBusy] = useState('');
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const [fileName, setFileName] = useState('');
  const [ignoreBlank, setIgnoreBlank] = useState(true);
  const [server, setServer] = useState<ImportResult | null>(null);
  const [final, setFinal] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const validation = useMemo(() => {
    if (!base.data || !sheets.length) return null;
    const rows = toSheetRows(base.data);
    const knownCodes = Object.fromEntries(SHEETS.map((s) => [s.entity, new Set(rows[s.entity].map((r) => String(r.code)))])) as Record<EntityKey, Set<string>>;
    const fileCodes = collectFileCodes(sheets.map((s) => ({ entity: s.entity || null, sheet: s.sheet, mapping: s.mapping })));
    const ctx = { knownCodes, fileCodes, userEmails: new Set(base.data.profiles.map((p) => p.email)), ignoreBlank };
    const valid: Partial<Record<EntityKey, ValidRow[]>> = {};
    const errors: RowError[] = [];
    const diffs: { entity: EntityKey; sheet: string; diffs: RowDiff[] }[] = [];
    for (const s of sheets) {
      if (!s.entity) continue;
      if (valid[s.entity]) {
        errors.push({ entity: s.entity, sheet: s.sheet.name, row: 1, code: null, message: 'Mais de uma aba mapeada para a mesma entidade' });
        continue;
      }
      const r = validateSheet(s.entity, s.sheet, s.mapping, ctx);
      valid[s.entity] = r.rows;
      errors.push(...r.errors);
      diffs.push({ entity: s.entity, sheet: s.sheet.name, diffs: diffRows(s.entity, r.rows, rows[s.entity]) });
    }
    const total = Object.values(valid).reduce((n, r) => n + (r?.length ?? 0), 0);
    return { valid, errors, diffs, total, payload: buildPayload(valid) };
  }, [base.data, sheets, ignoreBlank]);

  const exportScope = async (): Promise<Dataset> => loadDataset(supabase, { projectIds: selected.length ? selected : undefined, auditLimit: withAudit ? 5000 : 0 });
  const filtersLabel = () =>
    selected.length ? `Projetos: ${base.data!.projects.filter((p) => selected.includes(p.id)).map((p) => p.code).join(', ')}` : 'Todos os projetos visíveis ao usuário';

  const onFile = async (file: File) => {
    setServer(null);
    setFinal(null);
    if (file.size > MAX_IMPORT_BYTES) return toast('error', 'Arquivo excede 10 MB.');
    try {
      const isCsv = /\.csv$/i.test(file.name);
      if (!isCsv && !/\.xlsx$/i.test(file.name)) return toast('error', 'Envie um arquivo .xlsx ou .csv');
      const parsed = isCsv ? [readCsv(await file.text(), file.name.replace(/\.csv$/i, ''))] : await readWorkbook(await file.arrayBuffer());
      setFileName(file.name);
      setSheets(
        parsed.map((sheet) => {
          const entity = detectEntity(sheet) ?? '';
          return { sheet, entity, mapping: entity ? autoMap(sheet.headers, SHEET_BY_ENTITY[entity]) : sheet.headers.map(() => '') };
        }),
      );
    } catch (e) {
      toast('error', `Não foi possível ler o arquivo: ${(e as Error).message}`);
    }
  };

  if (base.loading && !base.data) return <Spinner />;
  if (base.error) return <ErrorBox error={base.error} onRetry={base.reload} />;
  if (!base.data) return null;
  const blockers = validation?.errors.length ?? 0;
  const serverOk = server && !server.errors.length;

  return (
    <div className="space-y-5">
      <h1 className="headline text-2xl font-extrabold">Planilhas — importar e exportar</h1>

      <Card subtitle="Exportação" title="Exportar dados estruturados (XLSX / CSV)">
        <p className="mb-3 text-sm text-slate-400">
          A exportação contém somente registros que você tem permissão para ver. Abas: Resumo, Projetos, Ações, Cronograma, Marcos, Riscos, Problemas, Stakeholders, Decisões,
          Mudanças, Lições, Indicadores, Histórico e Instruções.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <fieldset className="max-h-48 overflow-y-auto rounded-lg border border-navy-700 p-2">
            <legend className="px-1 text-xs text-slate-400">Projetos (nenhum marcado = todos)</legend>
            {base.data.projects.map((p) => (
              <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-teal-400"
                  checked={selected.includes(p.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                />
                <span className="font-mono text-xs text-teal-200">{p.code}</span> {p.name}
              </label>
            ))}
          </fieldset>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-teal-400" checked={withAudit} onChange={(e) => setWithAudit(e.target.checked)} /> Incluir histórico (até 5.000
              alterações mais recentes)
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                loading={busy === 'xlsx'}
                onClick={async () => {
                  setBusy('xlsx');
                  try {
                    const d = await exportScope();
                    const wb = buildWorkbook(d, { generatedBy: session?.user.email ?? '', filters: filtersLabel() });
                    download(await workbookToBuffer(wb), `projetos-${stamp()}.xlsx`, XLSX);
                  } catch (e) {
                    toast('error', (e as Error).message);
                  } finally {
                    setBusy('');
                  }
                }}
              >
                <Download className="h-4 w-4" /> Exportar XLSX
              </Button>
              <Button variant="secondary" onClick={async () => download(await workbookToBuffer(buildTemplate()), 'template-importacao.xlsx', XLSX)}>
                <FileSpreadsheet className="h-4 w-4" /> Template oficial
              </Button>
            </div>
            <div className="flex gap-2">
              <select className={inputCls} value={csvEntity} onChange={(e) => setCsvEntity(e.target.value as EntityKey)} aria-label="Entidade do CSV">
                {SHEETS.map((s) => (
                  <option key={s.entity} value={s.entity}>
                    {s.sheet}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                loading={busy === 'csv'}
                onClick={async () => {
                  setBusy('csv');
                  try {
                    const d = await exportScope();
                    download(toCsv(csvEntity, toSheetRows(d)[csvEntity]), `${SHEET_BY_ENTITY[csvEntity].sheet.toLowerCase()}-${stamp()}.csv`, 'text/csv;charset=utf-8');
                  } catch (e) {
                    toast('error', (e as Error).message);
                  } finally {
                    setBusy('');
                  }
                }}
              >
                Exportar CSV
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card subtitle="Importação" title="Importar planilha em 4 etapas">
        <ol className="mb-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-4">
          {['1. Enviar arquivo', '2. Conferir abas e colunas', '3. Validar (local + simulação no servidor)', '4. Confirmar gravação'].map((s, i) => (
            <li key={s} className={`rounded-lg border px-3 py-2 ${i === 0 || (i === 1 && sheets.length) || (i === 2 && validation) || (i === 3 && serverOk) ? 'border-teal-brand/50 text-teal-100' : 'border-navy-700'}`}>
              {s}
            </li>
          ))}
        </ol>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          aria-label="Arquivo para importar"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onFile(f);
          }}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Selecionar .xlsx ou .csv
        </Button>
        {fileName && <span className="ml-3 text-sm text-slate-300">{fileName}</span>}

        {sheets.length > 0 && (
          <div className="mt-4 space-y-3">
            {sheets.map((s, si) => (
              <details key={s.sheet.name + si} className="rounded-xl border border-navy-700 bg-navy-900/60 p-3" open={!!s.entity}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <b className="text-white">{s.sheet.name}</b>
                  <span className="text-slate-400">{s.sheet.rows.length} linha(s)</span>
                  <select
                    className={inputCls + ' ml-auto w-48'}
                    value={s.entity}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const entity = e.target.value as EntityKey | '';
                      setServer(null);
                      setSheets((xs) => xs.map((x, i) => (i === si ? { ...x, entity, mapping: entity ? autoMap(x.sheet.headers, SHEET_BY_ENTITY[entity]) : x.mapping } : x)));
                    }}
                    aria-label={`Entidade da aba ${s.sheet.name}`}
                  >
                    <option value="">Ignorar aba</option>
                    {SHEETS.map((d) => (
                      <option key={d.entity} value={d.entity}>
                        {d.sheet}
                      </option>
                    ))}
                  </select>
                </summary>
                {s.entity && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {s.sheet.headers.map((h, hi) => (
                      <label key={hi} className="flex items-center gap-2 text-xs">
                        <span className="w-32 truncate text-slate-300" title={h}>
                          {h || `(coluna ${hi + 1})`}
                        </span>
                        <select
                          className={inputCls + ' !min-h-[32px] py-1 text-xs'}
                          value={s.mapping[hi] ?? ''}
                          onChange={(e) => {
                            setServer(null);
                            setSheets((xs) => xs.map((x, i) => (i === si ? { ...x, mapping: x.mapping.map((m, j) => (j === hi ? e.target.value : m)) } : x)));
                          }}
                        >
                          <option value="">— ignorar —</option>
                          {SHEET_BY_ENTITY[s.entity as EntityKey].columns
                            .filter((c) => !c.exportOnly)
                            .map((c) => (
                              <option key={c.field} value={c.field}>
                                {c.header}
                              </option>
                            ))}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
              </details>
            ))}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-teal-400" checked={ignoreBlank} onChange={(e) => { setIgnoreBlank(e.target.checked); setServer(null); }} />
              Células vazias NÃO apagam valores existentes (recomendado)
            </label>

            {validation && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge tone="teal">{validation.total} linha(s) válidas</Badge>
                  <Badge tone={blockers ? 'red' : 'green'}>{blockers} erro(s)</Badge>
                  {validation.diffs.map((d) => (
                    <Badge key={d.entity} tone="cyan">
                      {SHEET_BY_ENTITY[d.entity].sheet}: {d.diffs.filter((x) => x.kind === 'novo').length} novo(s), {d.diffs.filter((x) => x.kind === 'alterado').length} alterado(s),{' '}
                      {d.diffs.filter((x) => x.kind === 'sem_alteracao').length} sem alteração
                    </Badge>
                  ))}
                </div>
                {blockers > 0 && (
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-red-500/40 bg-red-950/30">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-red-950 text-red-200">
                        <tr>
                          <th className="px-2 py-1">Aba</th>
                          <th className="px-2 py-1">Linha</th>
                          <th className="px-2 py-1">Código</th>
                          <th className="px-2 py-1">Erro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validation.errors.map((e, i) => (
                          <tr key={i} className="border-t border-red-900/60">
                            <td className="px-2 py-1">{e.sheet}</td>
                            <td className="px-2 py-1">{e.row}</td>
                            <td className="px-2 py-1 font-mono">{e.code ?? ''}</td>
                            <td className="px-2 py-1 text-red-100">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <details className="rounded-lg border border-navy-700 p-2 text-xs">
                  <summary className="cursor-pointer text-slate-300">Pré-visualizar alterações em registros existentes</summary>
                  <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                    {validation.diffs.flatMap((d) =>
                      d.diffs
                        .filter((x) => x.kind === 'alterado')
                        .map((x) => (
                          <li key={d.entity + x.rowNumber}>
                            <span className="font-mono text-teal-200">{x.code}</span> (linha {x.rowNumber}):{' '}
                            {x.changes.map((c) => `${c.header}: "${c.from ?? ''}" → "${c.to ?? ''}"`).join('; ')}
                          </li>
                        )),
                    )}
                  </ul>
                </details>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={blockers > 0 || !validation.total}
                    loading={busy === 'dry'}
                    onClick={async () => {
                      setBusy('dry');
                      try {
                        setServer(await runImport(supabase, validation.payload, true));
                      } catch (e) {
                        toast('error', (e as Error).message);
                      } finally {
                        setBusy('');
                      }
                    }}
                  >
                    Simular no servidor
                  </Button>
                  <Button
                    disabled={!serverOk || blockers > 0}
                    loading={busy === 'commit'}
                    onClick={async () => {
                      setBusy('commit');
                      try {
                        const r = await runImport(supabase, validation.payload, false);
                        setFinal(r);
                        setServer(null);
                        if (r.committed) {
                          toast('ok', 'Importação concluída');
                          setSheets([]);
                          setFileName('');
                          base.reload();
                        } else toast('error', 'Importação rejeitada; nada foi gravado.');
                      } catch (e) {
                        toast('error', (e as Error).message);
                      } finally {
                        setBusy('');
                      }
                    }}
                  >
                    Confirmar importação
                  </Button>
                </div>
                {server && <ServerReport r={server} />}
              </div>
            )}
          </div>
        )}
        {final && <ServerReport r={final} />}
      </Card>
    </div>
  );
}

function ServerReport({ r }: { r: ImportResult }) {
  const label = (e: string) => SHEETS.find((s) => s.entity === e)?.sheet ?? e;
  return (
    <div className={`mt-3 rounded-xl border p-3 text-sm ${r.errors.length ? 'border-red-500/50 bg-red-950/30' : 'border-teal-brand/40 bg-navy-900'}`} role="status">
      <p className="mb-2 flex items-center gap-2 font-semibold text-white">
        {r.committed ? <CheckCircle2 className="h-4 w-4 text-teal-300" /> : null}
        {r.committed ? 'Relatório final — gravado com sucesso' : r.dry_run && !r.errors.length ? 'Simulação aprovada — nada foi gravado ainda' : 'Rejeitado — nada foi gravado'}
      </p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {Object.entries(r.summary).map(([e, s]) => (
          <li key={e}>
            {label(e)}: {s.inserted} inserido(s), {s.updated} atualizado(s), {s.unchanged} sem alteração
          </li>
        ))}
      </ul>
      {r.errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-red-200">
          {r.errors.map((e, i) => (
            <li key={i}>
              {label(e.entity)} · linha {e.row ?? '?'} {e.code ? `(${e.code})` : ''}: {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
