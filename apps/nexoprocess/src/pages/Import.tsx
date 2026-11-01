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
import { autoMap, findCostSheet, findProcessSheet, pickActivitySheet, rowsToProcess, type Mapping } from '../io/toProcess';
import { db } from '../storage/db';
import { createWorkspace, downloadTemplateCsv, downloadTemplateXlsx } from '../state/actions';
import { demoBlocked } from '../license/demo';
import { useHardwareBack } from '../state/backNav';
import { BackButton } from '../components/BackButton';

import { useI18n } from '../i18n/I18nProvider';
import { tr } from '../i18n';
const steps = () => [tr('d.imp.step1'), tr('d.imp.step2'), tr('d.imp.step3')];

export default function ImportPage() {
  const { t } = useI18n();
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
  useHardwareBack('importar', step > 0, () => setStep((x) => Math.max(0, x - 1)), String(step));

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
      const procSheet = findProcessSheet(parsed.sheets);
      const nm = procSheet?.rows.find((r) => /nome do processo|process name/i.test(String(r.values[0] ?? '')))?.values[1];
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
    const r = rowsToProcess(sheet, mapping, { defaultUnit: unit, processName: name }, findProcessSheet(file.sheets), findCostSheet(file.sheets));
    if (name.trim()) r.process.name = name.trim();
    return { ...r, validation: validateProcess(r.process) };
  }, [file, sheet, mapping, unit, name, step]);

  const missingMinimal = FIELDS.filter((f) => f.minimal && f.key !== 'ordem' && mapping[f.key] === undefined);
  const blocking = result ? result.issues.filter((i) => i.severity === 'error').length + result.validation.filter((i) => i.severity === 'error').length : 0;

  const create = async (mode: 'new' | 'replace') => {
    if (!result || !file) return;
    if (demoBlocked('salvar')) return;
    try {
      const source = { kind: 'import' as const, fileName: file.fileName, fileHash: file.hash, importedAt: nowIso() };
      if (mode === 'replace' && dup) {
        const w = structuredClone(dup);
        w.snapshots = [...w.snapshots, { id: uid('snap_'), at: nowIso(), label: t('pg.imp.004'), process: w.asIs }].slice(-15);
        w.asIs = result.process;
        w.asIsBaseline = structuredClone(result.process);
        w.source = source;
        w.updatedAt = nowIso();
        w.validationAcceptedAt = undefined;
        w.history.push({ at: nowIso(), area: t('pg.imp.001'), message: t('pg.imp.006', { fileName: file.fileName }) });
        await db.putWorkspace(w);
        nav(`/app/p/${w.id}/validar`);
      } else {
        const w = await createWorkspace(result.process, source);
        nav(`/app/p/${w.id}/validar`);
      }
      toast('ok', t('pg.imp.007'));
    } catch {
      toast('bad', t('pg.imp.008'));
    }
  };

  return (
    <div className="safe-x mx-auto max-w-5xl space-y-5 py-6">
      <div>
        {step === 0 && <BackButton />}
        <p className="text-sm font-semibold text-brand">{t('pg.imp.009')}</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
          {step === 0 ? t('pg.imp.010') : step === 1 ? t('pg.imp.011') : t('pg.imp.012')}
        </h1>
        <ol className="mt-3 flex gap-2" aria-label={t('pg.imp.013')}>
          {steps().map((s, i) => (
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
              <p className="font-semibold">{t('pg.imp.015')}</p>
              <p className="text-sm text-muted">{t('pg.imp.016')}</p>
              <Button onClick={() => inputRef.current?.click()} loading={reading}>
                <FileSpreadsheet className="h-4 w-4" />{t('pg.imp.017')}</Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xlsm,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                aria-label={t('pg.imp.018')}
                data-testid="file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = '';
                }}
              />
              {file && (
                <p className="text-sm text-ink2">{t('pg.imp.019')}<strong>{file.fileName}</strong> —{' '}
                  <button type="button" className="font-semibold text-brand underline" onClick={() => setStep(1)}>{t('pg.imp.020')}</button>
                </p>
              )}
            </div>
            {err && (
              <div className="mt-4">
                <Callout tone="bad" title={err.message}>
                  <p>
                    <strong>{t('pg.imp.021')}</strong> {err.why}
                  </p>
                  <p>
                    <strong>{t('pg.imp.022')}</strong> {err.fix}
                  </p>
                </Callout>
              </div>
            )}
          </Card>
          <Card title={t('pg.imp.023')} subtitle={t('pg.imp.024')}>
            <p className="text-sm text-ink2">{t('pg.imp.025')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void downloadTemplateXlsx()}>{t('pg.imp.026')}</Button>
              <Button variant="secondary" onClick={() => void downloadTemplateCsv()}>{t('pg.imp.027')}</Button>
              <Link to="/app/novo" className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-brand hover:underline">{t('pg.imp.028')}</Link>
            </div>
            <p className="mt-3 text-xs text-muted">{t('pg.imp.029')}</p>
          </Card>
        </>
      )}

      {step === 1 && file && sheet && auto && (
        <>
          {dup && (
            <Callout tone="warn" title={t('pg.imp.030')}>{t('pg.imp.031')}{dup.asIs.name}{t('pg.imp.032')}<div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => nav(`/app/p/${dup.id}`)}>{t('pg.imp.033')}</Button>
              </div>
            </Callout>
          )}
          {file.fileName.toLowerCase().endsWith('.xlsm') && (
            <Callout tone="info" title={t('pg.imp.034')}>{t('pg.imp.035')}</Callout>
          )}
          <Card title={t('pg.imp.036')} subtitle={file.fileName}>
            <div className="grid gap-4 sm:grid-cols-3">
              {file.sheets.length > 1 && (
                <Field label={t('pg.imp.037')}>
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
                          {s.name} ({s.rows.length}{t('pg.imp.038')}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <Field label={t('pg.imp.039')}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label={t('pg.imp.040')} help={t('pg.imp.041')}>
                {(p) => (
                  <Select {...p} value={unit} onChange={(e) => setUnit(e.target.value as DurationUnit)}>
                    <option value="min">{t('pg.imp.042')}</option>
                    <option value="h">{t('pg.imp.043')}</option>
                    <option value="d">{t('pg.imp.044')}</option>
                  </Select>
                )}
              </Field>
            </div>
          </Card>

          <Card title={t('pg.imp.045')} subtitle={t('pg.imp.046', { length: sheet.rows.length, name: sheet.name })}>
            <Table caption={t('pg.imp.047')}>
              <thead>
                <tr>
                  <th className={th}>{t('pg.imp.048')}</th>
                  {sheet.headers.map((h, i) => (
                    <th key={i} className={th}>
                      {h || t('pg.imp.049', { p0: i + 1 })}
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

          <Card title={t('pg.imp.051')} subtitle={t('pg.imp.052')}>
            {missingMinimal.length > 0 && (
              <div className="mb-3">
                <Callout tone="warn" title={t('pg.imp.053')}>{t('pg.imp.054')}{missingMinimal.map((f) => f.label).join(', ')}{t('pg.imp.055')}</Callout>
              </div>
            )}
            {auto.ignored.length > 0 && <p className="mb-3 text-xs text-muted">{t('pg.imp.056')}{auto.ignored.join(', ')}</p>}
            {auto.duplicates.length > 0 && (
              <p className="mb-3 text-xs text-warn">{t('pg.imp.057')}{auto.duplicates.map((d) => `${FIELDS.find((f) => f.key === d.field)!.label} (${d.headers.join(' / ')})`).join('; ')}{t('pg.imp.058')}</p>
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
                        {f.minimal && <Badge tone="brand">{t('pg.imp.059')}</Badge>}
                        {conf === 'provável' && mapping[f.key] === auto.mapping[f.key] && <Badge tone="amber">{t('pg.imp.060')}</Badge>}
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
                        <option value="">{t('pg.imp.061')}</option>
                        {sheet.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || t('pg.imp.062', { p0: i + 1 })}
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
            <SummaryTile label={t('pg.imp.063')} value={result.process.activities.length} />
            <SummaryTile label={t('pg.imp.064')} value={result.process.stageOrder.length} />
            <SummaryTile label={t('pg.imp.065')} value={blocking} tone={blocking ? 'bad' : 'ok'} />
            <SummaryTile label={t('pg.imp.066')} value={result.issues.filter((i) => i.severity === 'warning').length + result.validation.filter((i) => i.severity === 'warning').length} tone="amber" />
          </div>
          {result.flowInferred && (
            <Callout tone="info" title={t('pg.imp.067')}>{t('pg.imp.068')}</Callout>
          )}
          <Card title={t('pg.imp.069')} subtitle={t('pg.imp.070')}>
            {[...result.issues, ...result.validation.filter((v) => !['flow_inferred'].includes(v.code)).map((v) => ({ row: v.row ?? 0, severity: v.severity, message: `${v.message} ${v.fix}`, field: undefined }))].length === 0 ? (
              <Callout tone="ok">{t('pg.imp.071')}</Callout>
            ) : (
              <ul className="space-y-2" data-testid="import-issues">
                {[...result.issues, ...result.validation.filter((v) => v.code !== 'flow_inferred').map((v) => ({ row: v.row ?? 0, severity: v.severity, message: `${v.message} ${v.fix}`, field: undefined }))]
                  .sort((a, b) => (a.severity === b.severity ? a.row - b.row : a.severity === 'error' ? -1 : b.severity === 'error' ? 1 : a.severity === 'warning' ? -1 : 1))
                  .slice(0, 200)
                  .map((i, n) => (
                    <li key={n} className="flex items-start gap-2 text-sm">
                      <Badge tone={i.severity === 'error' ? 'bad' : i.severity === 'warning' ? 'amber' : 'accent'}>{i.severity === 'error' ? t('pg.imp.072') : i.severity === 'warning' ? t('pg.imp.073') : t('pg.imp.074')}</Badge>
                      <span className="text-ink2">
                        {i.row ? <strong className="text-ink">{t('pg.imp.075')}{i.row}: </strong> : null}
                        {i.message}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
          {blocking > 0 && (
            <Callout tone="warn" title={t('pg.imp.076', { blocking })}>{t('pg.imp.077')}<label className="mt-2 flex items-center gap-2 font-medium text-ink">
                <input type="checkbox" className="h-4 w-4" checked={ack} onChange={(e) => setAck(e.target.checked)} />{t('pg.imp.078')}</label>
            </Callout>
          )}
        </>
      )}

      {step > 0 && (
        <div className="safe-bottom sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/15 bg-bg/90 px-4 py-3 backdrop-blur">
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="h-4 w-4" />{t('pg.imp.079')}</Button>
          {step === 1 ? (
            <Button onClick={() => setStep(2)}>{t('pg.imp.080')}<ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dup && (
                <Button variant="secondary" disabled={blocking > 0 && !ack} onClick={() => void create('replace')}>{t('pg.imp.081')}{dup.asIs.name}”
                </Button>
              )}
              <Button disabled={blocking > 0 && !ack} onClick={() => void create('new')}>
                {dup ? t('pg.imp.082') : t('pg.imp.083')}
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
