// Importação XLSX/CSV em 3 passos: arquivo → colunas → validação.
// O arquivo é lido no navegador; voltar não descarta o arquivo escolhido.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { Badge, Button, Callout, Card, Field, Input, Select, Table, td, th, useToast } from '../components/ui';
import type { DurationUnit, Workspace } from '../domain/types';
import { nowIso, uid } from '../domain/units';
import { validateProcess } from '../domain/validation';
import { FIELDS, type FieldKey } from '../io/fields';
import { ImportError, readImportFile, type ParsedFile } from '../io/parse';
import { autoMap, findSheet, pickActivitySheet, rowsToProcess, type Mapping } from '../io/toProcess';
import { db } from '../storage/db';
import { createWorkspace, downloadTemplateCsv, downloadTemplateXlsx } from '../state/actions';

const STEPS = ['Arquivo', 'Colunas', 'Validação'];

export default function ImportPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [err, setErr] = useState<ImportError | null>(null);
  const [reading, setReading] = useState(false);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [unit, setUnit] = useState<DurationUnit>('min');
  const [name, setName] = useState('');
  const [ack, setAck] = useState(false);
  const [dup, setDup] = useState<Workspace | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), [step]);

  const sheet = file?.sheets[sheetIdx];
  const auto = useMemo(() => (sheet ? autoMap(sheet.headers) : null), [sheet]);

  const onFile = async (f: File) => {
    setErr(null);
    setReading(true);
    try {
      const parsed = await readImportFile(f);
      setFile(parsed);
      const idx = pickActivitySheet(parsed.sheets);
      setSheetIdx(idx);
      setMapping(autoMap(parsed.sheets[idx].headers).mapping);
      const procSheet = findSheet(parsed.sheets, 'Processo');
      const nm = procSheet?.rows.find((r) => /nome do processo/i.test(String(r.values[0] ?? '')))?.values[1];
      setName(nm ? String(nm) : f.name.replace(/\.(xlsx|xlsm|csv|txt)$/i, ''));
      const existing = (await db.listWorkspaces()).find((w) => w.source.fileHash === parsed.hash);
      setDup(existing ?? null);
      setAck(false);
      setStep(1);
    } catch (e) {
      setErr(e instanceof ImportError ? e : new ImportError('Não foi possível ler o arquivo.', String((e as Error)?.message ?? e), 'Tente salvar a planilha novamente ou use o modelo oficial.'));
    } finally {
      setReading(false);
    }
  };

  const result = useMemo(() => {
    if (!file || !sheet || step < 2) return null;
    const r = rowsToProcess(sheet, mapping, { defaultUnit: unit, processName: name }, findSheet(file.sheets, 'Processo'), findSheet(file.sheets, 'Custos por função'));
    if (name.trim()) r.process.name = name.trim();
    return { ...r, validation: validateProcess(r.process) };
  }, [file, sheet, mapping, unit, name, step]);

  const missingMinimal = FIELDS.filter((f) => f.minimal && f.key !== 'ordem' && mapping[f.key] === undefined);
  const blocking = result ? result.issues.filter((i) => i.severity === 'error').length + result.validation.filter((i) => i.severity === 'error').length : 0;

  const create = async (mode: 'new' | 'replace') => {
    if (!result || !file) return;
    try {
      const source = { kind: 'import' as const, fileName: file.fileName, fileHash: file.hash, importedAt: nowIso() };
      if (mode === 'replace' && dup) {
        const w = structuredClone(dup);
        w.snapshots = [...w.snapshots, { id: uid('snap_'), at: nowIso(), label: 'Antes de reimportar', process: w.asIs }].slice(-15);
        w.asIs = result.process;
        w.asIsBaseline = structuredClone(result.process);
        w.source = source;
        w.updatedAt = nowIso();
        w.validationAcceptedAt = undefined;
        w.history.push({ at: nowIso(), area: 'Processo', message: `AS-IS substituído pela reimportação de ${file.fileName} (versão anterior guardada nas cópias)` });
        await db.putWorkspace(w);
        nav(`/app/p/${w.id}/validar`);
      } else {
        const w = await createWorkspace(result.process, source);
        nav(`/app/p/${w.id}/validar`);
      }
      toast('ok', 'Processo importado. Confira a validação e o mapa.');
    } catch {
      toast('bad', 'Não foi possível salvar neste navegador.');
    }
  };

  return (
    <div className="safe-x mx-auto max-w-5xl space-y-5 py-6">
      <div>
        <p className="text-sm font-semibold text-brand">Importar planilha</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
          {step === 0 ? 'Escolha o arquivo' : step === 1 ? 'Confirme as colunas' : 'Validação dos dados'}
        </h1>
        <ol className="mt-3 flex gap-2" aria-label="Passos da importação">
          {STEPS.map((s, i) => (
            <li key={s} className={clsx('flex-1 rounded-full py-1 text-center text-xs font-semibold', i === step ? 'bg-brand text-brandInk' : i < step ? 'bg-brand/20 text-brand' : 'bg-surface2 text-muted')} aria-current={i === step ? 'step' : undefined}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <>
          <Card>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void onFile(f);
              }}
              className={clsx('flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition', drag ? 'border-brand bg-brand/5' : 'border-line/25')}
            >
              <UploadCloud className="h-10 w-10 text-brand" aria-hidden />
              <p className="font-semibold">Arraste a planilha aqui ou escolha no aparelho</p>
              <p className="text-sm text-muted">XLSX ou CSV, até 10 MB. A leitura acontece no seu navegador — nada é enviado.</p>
              <Button onClick={() => inputRef.current?.click()} loading={reading}>
                <FileSpreadsheet className="h-4 w-4" /> Escolher arquivo
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xlsm,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                aria-label="Arquivo da planilha"
                data-testid="file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = '';
                }}
              />
              {file && (
                <p className="text-sm text-ink2">
                  Arquivo atual: <strong>{file.fileName}</strong> —{' '}
                  <button type="button" className="font-semibold text-brand underline" onClick={() => setStep(1)}>
                    continuar com ele
                  </button>
                </p>
              )}
            </div>
            {err && (
              <div className="mt-4">
                <Callout tone="bad" title={err.message}>
                  <p>
                    <strong>Por quê:</strong> {err.why}
                  </p>
                  <p>
                    <strong>Como resolver:</strong> {err.fix}
                  </p>
                </Callout>
              </div>
            )}
          </Card>
          <Card title="Não tem planilha pronta?" subtitle="Modelo oficial">
            <p className="text-sm text-ink2">O modelo XLSX já vem com listas suspensas, explicações e campos calculados protegidos. Campos coloridos: preencher. Campos cinza: calculados ou protegidos.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void downloadTemplateXlsx()}>
                Baixar modelo XLSX
              </Button>
              <Button variant="secondary" onClick={() => void downloadTemplateCsv()}>
                Baixar exemplo CSV
              </Button>
              <Link to="/app/novo" className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-brand hover:underline">
                Prefiro responder perguntas
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted">Mínimo: Etapa macro, Atividade, Ordem, Duração e Unidade. O resto é opcional.</p>
          </Card>
        </>
      )}

      {step === 1 && file && sheet && auto && (
        <>
          {dup && (
            <Callout tone="warn" title="Este arquivo já foi importado">
              O conteúdo é idêntico ao do processo “{dup.asIs.name}”. Para não duplicar dados, você pode abri-lo, substituir o AS-IS dele (a versão atual fica guardada) ou criar uma nova cópia conscientemente no último passo.
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => nav(`/app/p/${dup.id}`)}>
                  Abrir o existente
                </Button>
              </div>
            </Callout>
          )}
          <Card title="De onde vêm os dados?" subtitle={file.fileName}>
            <div className="grid gap-4 sm:grid-cols-3">
              {file.sheets.length > 1 && (
                <Field label="Aba com as atividades">
                  {(p) => (
                    <Select
                      {...p}
                      value={sheetIdx}
                      onChange={(e) => {
                        const i = Number(e.target.value);
                        setSheetIdx(i);
                        setMapping(autoMap(file.sheets[i].headers).mapping);
                      }}
                    >
                      {file.sheets.map((s, i) => (
                        <option key={s.name} value={i}>
                          {s.name} ({s.rows.length} linhas)
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <Field label="Nome do processo">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label="Unidade quando a célula estiver vazia" help="Escolha consciente; cada uso é avisado na validação.">
                {(p) => (
                  <Select {...p} value={unit} onChange={(e) => setUnit(e.target.value as DurationUnit)}>
                    <option value="min">minutos</option>
                    <option value="h">horas</option>
                    <option value="d">dias</option>
                  </Select>
                )}
              </Field>
            </div>
          </Card>

          <Card title="Prévia" subtitle={`${sheet.rows.length} linhas na aba “${sheet.name}”`}>
            <Table caption="Primeiras linhas da planilha">
              <thead>
                <tr>
                  <th className={th}>Linha</th>
                  {sheet.headers.map((h, i) => (
                    <th key={i} className={th}>
                      {h || `(coluna ${i + 1})`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.slice(0, 5).map((r) => (
                  <tr key={r.rowNumber}>
                    <td className={td}>{r.rowNumber}</td>
                    {sheet.headers.map((_, i) => (
                      <td key={i} className={clsx(td, 'max-w-[180px] truncate')}>
                        {r.values[i] instanceof Date ? (r.values[i] as Date).toLocaleDateString('pt-BR') : String(r.values[i] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="Mapeamento de colunas" subtitle="Confira e ajuste">
            {missingMinimal.length > 0 && (
              <div className="mb-3">
                <Callout tone="warn" title="Faltam colunas do conjunto mínimo">
                  Não encontramos: {missingMinimal.map((f) => f.label).join(', ')}. Escolha a coluna correspondente abaixo; se a planilha não tiver, a análise fica limitada (avisaremos o que falta).
                </Callout>
              </div>
            )}
            {auto.ignored.length > 0 && <p className="mb-3 text-xs text-muted">Colunas não reconhecidas (ignoradas, a menos que você as escolha): {auto.ignored.join(', ')}</p>}
            {auto.duplicates.length > 0 && (
              <p className="mb-3 text-xs text-warn">
                Colunas parecidas para o mesmo campo: {auto.duplicates.map((d) => `${FIELDS.find((f) => f.key === d.field)!.label} (${d.headers.join(' / ')})`).join('; ')}. Confira qual usar.
              </p>
            )}
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((f) => {
                const conf = mapping[f.key] !== undefined ? auto.confidence[f.key as FieldKey] : undefined;
                return (
                  <Field
                    key={f.key}
                    label={
                      <span className="flex items-center gap-2">
                        {f.label}
                        {f.minimal && <Badge tone="brand">mínimo</Badge>}
                        {conf === 'provável' && mapping[f.key] === auto.mapping[f.key] && <Badge tone="amber">confira</Badge>}
                      </span>
                    }
                    help={f.help}
                  >
                    {(p) => (
                      <Select
                        {...p}
                        value={mapping[f.key] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMapping((m) => {
                            const n = { ...m };
                            if (v === '') delete n[f.key];
                            else n[f.key] = Number(v);
                            return n;
                          });
                        }}
                      >
                        <option value="">— não usar —</option>
                        {sheet.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `(coluna ${i + 1})`}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {step === 2 && result && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryTile label="Elementos lidos" value={result.process.activities.length} />
            <SummaryTile label="Etapas" value={result.process.stageOrder.length} />
            <SummaryTile label="Erros" value={blocking} tone={blocking ? 'bad' : 'ok'} />
            <SummaryTile label="Alertas" value={result.issues.filter((i) => i.severity === 'warning').length + result.validation.filter((i) => i.severity === 'warning').length} tone="amber" />
          </div>
          {result.flowInferred && (
            <Callout tone="info" title="Fluxo montado pela ordem das linhas">
              A planilha não tem coluna de próxima atividade, então ligamos as atividades em sequência. Revise o mapa; decisões e caminhos alternativos podem ser ajustados depois.
            </Callout>
          )}
          <Card title="O que encontramos" subtitle="Por linha da planilha">
            {[...result.issues, ...result.validation.filter((v) => !['flow_inferred'].includes(v.code)).map((v) => ({ row: v.row ?? 0, severity: v.severity, message: `${v.message} ${v.fix}`, field: undefined }))].length === 0 ? (
              <Callout tone="ok">Nenhum problema encontrado.</Callout>
            ) : (
              <ul className="space-y-2" data-testid="import-issues">
                {[...result.issues, ...result.validation.filter((v) => v.code !== 'flow_inferred').map((v) => ({ row: v.row ?? 0, severity: v.severity, message: `${v.message} ${v.fix}`, field: undefined }))]
                  .sort((a, b) => (a.severity === b.severity ? a.row - b.row : a.severity === 'error' ? -1 : b.severity === 'error' ? 1 : a.severity === 'warning' ? -1 : 1))
                  .slice(0, 200)
                  .map((i, n) => (
                    <li key={n} className="flex items-start gap-2 text-sm">
                      <Badge tone={i.severity === 'error' ? 'bad' : i.severity === 'warning' ? 'amber' : 'accent'}>{i.severity === 'error' ? 'Erro' : i.severity === 'warning' ? 'Alerta' : 'Info'}</Badge>
                      <span className="text-ink2">
                        {i.row ? <strong className="text-ink">Linha {i.row}: </strong> : null}
                        {i.message}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
          {blocking > 0 && (
            <Callout tone="warn" title={`${blocking} erro(s) encontrados`}>
              Valores inválidos ficarão em branco e precisarão ser corrigidos no app (aba Dados) antes da análise completa. Você também pode corrigir na planilha e importar de novo — o arquivo atual continua selecionado.
              <label className="mt-2 flex items-center gap-2 font-medium text-ink">
                <input type="checkbox" className="h-4 w-4" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                Entendi; quero importar e corrigir no app.
              </label>
            </Callout>
          )}
        </>
      )}

      {step > 0 && (
        <div className="safe-bottom sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/15 bg-bg/90 px-4 py-3 backdrop-blur">
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          {step === 1 ? (
            <Button onClick={() => setStep(2)}>
              Validar dados <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dup && (
                <Button variant="secondary" disabled={blocking > 0 && !ack} onClick={() => void create('replace')}>
                  Substituir AS-IS de “{dup.asIs.name}”
                </Button>
              )}
              <Button disabled={blocking > 0 && !ack} onClick={() => void create('new')}>
                {dup ? 'Criar nova cópia' : 'Criar processo'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: 'bad' | 'ok' | 'amber' }) {
  return (
    <div className="rounded-xl border border-line/15 bg-surface p-3 shadow-card">
      <p className="text-xs text-ink2">{label}</p>
      <p className={clsx('text-2xl font-bold', tone === 'bad' && value ? 'text-bad' : tone === 'amber' && value ? 'text-amber' : tone === 'ok' ? 'text-ok' : 'text-ink')}>{value}</p>
    </div>
  );
}
