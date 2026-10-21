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
import { useWorkspace } from '../../state/workspace';
import { localDraft } from '../../storage/localDraft';

export const ACTION_STATUS: Record<ActionStatus, string> = { a_fazer: 'A fazer', em_andamento: 'Em andamento', bloqueada: 'Bloqueada', concluida: 'Concluída', cancelada: 'Cancelada' };
const PRIO: Record<Priority, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

const TOUR: TourStep[] = [
  { target: '[data-tour="acao"]', title: 'Defina quem faz e até quando', body: 'Toque numa ação para escolher o responsável e o prazo. Isso nunca é preenchido por você: a decisão é da equipe.' },
  { target: '[data-tour="exportar"]', title: 'Compartilhe com a equipe', body: 'Exporte em PDF para apresentar ou em planilha (CSV) para acompanhar no Excel.' },
  { target: '[data-tour="importar"]', title: 'Já tem ações numa planilha?', body: 'Importe um CSV com as colunas Ação, Responsável e Prazo; elas entram no fim do plano.' },
];

const blank = (): ActionItem => ({ id: uid('act_'), description: '', priority: 'media', status: 'a_fazer', origin: { kind: 'manual' }, createdAt: nowIso() });

export default function PlanTab() {
  const { w, update, recs } = useWorkspace();
  const candidates = planCandidates(recs, w);
  const toast = useToast();
  const confirm = useConfirm();
  // Ação em edição sobrevive a um recarregamento (rascunho local por projeto).
  const draftKey = `plano.${w.id}`;
  const [edit, setEdit] = useState<ActionItem | null>(() => localDraft.read<ActionItem>(draftKey) ?? null);
  const recovered = useRef(!!edit);
  useEffect(() => {
    if (recovered.current) toast('info', 'Recuperamos a ação que você estava editando.');
    recovered.current = false;
  }, [toast]);
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
      toast('bad', 'Faltou só uma coisinha: o que vai ser feito nessa ação.');
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
      { area: 'Plano de ação', message: `${exists ? 'Editada' : 'Criada'} ação: ${edit.description}` },
    );
    setEdit(null);
  };

  const setStatus = (a: ActionItem, status: ActionStatus) => {
    if (status === 'concluida' && !a.observedResult?.trim()) {
      // Conclusão exige registro: abre o formulário em vez de marcar direto.
      setEdit({ ...structuredClone(a), status, completedAt: a.completedAt ?? today });
      toast('info', 'Quase lá: para concluir, conte qual resultado foi observado.');
      return;
    }
    update(
      (d) => {
        const x = d.actions.find((y) => y.id === a.id)!;
        x.status = status;
        if (status === 'concluida') x.completedAt = x.completedAt ?? today;
        else x.completedAt = undefined;
      },
      { area: 'Plano de ação', message: `${a.description}: ${ACTION_STATUS[status]}` },
    );
  };

  const fromChanges = () => {
    const sc = w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0];
    if (!sc) return;
    const fresh = sc.changes.filter((c) => !w.actions.some((a) => a.origin?.ref === c.id) && c.kind !== 'restore');
    if (!fresh.length) {
      toast('info', 'Tudo em dia: cada mudança do TO-BE já tem uma ação no plano.');
      return;
    }
    update(
      (d) => {
        for (const c of fresh)
          d.actions.push({
            id: uid('act_'),
            description: `Implantar: ${c.summary}`,
            priority: 'media',
            status: 'a_fazer',
            successIndicator: c.hypothesis ? `Hipótese confirmada: ${c.hypothesis}` : undefined,
            origin: { kind: 'change', ref: c.id },
            createdAt: nowIso(),
          });
      },
      { area: 'Plano de ação', message: `${fresh.length} ação(ões) criadas a partir do TO-BE “${sc.name}”` },
    );
    toast('ok', `Pronto! Seu plano de ação está montado (${fresh.length} ${fresh.length === 1 ? 'ação' : 'ações'}). Agora é só definir responsáveis e prazos; dá para ajustar a qualquer momento.`);
  };

  const exportPdf = () => {
    if (demoBlocked('exportar')) return;
    // O nome do arquivo sugerido pelo "Salvar como PDF" vem do título da página.
    const prev = document.title;
    document.title = `Plano de ação - ${w.asIs.name}`;
    window.addEventListener('afterprint', () => (document.title = prev), { once: true });
    window.print();
  };
  const exportCsv = async () => {
    if (demoBlocked('exportar')) return;
    try {
      await download(`${slug(w.asIs.name)}-plano-de-acao.csv`, actionsToCsv(w), 'text/csv;charset=utf-8');
      toast('ok', 'Planilha do plano gerada. Abra no Excel ou nas Planilhas Google para compartilhar.');
    } catch (e) {
      toast('bad', `Não conseguimos exportar: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setImp(await readPlanFile(f));
    } catch (e) {
      toast('bad', e instanceof ImportError ? `${e.message} ${e.fix}` : 'Não conseguimos ler esse arquivo. Salve como CSV e tente de novo.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const confirmImport = () => {
    if (!imp) return;
    const n = imp.actions.length;
    update((d) => void d.actions.push(...imp.actions), { area: 'Plano de ação', message: `${n} ação(ões) importada(s) de planilha` });
    setImp(null);
    toast('ok', `${n} ${n === 1 ? 'ação adicionada' : 'ações adicionadas'} ao plano.`);
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
      { area: 'Plano de ação', message: `Plano montado com ${pick.length} oportunidade(s) de melhoria` },
    );
    toast('ok', `Plano montado com ${pick.length} ${pick.length === 1 ? 'ação' : 'ações'}. Agora defina quem faz e até quando — toque numa ação para editar.`);
  };

  const list = w.actions.filter((a) => (filter === 'todas' ? true : filter === 'concluida' ? a.status === 'concluida' : a.status !== 'concluida' && a.status !== 'cancelada'));
  const changeCount = (w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0])?.changes.length ?? 0;

  return (
    <div className="space-y-4">
      <Card
        className="print:hidden"
        title="Plano de ação"
        subtitle="Quem faz o quê, até quando"
        action={
          <div className="no-print flex flex-wrap gap-2">
            {changeCount > 0 && (
              <Button size="sm" variant="secondary" onClick={fromChanges} data-tour="gerar">
                <ListPlus className="h-4 w-4" /> Gerar do TO-BE
              </Button>
            )}
            <Button size="sm" onClick={() => setEdit(blank())} data-tour="nova">
              <Plus className="h-4 w-4" /> Nova ação
            </Button>
          </div>
        }
      >
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden data-testid="plan-import-input" onChange={(e) => void pickFile(e.target.files?.[0])} />
        {w.actions.length > 0 && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-2 border-b border-line/10 pb-3">
          <span className="flex flex-wrap gap-2" data-tour="exportar">
            <Button size="sm" variant="secondary" onClick={exportPdf} disabled={!w.actions.length}>
              <FileDown className="h-4 w-4" aria-hidden /> Exportar PDF
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void exportCsv()} disabled={!w.actions.length}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden /> Exportar planilha (CSV)
            </Button>
          </span>
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} data-tour="importar">
            <FileUp className="h-4 w-4" aria-hidden /> Importar planilha (CSV)
          </Button>
        </div>
        )}
        <div className="print:hidden">
        {w.actions.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Segmented label="Filtro" value={filter} onChange={setFilter} options={[{ value: 'todas', label: `Todas (${w.actions.length})` }, { value: 'abertas', label: 'Abertas' }, { value: 'concluida', label: 'Concluídas' }]} />
          <span className="text-xs text-muted">Responsável e prazo nunca são preenchidos automaticamente — ficam “pendente” até você definir.</span>
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
              <Table caption="Ações do plano" minWidth={960}>
                <thead>
                  <tr>
                    {[
                      ['Ação', 'min-w-[15rem]'],
                      ['Responsável', 'min-w-[8rem]'],
                      ['Prazo', ''],
                      ['Prioridade', ''],
                      ['Situação', 'min-w-[10rem]'],
                      ['Indicador de sucesso', 'min-w-[12rem]'],
                      ['', ''],
                    ].map(([h, w]) => (
                      <th key={h} className={clsx(th, 'whitespace-nowrap', w)}>
                        {h ? h : <span className="sr-only">Ações</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((a, i) => (
                    <tr key={a.id} className={clsx(overdue(a) && 'bg-bad/5')} data-tour={i === 0 ? 'acao' : undefined}>
                      <td className={clsx(td, 'text-ink')}>
                        {a.description}
                        {relatedProblemOf(a, w) && <span className="block text-xs text-ink2">Problema: {relatedProblemOf(a, w)}</span>}
                        {a.origin?.kind !== 'manual' && <span className="block text-xs text-muted">origem: {a.origin?.kind === 'recommendation' ? 'recomendação' : 'mudança do TO-BE'}</span>}
                        {a.status === 'concluida' && a.observedResult && (
                          <span className="block text-xs text-ok">
                            Resultado observado{a.completedAt ? ` (${fmtDate(a.completedAt)})` : ''}: {a.observedResult}
                          </span>
                        )}
                      </td>
                      <td className={td}>{a.owner || <Badge tone="amber">pendente</Badge>}</td>
                      <td className={clsx(td, 'whitespace-nowrap')}>{a.due ? <span className={clsx(overdue(a) && 'font-semibold text-bad')}>{fmtDate(a.due)}{overdue(a) && ' · atrasada'}</span> : <Badge tone="amber">pendente</Badge>}</td>
                      <td className={td}>
                        <Badge tone={a.priority === 'alta' ? 'bad' : a.priority === 'media' ? 'amber' : 'muted'}>{PRIO[a.priority]}</Badge>
                      </td>
                      <td className={td}>
                        <Select aria-label={`Situação de ${a.description}`} value={a.status} onChange={(e) => setStatus(a, e.target.value as ActionStatus)}>
                          {Object.entries(ACTION_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className={td}>{a.successIndicator ?? '—'}</td>
                      <td className={clsx(td, 'whitespace-nowrap')}>
                        <Button size="sm" variant="ghost" aria-label="Editar ação" onClick={() => setEdit(structuredClone(a))}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Excluir ação"
                          onClick={async () => {
                            if (await confirm({ title: 'Excluir ação?', body: a.description, confirm: 'Excluir', danger: true })) update((d) => void (d.actions = d.actions.filter((x) => x.id !== a.id)), { area: 'Plano de ação', message: `Excluída: ${a.description}` });
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
                    {relatedProblemOf(a, w) && <p className="mt-0.5 text-xs text-ink2">Problema: {relatedProblemOf(a, w)}</p>}
                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                      <Badge tone="accent">{ACTION_STATUS[a.status]}</Badge>
                      <Badge tone={a.priority === 'alta' ? 'bad' : 'muted'}>{PRIO[a.priority]}</Badge>
                    </div>
                    {/* Quem e quando: o que falta definir aparece como selo, para chamar a ação. */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1 text-ink2">
                        <UserRound className="h-3.5 w-3.5" aria-hidden />
                        {a.owner ? a.owner : <Badge tone="amber">Responsável pendente</Badge>}
                      </span>
                      <span className={clsx('inline-flex items-center gap-1 text-ink2', overdue(a) && 'font-semibold text-bad')}>
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                        {a.due ? `${fmtDate(a.due)}${overdue(a) ? ' · atrasada' : ''}` : <Badge tone="amber">Prazo pendente</Badge>}
                      </span>
                    </div>
                    {a.successIndicator && <p className="mt-1 text-xs text-ink2">Indicador: {a.successIndicator}</p>}
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
          <Callout tone="bad">{w.actions.filter(overdue).length} ação(ões) com prazo vencido.</Callout>
        </div>
      )}

      <Modal
        open={!!imp}
        onClose={() => setImp(null)}
        title="Importar ações da planilha"
        footer={
          <>
            <Button variant="secondary" onClick={() => setImp(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmImport}>Adicionar {imp?.actions.length} {imp?.actions.length === 1 ? 'ação' : 'ações'}</Button>
          </>
        }
      >
        {imp && (
          <div className="space-y-3 text-sm" data-testid="plan-import-preview">
            <p className="text-ink2">
              Encontramos <strong className="text-ink">{imp.actions.length}</strong> {imp.actions.length === 1 ? 'ação' : 'ações'}. Elas entram no fim do plano; nada do que já existe é alterado.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              {imp.actions.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <span className="text-ink">{a.description}</span>
                  <span className="text-muted"> · {a.owner ?? 'responsável pendente'} · {a.due ? fmtDate(a.due) : 'prazo pendente'}</span>
                </li>
              ))}
            </ol>
            {imp.actions.length > 6 && <p className="text-muted">…e mais {imp.actions.length - 6}.</p>}
            {(imp.missingOwner > 0 || imp.missingDue > 0) && (
              <Callout tone="info">
                {imp.missingOwner > 0 && `${imp.missingOwner} sem responsável`}
                {imp.missingOwner > 0 && imp.missingDue > 0 && ' e '}
                {imp.missingDue > 0 && `${imp.missingDue} sem prazo`}: ficam como “pendente” até você definir.
              </Callout>
            )}
            {imp.notes.length > 0 && (
              <Callout tone="warn" title="Ajustes na leitura">
                <ul className="list-disc space-y-0.5 pl-4">
                  {imp.notes.slice(0, 8).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                {imp.notes.length > 8 && <p>…e mais {imp.notes.length - 8}.</p>}
              </Callout>
            )}
          </div>
        )}
      </Modal>
      {/* O tour aponta os botões do plano: só faz sentido quando já há ações. */}
      {/* Logo depois de montar o plano, a confirmação já orienta; o tour fica para a próxima visita. */}
      {w.actions.length > 0 && !justBuilt && <Tour storageKey="nexo.tour.plano" steps={TOUR} />}

      <Drawer
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit && w.actions.some((a) => a.id === edit.id) ? 'Editar ação' : 'Nova ação'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <Field label="Descrição" required>{(f) => <Textarea {...f} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
            <Field label="Problema relacionado" help="Qual problema do diagnóstico esta ação resolve.">
              {(f) => <Textarea {...f} className="min-h-[60px]" value={edit.relatedProblem ?? relatedProblemOf(edit, w) ?? ''} onChange={(e) => setEdit({ ...edit, relatedProblem: e.target.value || undefined })} />}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Responsável">{(f) => <Input {...f} value={edit.owner ?? ''} onChange={(e) => setEdit({ ...edit, owner: e.target.value || undefined })} />}</Field>
              <Field label="Prazo">{(f) => <Input {...f} type="date" value={edit.due ?? ''} onChange={(e) => setEdit({ ...edit, due: e.target.value || undefined })} />}</Field>
              <Field label="Prioridade">
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
              <Field label="Situação">
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
            <Field label="Dependências">{(f) => <Input {...f} value={edit.dependencies ?? ''} onChange={(e) => setEdit({ ...edit, dependencies: e.target.value || undefined })} />}</Field>
            <Field label="Indicador de sucesso">{(f) => <Input {...f} value={edit.successIndicator ?? ''} onChange={(e) => setEdit({ ...edit, successIndicator: e.target.value || undefined })} />}</Field>
            <Field label="Resultado esperado" help="Ex.: −80 pessoa-h/mês (estimado no TO-BE).">
              {(f) => <Input {...f} value={edit.expectedValue ?? ''} onChange={(e) => setEdit({ ...edit, expectedValue: e.target.value || undefined })} />}
            </Field>
            <Field label="Critério de sucesso" help="Como saber, de forma verificável, que a ação funcionou.">{(f) => <Input {...f} value={edit.doneCriteria ?? ''} onChange={(e) => setEdit({ ...edit, doneCriteria: e.target.value || undefined })} />}</Field>
            {edit.status === 'concluida' && (
              <fieldset className="space-y-3 rounded-lg border border-ok/40 p-3" data-testid="completion-record">
                <legend className="px-1 text-sm font-semibold text-ink">Registro de conclusão</legend>
                <Field label="Resultado observado" required help="O que de fato mudou, com a fonte. Sem registro, a ação não pode ser concluída.">
                  {(f) => <Textarea {...f} value={edit.observedResult ?? ''} onChange={(e) => setEdit({ ...edit, observedResult: e.target.value || undefined })} />}
                </Field>
                <Field label="Data de conclusão" required>{(f) => <Input {...f} type="date" value={edit.completedAt ?? ''} onChange={(e) => setEdit({ ...edit, completedAt: e.target.value || undefined })} />}</Field>
              </fieldset>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}


/** Versão para impressão/PDF: todas as ações, sem controles, com resumo no topo. */
const PRINT_COLS = [
  { h: '#', w: '4%' },
  { h: 'Ação', w: '30%' },
  { h: 'Responsável', w: '14%' },
  { h: 'Prazo', w: '11%' },
  { h: 'Prioridade', w: '10%' },
  { h: 'Situação', w: '12%' },
  { h: 'Indicador de sucesso', w: '19%' },
];

function PrintPlan() {
  const { w } = useWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const open = w.actions.filter((a) => a.status !== 'concluida' && a.status !== 'cancelada');
  const late = open.filter((a) => a.due && a.due < today);
  return (
    <div className="hidden print:block" data-testid="plan-print">
      <h2 className="text-xl font-bold text-ink">Plano de ação — {w.asIs.name}</h2>
      <p className="mt-1 text-sm text-ink2">
        Gerado em {fmtDate(today)} · {w.actions.length} ações · {open.length} abertas · {w.actions.filter((a) => a.status === 'concluida').length} concluídas
        {late.length > 0 && ` · ${late.length} com prazo vencido`}
      </p>
      <table className="np-print-table mt-4 w-full text-[10.5px] leading-snug">
        {/* Larguras fixas (soma 100%): a ação leva o maior espaço; prazo cabe "00/00/0000". */}
        <colgroup>
          {PRINT_COLS.map((c) => (
            <col key={c.h} style={{ width: c.w }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b-2 border-line/60 bg-surface2 text-left">
            {PRINT_COLS.map((c) => (
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
                {relatedProblemOf(a, w) && <span className="block text-ink2">Problema: {relatedProblemOf(a, w)}</span>}
                {a.status === 'concluida' && a.observedResult && <span className="block text-ink2">Resultado observado: {a.observedResult}</span>}
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
      <p className="mt-4 text-[10px] text-muted">“Pendente” = responsável ou prazo ainda não definidos pela equipe. Gerado pelo NexoProcess; os dados ficam no aparelho de quem gerou.</p>
    </div>
  );
}

/** Plano vazio: ponto de partida com um clique, a partir das oportunidades encontradas. */
function StarterPlan({ candidates, onBuild, onNew, onImport }: { candidates: Recommendation[]; onBuild: () => void; onNew: () => void; onImport: () => void }) {
  const n = Math.min(STARTER_PLAN_SIZE, candidates.length);
  return (
    <div className="rounded-2xl border border-dashed border-line/25 p-5 text-center sm:p-8" data-testid="plan-starter">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand" aria-hidden>
        <Sparkles className="h-6 w-6" />
      </span>
      <h3 className="mt-3 text-lg font-semibold text-ink">Seu plano começa aqui</h3>
      {n > 0 ? (
        <>
          <p className="mx-auto mt-1 max-w-lg text-sm text-ink2">
            Encontramos {candidates.length === 1 ? '1 oportunidade de melhoria' : `${candidates.length} oportunidades de melhoria`} no seu processo. Transforme {n === 1 ? 'a principal' : `as ${n} principais`} em ações agora; depois é só
            definir quem faz e até quando.
          </p>
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
              <ListPlus className="h-5 w-5" aria-hidden /> Montar meu plano
              <span className="hidden sm:inline">
                {' '}com {n} {n === 1 ? 'ação' : 'ações'}
              </span>
            </Button>
            <Link to="../recomendacoes" relative="path" className="inline-flex min-h-[44px] items-center px-3 text-sm font-semibold text-accent hover:underline">
              Prefiro escolher uma a uma
            </Link>
          </div>
        </>
      ) : (
        <p className="mx-auto mt-1 max-w-lg text-sm text-ink2">Crie a primeira ação ou importe o plano que você já tem numa planilha.</p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-line/10 pt-4">
        <Button size="sm" variant={n > 0 ? 'ghost' : 'primary'} onClick={onNew}>
          <Plus className="h-4 w-4" aria-hidden /> Criar ação do zero
        </Button>
        <Button size="sm" variant="ghost" onClick={onImport}>
          <FileUp className="h-4 w-4" aria-hidden /> Importar planilha (CSV)
        </Button>
      </div>
    </div>
  );
}
