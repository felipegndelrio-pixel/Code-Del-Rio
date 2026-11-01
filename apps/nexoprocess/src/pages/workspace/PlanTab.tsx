import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarDays, FileDown, FileSpreadsheet, FileUp, ListPlus, Pencil, Plus, Sparkles, Trash2, UserRound } from 'lucide-react';
import { Badge, Button, Callout, Card, Drawer, Field, Input, Modal, Segmented, Select, Table, td, Textarea, th, useConfirm, useToast } from '../../components/ui';
import { Tour, type TourStep } from '../../components/Tour';
import type { ActionItem, ActionStatus, Priority } from '../../domain/types';
import { actionFromRecommendation, completionIssue, planCandidates, relatedProblemOf, STARTER_PLAN_SIZE } from '../../domain/plan';
import type { Recommendation } from '../../domain/recommendations';
import { fmtDate, nowIso, uid } from '../../domain/units';
import { actionsToCsv, readPlanFile, type PlanImport } from '../../io/planCsv';
import { ImportError } from '../../io/parse';
import { demoBlocked } from '../../license/demo';
import { download, slug } from '../../state/actions';
import { printAs, restoreTitle } from '../../state/print';
import { useWorkspace } from '../../state/workspace';
import { localDraft } from '../../storage/localDraft';

import { useI18n } from '../../i18n/I18nProvider';
import { lazyLabels, tr } from '../../i18n';
export const ACTION_STATUS: Record<ActionStatus, string> = lazyLabels({
  a_fazer: 'd.astatus.a_fazer',
  em_andamento: 'd.astatus.em_andamento',
  bloqueada: 'd.astatus.bloqueada',
  concluida: 'd.astatus.concluida',
  cancelada: 'd.astatus.cancelada',
});
const PRIO: Record<Priority, string> = lazyLabels({
  alta: 'd.prio.alta',
  media: 'd.prio.media',
  baixa: 'd.prio.baixa',
});

const tourSteps = (): TourStep[] => [
  { target: '[data-tour="acao"]', title: tr('d.plan.tour1.title'), body: tr('d.plan.tour1.body') },
  { target: '[data-tour="exportar"]', title: tr('d.plan.tour2.title'), body: tr('d.plan.tour2.body') },
  { target: '[data-tour="importar"]', title: tr('d.plan.tour3.title'), body: tr('d.plan.tour3.body') },
];

const blank = (): ActionItem => ({ id: uid('act_'), description: '', priority: 'media', status: 'a_fazer', origin: { kind: 'manual' }, createdAt: nowIso() });

export default function PlanTab() {
  const { t } = useI18n();
  const { w, update, recs } = useWorkspace();
  const candidates = planCandidates(recs, w);
  const toast = useToast();
  const confirm = useConfirm();
  // Ação em edição sobrevive a um recarregamento (rascunho local por projeto).
  const draftKey = `plano.${w.id}`;
  const [edit, setEdit] = useState<ActionItem | null>(() => localDraft.read<ActionItem>(draftKey) ?? null);
  const recovered = useRef(!!edit);
  useEffect(() => {
    if (recovered.current) toast('info', t('ws.plan.001'));
    recovered.current = false;
  }, [toast, t]);
  useEffect(() => restoreTitle, []);
  useEffect(() => {
    if (edit) localDraft.write(draftKey, edit);
    else localDraft.remove(draftKey);
  }, [edit, draftKey]);
  const [imp, setImp] = useState<PlanImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<'todas' | 'abertas' | 'concluida'>('todas');
  const today = new Date().toISOString().slice(0, 10);
  const overdue = (a: ActionItem) => !!a.due && a.due < today && a.status !== 'concluida' && a.status !== 'cancelada';

  const save = () => {
    if (!edit?.description.trim()) {
      toast('bad', t('ws.plan.002'));
      return;
    }
    const issue = completionIssue(edit);
    if (issue) {
      toast('bad', issue);
      return;
    }
    const exists = w.actions.some((a) => a.id === edit.id);
    update(
      (d) => {
        const i = d.actions.findIndex((a) => a.id === edit.id);
        if (i >= 0) d.actions[i] = edit;
        else d.actions.push(edit);
      },
      { area: t('ws.plan.003'), message: t('ws.plan.004', { p0: exists ? t('ws.plan.005') : t('ws.plan.006'), description: edit.description }) },
    );
    setEdit(null);
  };

  const setStatus = (a: ActionItem, status: ActionStatus) => {
    if (status === 'concluida' && !a.observedResult?.trim()) {
      // Conclusão exige registro: abre o formulário em vez de marcar direto.
      setEdit({ ...structuredClone(a), status, completedAt: a.completedAt ?? today });
      toast('info', t('ws.plan.007'));
      return;
    }
    update(
      (d) => {
        const x = d.actions.find((y) => y.id === a.id)!;
        x.status = status;
        if (status === 'concluida') x.completedAt = x.completedAt ?? today;
        else x.completedAt = undefined;
      },
      { area: t('ws.plan.003'), message: `${a.description}: ${ACTION_STATUS[status]}` },
    );
  };

  const fromChanges = () => {
    const sc = w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0];
    if (!sc) return;
    const fresh = sc.changes.filter((c) => !w.actions.some((a) => a.origin?.ref === c.id) && c.kind !== 'restore');
    if (!fresh.length) {
      toast('info', t('ws.plan.009'));
      return;
    }
    update(
      (d) => {
        for (const c of fresh)
          d.actions.push({
            id: uid('act_'),
            description: t('ws.plan.010', { summary: c.summary }),
            priority: 'media',
            status: 'a_fazer',
            successIndicator: c.hypothesis ? t('ws.plan.011', { hypothesis: c.hypothesis }) : undefined,
            origin: { kind: 'change', ref: c.id },
            createdAt: nowIso(),
          });
      },
      { area: t('ws.plan.003'), message: t('ws.plan.013', { length: fresh.length, name: sc.name }) },
    );
    toast('ok', t('ws.plan.014', { length: fresh.length, p1: fresh.length === 1 ? t('ws.plan.015') : t('ws.plan.016') }));
  };

  const exportPdf = () => {
    if (demoBlocked('exportar')) return;
    printAs(t('ws.plan.017', { name: w.asIs.name }));
  };
  const exportCsv = async () => {
    if (demoBlocked('exportar')) return;
    try {
      await download(`${slug(w.asIs.name)}-${tr('st.file.plan')}.csv`, actionsToCsv(w), 'text/csv;charset=utf-8');
      toast('ok', t('ws.plan.018'));
    } catch (e) {
      toast('bad', t('ws.plan.019', { p0: e instanceof Error ? e.message : String(e) }));
    }
  };
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setImp(await readPlanFile(f));
    } catch (e) {
      toast('bad', e instanceof ImportError ? `${e.message} ${e.fix}` : t('ws.plan.020'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const confirmImport = () => {
    if (!imp) return;
    const n = imp.actions.length;
    update((d) => void d.actions.push(...imp.actions), { area: t('ws.plan.003'), message: t('ws.plan.022', { n }) });
    setImp(null);
    toast('ok', t('ws.plan.023', { n, p1: n === 1 ? t('ws.plan.024') : t('ws.plan.025') }));
  };

  // Plano vazio: as oportunidades de maior pontuação viram ações num clique (decisão da pessoa).
  const [justBuilt, setJustBuilt] = useState(false);
  const buildFromRecs = () => {
    const pick = candidates.slice(0, STARTER_PLAN_SIZE);
    if (!pick.length) return;
    setJustBuilt(true);
    update(
      (d) => {
        for (const r of pick) {
          d.actions.push(actionFromRecommendation(r, d.recDecisions[r.id]?.editedAction));
          if (!d.recDecisions[r.id]) d.recDecisions[r.id] = { status: 'accepted', decidedAt: nowIso() };
        }
      },
      { area: t('ws.plan.003'), message: t('ws.plan.027', { length: pick.length }) },
    );
    toast('ok', t('ws.plan.028', { length: pick.length, p1: pick.length === 1 ? t('ws.plan.015') : t('ws.plan.016') }));
  };

  const list = w.actions.filter((a) => (filter === 'todas' ? true : filter === 'concluida' ? a.status === 'concluida' : a.status !== 'concluida' && a.status !== 'cancelada'));
  const changeCount = (w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0])?.changes.length ?? 0;

  return (
    <div className="space-y-4">
      <Card
        className="print:hidden"
        title={t('ws.plan.003')}
        subtitle={t('ws.plan.032')}
        action={
          <div className="no-print flex flex-wrap gap-2">
            {changeCount > 0 && (
              <Button size="sm" variant="secondary" onClick={fromChanges} data-tour="gerar">
                <ListPlus className="h-4 w-4" />{t('ws.plan.033')}</Button>
            )}
            <Button size="sm" onClick={() => setEdit(blank())} data-tour="nova">
              <Plus className="h-4 w-4" />{t('ws.plan.034')}</Button>
          </div>
        }
      >
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden data-testid="plan-import-input" onChange={(e) => void pickFile(e.target.files?.[0])} />
        {w.actions.length > 0 && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-2 border-b border-line/10 pb-3">
          <span className="flex flex-wrap gap-2" data-tour="exportar">
            <Button size="sm" variant="secondary" onClick={exportPdf} disabled={!w.actions.length}>
              <FileDown className="h-4 w-4" aria-hidden />{t('ws.plan.035')}</Button>
            <Button size="sm" variant="secondary" onClick={() => void exportCsv()} disabled={!w.actions.length}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden />{t('ws.plan.036')}</Button>
          </span>
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} data-tour="importar">
            <FileUp className="h-4 w-4" aria-hidden />{t('ws.plan.037')}</Button>
        </div>
        )}
        <div className="print:hidden">
        {w.actions.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Segmented label={t('ws.plan.038')} value={filter} onChange={setFilter} options={[{ value: 'todas', label: t('ws.plan.039', { length: w.actions.length }) }, { value: 'abertas', label: t('ws.plan.040') }, { value: 'concluida', label: t('ws.plan.041') }]} />
          <span className="text-xs text-muted">{t('ws.plan.042')}</span>
        </div>
        )}
        {!w.actions.length ? (
          <StarterPlan
            candidates={candidates}
            onBuild={buildFromRecs}
            onNew={() => setEdit(blank())}
            onImport={() => fileRef.current?.click()}
          />
        ) : (
          <>
            {/* Tabela só a partir de 1280 px; abaixo disso, cartões (sem colunas espremidas). */}
            <div className="hidden xl:block">
              <Table caption={t('ws.plan.043')} minWidth={960}>
                <thead>
                  <tr>
                    {[
                      [t('ws.plan.044'), 'min-w-[15rem]'],
                      [t('ws.plan.045'), 'min-w-[8rem]'],
                      [t('ws.plan.046'), ''],
                      [t('ws.plan.047'), ''],
                      [t('ws.plan.048'), 'min-w-[10rem]'],
                      [t('ws.plan.049'), 'min-w-[12rem]'],
                      ['', ''],
                    ].map(([h, w]) => (
                      <th key={h} className={clsx(th, 'whitespace-nowrap', w)}>
                        {h ? h : <span className="sr-only">{t('ws.plan.050')}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((a, i) => (
                    <tr key={a.id} className={clsx(overdue(a) && 'bg-bad/5')} data-tour={i === 0 ? 'acao' : undefined}>
                      <td className={clsx(td, 'text-ink')}>
                        {a.description}
                        {relatedProblemOf(a, w) && <span className="block text-xs text-ink2">{t('ws.plan.051')}{relatedProblemOf(a, w)}</span>}
                        {a.origin?.kind !== 'manual' && <span className="block text-xs text-muted">{t('ws.plan.052')}{a.origin?.kind === 'recommendation' ? t('ws.plan.053') : t('ws.plan.054')}</span>}
                        {a.status === 'concluida' && a.observedResult && (
                          <span className="block text-xs text-ok">{t('ws.plan.055')}{a.completedAt ? ` (${fmtDate(a.completedAt)})` : ''}: {a.observedResult}
                          </span>
                        )}
                      </td>
                      <td className={td}>{a.owner || <Badge tone="amber">{t('ws.plan.056')}</Badge>}</td>
                      <td className={clsx(td, 'whitespace-nowrap')}>{a.due ? <span className={clsx(overdue(a) && 'font-semibold text-bad')}>{fmtDate(a.due)}{overdue(a) && t('ws.plan.057')}</span> : <Badge tone="amber">{t('ws.plan.056')}</Badge>}</td>
                      <td className={td}>
                        <Badge tone={a.priority === 'alta' ? 'bad' : a.priority === 'media' ? 'amber' : 'muted'}>{PRIO[a.priority]}</Badge>
                      </td>
                      <td className={td}>
                        <Select aria-label={t('ws.plan.059', { description: a.description })} value={a.status} onChange={(e) => setStatus(a, e.target.value as ActionStatus)}>
                          {Object.entries(ACTION_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className={td}>{a.successIndicator ?? '—'}</td>
                      <td className={clsx(td, 'whitespace-nowrap')}>
                        <Button size="sm" variant="ghost" aria-label={t('ws.plan.060')} onClick={() => setEdit(structuredClone(a))}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('ws.plan.061')}
                          onClick={async () => {
                            if (await confirm({ title: t('ws.plan.062'), body: a.description, confirm: t('ws.plan.063'), danger: true })) update((d) => void (d.actions = d.actions.filter((x) => x.id !== a.id)), { area: t('ws.plan.003'), message: t('ws.plan.065', { description: a.description }) });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="space-y-2 xl:hidden">
              {list.map((a, i) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setEdit(structuredClone(a))} data-tour={i === 0 ? 'acao' : undefined} className={clsx('w-full rounded-xl border p-3 text-left', overdue(a) ? 'border-bad/40' : 'border-line/15')}>
                    <p className="font-semibold text-ink">{a.description}</p>
                    {relatedProblemOf(a, w) && <p className="mt-0.5 text-xs text-ink2">{t('ws.plan.051')}{relatedProblemOf(a, w)}</p>}
                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                      <Badge tone="accent">{ACTION_STATUS[a.status]}</Badge>
                      <Badge tone={a.priority === 'alta' ? 'bad' : 'muted'}>{PRIO[a.priority]}</Badge>
                    </div>
                    {/* Quem e quando: o que falta definir aparece como selo, para chamar a ação. */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1 text-ink2">
                        <UserRound className="h-3.5 w-3.5" aria-hidden />
                        {a.owner ? a.owner : <Badge tone="amber">{t('ws.plan.067')}</Badge>}
                      </span>
                      <span className={clsx('inline-flex items-center gap-1 text-ink2', overdue(a) && 'font-semibold text-bad')}>
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                        {a.due ? `${fmtDate(a.due)}${overdue(a) ? t('ws.plan.057') : ''}` : <Badge tone="amber">{t('ws.plan.069')}</Badge>}
                      </span>
                    </div>
                    {a.successIndicator && <p className="mt-1 text-xs text-ink2">{t('ws.plan.070')}{a.successIndicator}</p>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        </div>
      </Card>
      <PrintPlan />
      {w.actions.some(overdue) && (
        <div className="print:hidden">
          <Callout tone="bad">{w.actions.filter(overdue).length}{t('ws.plan.071')}</Callout>
        </div>
      )}

      <Modal
        open={!!imp}
        onClose={() => setImp(null)}
        title={t('ws.plan.072')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImp(null)}>{t('ws.plan.073')}</Button>
            <Button onClick={confirmImport}>{t('ws.plan.074')}{imp?.actions.length} {imp?.actions.length === 1 ? t('ws.plan.015') : t('ws.plan.016')}</Button>
          </>
        }
      >
        {imp && (
          <div className="space-y-3 text-sm" data-testid="plan-import-preview">
            <p className="text-ink2">{t('ws.plan.077')}<strong className="text-ink">{imp.actions.length}</strong> {imp.actions.length === 1 ? t('ws.plan.015') : t('ws.plan.016')}{t('ws.plan.080')}</p>
            <ol className="list-decimal space-y-1 pl-5">
              {imp.actions.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <span className="text-ink">{a.description}</span>
                  <span className="text-muted"> · {a.owner ?? t('ws.plan.081')} · {a.due ? fmtDate(a.due) : t('ws.plan.082')}</span>
                </li>
              ))}
            </ol>
            {imp.actions.length > 6 && <p className="text-muted">{t('ws.plan.more', { n: imp.actions.length - 6 })}</p>}
            {(imp.missingOwner > 0 || imp.missingDue > 0) && (
              <Callout tone="info">
                {imp.missingOwner > 0 && t('ws.plan.084', { missingOwner: imp.missingOwner })}
                {imp.missingOwner > 0 && imp.missingDue > 0 && t('ws.plan.085')}
                {imp.missingDue > 0 && t('ws.plan.086', { missingDue: imp.missingDue })}{t('ws.plan.087')}</Callout>
            )}
            {imp.notes.length > 0 && (
              <Callout tone="warn" title={t('ws.plan.088')}>
                <ul className="list-disc space-y-0.5 pl-4">
                  {imp.notes.slice(0, 8).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                {imp.notes.length > 8 && <p>{t('ws.plan.more', { n: imp.notes.length - 8 })}</p>}
              </Callout>
            )}
          </div>
        )}
      </Modal>
      {/* O tour aponta os botões do plano: só faz sentido quando já há ações. */}
      {/* Logo depois de montar o plano, a confirmação já orienta; o tour fica para a próxima visita. */}
      {w.actions.length > 0 && !justBuilt && <Tour storageKey="nexo.tour.plano" steps={tourSteps()} />}

      <Drawer
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit && w.actions.some((a) => a.id === edit.id) ? t('ws.plan.060') : t('ws.plan.091')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>{t('ws.plan.073')}</Button>
            <Button onClick={save}>{t('ws.plan.093')}</Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <Field label={t('ws.plan.094')} required>{(f) => <Textarea {...f} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
            <Field label={t('ws.plan.095')} help={t('ws.plan.096')}>
              {(f) => <Textarea {...f} className="min-h-[60px]" value={edit.relatedProblem ?? relatedProblemOf(edit, w) ?? ''} onChange={(e) => setEdit({ ...edit, relatedProblem: e.target.value || undefined })} />}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('ws.plan.045')}>{(f) => <Input {...f} value={edit.owner ?? ''} onChange={(e) => setEdit({ ...edit, owner: e.target.value || undefined })} />}</Field>
              <Field label={t('ws.plan.046')}>{(f) => <Input {...f} type="date" value={edit.due ?? ''} onChange={(e) => setEdit({ ...edit, due: e.target.value || undefined })} />}</Field>
              <Field label={t('ws.plan.047')}>
                {(f) => (
                  <Select {...f} value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value as Priority })}>
                    {Object.entries(PRIO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('ws.plan.048')}>
                {(f) => (
                  <Select {...f} value={edit.status} onChange={(e) => { const status = e.target.value as ActionStatus; setEdit({ ...edit, status, completedAt: status === 'concluida' ? edit.completedAt ?? today : undefined }); }}>
                    {Object.entries(ACTION_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label={t('ws.plan.101')}>{(f) => <Input {...f} value={edit.dependencies ?? ''} onChange={(e) => setEdit({ ...edit, dependencies: e.target.value || undefined })} />}</Field>
            <Field label={t('ws.plan.049')}>{(f) => <Input {...f} value={edit.successIndicator ?? ''} onChange={(e) => setEdit({ ...edit, successIndicator: e.target.value || undefined })} />}</Field>
            <Field label={t('ws.plan.103')} help={t('ws.plan.104')}>
              {(f) => <Input {...f} value={edit.expectedValue ?? ''} onChange={(e) => setEdit({ ...edit, expectedValue: e.target.value || undefined })} />}
            </Field>
            <Field label={t('ws.plan.105')} help={t('ws.plan.106')}>{(f) => <Input {...f} value={edit.doneCriteria ?? ''} onChange={(e) => setEdit({ ...edit, doneCriteria: e.target.value || undefined })} />}</Field>
            {edit.status === 'concluida' && (
              <fieldset className="space-y-3 rounded-lg border border-ok/40 p-3" data-testid="completion-record">
                <legend className="px-1 text-sm font-semibold text-ink">{t('ws.plan.107')}</legend>
                <Field label={t('ws.plan.055')} required help={t('ws.plan.109')}>
                  {(f) => <Textarea {...f} value={edit.observedResult ?? ''} onChange={(e) => setEdit({ ...edit, observedResult: e.target.value || undefined })} />}
                </Field>
                <Field label={t('ws.plan.110')} required>{(f) => <Input {...f} type="date" value={edit.completedAt ?? ''} onChange={(e) => setEdit({ ...edit, completedAt: e.target.value || undefined })} />}</Field>
              </fieldset>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}


/** Versão para impressão/PDF: todas as ações, sem controles, com resumo no topo. */
const printCols = () => [
  { h: '#', w: '4%' },
  { h: tr('d.plan.col2'), w: '30%' },
  { h: tr('d.plan.col3'), w: '14%' },
  { h: tr('d.plan.col4'), w: '11%' },
  { h: tr('d.plan.col5'), w: '10%' },
  { h: tr('d.plan.col6'), w: '12%' },
  { h: tr('d.plan.col7'), w: '19%' },
];

function PrintPlan() {
  const { t } = useI18n();
  const { w } = useWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const open = w.actions.filter((a) => a.status !== 'concluida' && a.status !== 'cancelada');
  const late = open.filter((a) => a.due && a.due < today);
  return (
    <div className="hidden print:block" data-testid="plan-print">
      <h2 className="text-xl font-bold text-ink">{t('ws.plan.111')}{w.asIs.name}</h2>
      <p className="mt-1 text-sm text-ink2">{t('ws.plan.112')}{fmtDate(today)} · {w.actions.length}{t('ws.plan.113')}{open.length}{t('ws.plan.114')}{w.actions.filter((a) => a.status === 'concluida').length}{t('ws.plan.115')}{late.length > 0 && t('ws.plan.116', { length: late.length })}
      </p>
      <table className="np-print-table mt-4 w-full text-[10.5px] leading-snug">
        {/* Larguras fixas (soma 100%): a ação leva o maior espaço; prazo cabe "00/00/0000". */}
        <colgroup>
          {printCols().map((c) => (
            <col key={c.h} style={{ width: c.w }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b-2 border-line/60 bg-surface2 text-left">
            {printCols().map((c) => (
              <th key={c.h} className="px-1.5 py-1.5 font-semibold text-ink">
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {w.actions.map((a, i) => (
            <tr key={a.id} className="border-b border-line/20 align-top">
              <td className="px-1.5 py-1 text-ink2">{i + 1}</td>
              <td className="px-1.5 py-1 text-ink">
                {a.description}
                {relatedProblemOf(a, w) && <span className="block text-ink2">{t('ws.plan.051')}{relatedProblemOf(a, w)}</span>}
                {a.status === 'concluida' && a.observedResult && <span className="block text-ink2">{t('ws.plan.118')}{a.observedResult}</span>}
              </td>
              <td className="px-1.5 py-1 text-ink2">{a.owner ?? 'pendente'}</td>
              <td className="whitespace-nowrap px-1.5 py-1 text-ink2">{a.due ? fmtDate(a.due) : 'pendente'}</td>
              <td className="px-1.5 py-1 text-ink2">{PRIO[a.priority]}</td>
              <td className="px-1.5 py-1 text-ink2">{ACTION_STATUS[a.status]}</td>
              <td className="px-1.5 py-1 text-ink2">{a.successIndicator ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[10px] text-muted">{t('ws.plan.119')}</p>
    </div>
  );
}

/** Plano vazio: ponto de partida com um clique, a partir das oportunidades encontradas. */
function StarterPlan({ candidates, onBuild, onNew, onImport }: { candidates: Recommendation[]; onBuild: () => void; onNew: () => void; onImport: () => void }) {
  const { t } = useI18n();
  const n = Math.min(STARTER_PLAN_SIZE, candidates.length);
  return (
    <div className="rounded-2xl border border-dashed border-line/25 p-5 text-center sm:p-8" data-testid="plan-starter">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand" aria-hidden>
        <Sparkles className="h-6 w-6" />
      </span>
      <h3 className="mt-3 text-lg font-semibold text-ink">{t('ws.plan.120')}</h3>
      {n > 0 ? (
        <>
          <p className="mx-auto mt-1 max-w-lg text-sm text-ink2">{t('ws.plan.077')}{candidates.length === 1 ? t('ws.plan.122') : t('ws.plan.123', { length: candidates.length })}{t('ws.plan.124')}{n === 1 ? t('ws.plan.125') : t('ws.plan.126', { n })}{t('ws.plan.127')}</p>
          <ul className="mx-auto mt-4 max-w-lg space-y-1.5 text-left text-sm">
            {candidates.slice(0, n).map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-lg bg-surface2/60 px-3 py-2">
                <Badge tone={r.priority === 'alta' ? 'bad' : r.priority === 'media' ? 'amber' : 'muted'} className="mt-0.5 shrink-0">
                  {PRIO[r.priority]}
                </Badge>
                <span className="text-ink">{r.title}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={onBuild} className="w-full sm:w-auto">
              <ListPlus className="h-5 w-5" aria-hidden />{t('ws.plan.128')}<span className="hidden sm:inline">
                {' '}{t('ws.plan.129')}{n} {n === 1 ? t('ws.plan.015') : t('ws.plan.016')}
              </span>
            </Button>
            <Link to="../recomendacoes" relative="path" className="inline-flex min-h-[44px] items-center px-3 text-sm font-semibold text-accent hover:underline">{t('ws.plan.132')}</Link>
          </div>
        </>
      ) : (
        <p className="mx-auto mt-1 max-w-lg text-sm text-ink2">{t('ws.plan.133')}</p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-line/10 pt-4">
        <Button size="sm" variant={n > 0 ? 'ghost' : 'primary'} onClick={onNew}>
          <Plus className="h-4 w-4" aria-hidden />{t('ws.plan.134')}</Button>
        <Button size="sm" variant="ghost" onClick={onImport}>
          <FileUp className="h-4 w-4" aria-hidden />{t('ws.plan.037')}</Button>
      </div>
    </div>
  );
}
