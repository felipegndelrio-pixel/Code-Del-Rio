// Construção assistida do TO-BE. Regras: cópia independente do AS-IS; toda
// mudança mostra antes/depois e pede confirmação; nada reduz tempo/custo
// automaticamente — o usuário informa a hipótese futura.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Copy, GitMerge, Plus, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { ActivityForm } from '../../components/ActivityForm';
import { Badge, BasisTag, Button, Callout, Card, Drawer, Empty, Field, Input, Modal, NumberInput, Select, Table, td, Term, Textarea, th, useConfirm, useToast } from '../../components/ui';
import { newActivity, newScenario, nextActivityId } from '../../domain/factory';
import { sortedActivities } from '../../domain/graph';
import type { Recommendation } from '../../domain/recommendations';
import { addActivity, CHANGE_LABEL, combineActivities, diffActivity, removeActivity, restoreFromAsIs, updateActivity, type ChangeMeta } from '../../domain/tobe';
import type { Activity, AssumptionStatus, ChangeKind, Scenario } from '../../domain/types';
import { fmtDateTime, fmtDuration, nowIso, uid } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

type Pending = { kind: ChangeKind; activity: Activity; draft: Activity; recId?: string } | { kind: 'remove'; activity: Activity; recId?: string } | null;

const FIELD_LABEL: Partial<Record<keyof Activity, string>> = {
  name: 'Nome',
  duration: 'Duração',
  unit: 'Unidade',
  wait: 'Espera',
  people: 'Pessoas',
  owner: 'Responsável',
  lean: 'Lean',
  rework: 'Retrabalho',
  frequencyPct: 'Frequência %',
  costPerHour: 'Custo-hora',
  variableCost: 'Custo variável',
  next: 'Próxima',
  nextYes: 'Se sim',
  nextNo: 'Se não',
  order: 'Ordem',
  stage: 'Etapa',
  minDuration: 'Mínimo',
  maxDuration: 'Máximo',
  notes: 'Observações',
  critical: 'Crítica',
  volume: 'Volume',
};
const show = (v: unknown) => (v === undefined || v === null || v === '' ? 'vazio' : Array.isArray(v) ? v.join(', ') || 'vazio' : typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v));

export default function ToBeTab() {
  const { w, update, recs } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const [newName, setNewName] = useState('Cenário futuro 1');
  const sc = w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0];
  const [pending, setPending] = useState<Pending>(null);
  const [meta, setMeta] = useState<ChangeMeta>({});
  const [combine, setCombine] = useState<{ keep: string; merge: string; name: string; duration?: number } | null>(null);
  const [adding, setAdding] = useState<{ act: Activity; after?: string } | null>(null);
  const [assumption, setAssumption] = useState('');

  const setScenario = (fn: (s: Scenario) => Scenario | null, message?: string) => {
    if (!sc) return;
    const next = fn(structuredClone(sc));
    if (!next) {
      toast('info', 'Nada mudou por aqui.');
      return;
    }
    update(
      (d) => {
        const i = d.scenarios.findIndex((s) => s.id === sc.id);
        d.scenarios[i] = { ...next, updatedAt: nowIso() };
      },
      message ? { area: `TO-BE: ${sc.name}`, message } : undefined,
    );
  };

  const create = (from?: Scenario) => {
    const s = from ? { ...structuredClone(from), id: uid('s_'), name: `${from.name} (cópia)`, createdAt: nowIso(), updatedAt: nowIso() } : newScenario(w.asIs, newName.trim() || 'Cenário futuro');
    update(
      (d) => {
        d.scenarios.push(s);
        d.activeScenarioId = s.id;
      },
      { area: 'TO-BE', message: from ? `Cenário duplicado: ${s.name}` : `Cenário criado a partir do AS-IS: ${s.name}` },
    );
    toast('ok', from ? 'Cenário duplicado.' : 'Cenário TO-BE criado como cópia independente do AS-IS.');
  };

  const removeScenario = async () => {
    if (!sc || !(await confirm({ title: `Excluir o cenário “${sc.name}”?`, body: 'O AS-IS e os outros cenários não são afetados.', confirm: 'Excluir', danger: true }))) return;
    update(
      (d) => {
        d.scenarios = d.scenarios.filter((s) => s.id !== sc.id);
        d.activeScenarioId = d.scenarios[0]?.id;
      },
      { area: 'TO-BE', message: `Cenário excluído: ${sc.name}` },
    );
  };

  const accepted = useMemo(() => recs.filter((r) => w.recDecisions[r.id]?.status === 'accepted' && r.activityId && r.changeKind), [recs, w.recDecisions]);

  if (!sc)
    return (
      <Card title={<>Construir o cenário futuro <Term k="tobe" iconOnly /></>} subtitle="TO-BE">
        <Empty
          title="Nenhum cenário TO-BE ainda"
          action={
            <div className="flex flex-wrap items-end justify-center gap-2">
              <Field label="Nome do cenário">{(f) => <Input {...f} value={newName} onChange={(e) => setNewName(e.target.value)} />}</Field>
              <Button onClick={() => create()}>Criar cenário a partir do AS-IS</Button>
            </div>
          }
        >
          Criamos uma cópia independente do processo atual. Você propõe mudanças nela; o AS-IS original continua intacto e restaurável. Você pode criar vários cenários alternativos.
        </Empty>
      </Card>
    );

  const acts = sortedActivities(sc.process);
  const asIsById = new Map(w.asIs.activities.map((a) => [a.id, a]));
  const rowState = (a: Activity) => (!asIsById.has(a.id) ? 'nova' : JSON.stringify(asIsById.get(a.id)) !== JSON.stringify(a) ? 'alterada' : '');
  const removed = w.asIs.activities.filter((a) => !sc.process.activities.some((x) => x.id === a.id));

  const startFromRec = (r: Recommendation) => {
    const a = sc.process.activities.find((x) => x.id === r.activityId);
    if (!a) {
      toast('info', 'Esta atividade não existe mais no cenário (talvez já tenha sido removida).');
      return;
    }
    setMeta({ recId: r.id, justification: r.problem, hypothesis: r.hypothesis });
    if (r.changeKind === 'remove') setPending({ kind: 'remove', activity: a, recId: r.id });
    else setPending({ kind: r.changeKind!, activity: a, draft: structuredClone(a), recId: r.id });
  };

  const confirmPending = () => {
    if (!pending) return;
    if (!meta.justification?.trim()) {
      toast('bad', 'Faltou só uma coisinha: o motivo da mudança.');
      return;
    }
    try {
      if (pending.kind === 'remove' && !('draft' in pending)) setScenario((s) => removeActivity(s, pending.activity.id, meta), `Removida “${pending.activity.name}”`);
      else if ('draft' in pending) setScenario((s) => updateActivity(s, pending.activity.id, pending.draft, pending.kind, meta), `${CHANGE_LABEL[pending.kind]}: “${pending.activity.name}”`);
      setPending(null);
      setMeta({});
    } catch (e) {
      toast('bad', e instanceof Error ? e.message : 'Não foi possível aplicar.');
    }
  };

  const diff = pending && 'draft' in pending ? diffActivity(pending.activity, pending.draft) : null;
  const successors = pending && pending.kind === 'remove' ? pending.activity.next.map((n) => sc.process.activities.find((a) => a.id === n)?.name ?? n) : [];

  return (
    <div className="space-y-4">
      <Card title="Cenário futuro" subtitle="TO-BE — hipótese até ser implantado e medido">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Cenário em edição" className="min-w-[min(100%,280px)] flex-1">
            {(f) => (
              <Select {...f} value={sc.id} onChange={(e) => update((d) => void (d.activeScenarioId = e.target.value))}>
                {w.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Renomear" className="min-w-[200px] flex-1">
            {(f) => <Input {...f} value={sc.name} onChange={(e) => setScenario((s) => ({ ...s, name: e.target.value }))} />}
          </Field>
          <Button variant="secondary" size="sm" onClick={() => create()}>
            <Plus className="h-4 w-4" /> Novo do AS-IS
          </Button>
          <Button variant="secondary" size="sm" onClick={() => create(sc)}>
            <Copy className="h-4 w-4" /> Duplicar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void removeScenario()} aria-label="Excluir cenário">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Criado em {fmtDateTime(sc.createdAt)} · {sc.changes.length} mudança(s) registrada(s). O AS-IS não é alterado por nada feito aqui.
        </p>
      </Card>

      {accepted.length > 0 && (
        <Card title="Recomendações aceitas para aplicar" subtitle="Assistido">
          <ul className="space-y-2">
            {accepted.map((r) => {
              const applied = sc.changes.some((c) => c.recId === r.id);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line/15 bg-surface2/40 p-3 text-sm">
                  <span className="min-w-0 flex-1 text-ink">{r.title}</span>
                  {applied ? (
                    <Badge tone="ok">Aplicada</Badge>
                  ) : (
                    <Button size="sm" onClick={() => startFromRec(r)}>
                      <Wand2 className="h-4 w-4" /> Aplicar…
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">Antes de aplicar, você informa os valores futuros esperados. Marcar algo como automatizável não reduz tempo nem custo sozinho.</p>
        </Card>
      )}
      {accepted.length === 0 && (
        <Callout tone="info">
          Dica: aceite recomendações na aba <Link className="font-semibold text-brand" to={`/app/p/${w.id}/recomendacoes`}>Recomendações</Link> para aplicá-las aqui com assistência — ou edite as atividades diretamente abaixo.
        </Callout>
      )}

      <Card
        title={`Atividades do TO-BE (${acts.length})`}
        subtitle="Edite, remova, combine ou adicione"
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setCombine({ keep: '', merge: '', name: '' })}>
              <GitMerge className="h-4 w-4" /> Combinar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAdding({ act: newActivity({ id: nextActivityId(sc.process), stage: sc.process.stageOrder[0] ?? '', name: '' }) })}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        }
      >
        <Table caption="Atividades do cenário futuro">
          <thead>
            <tr>
              {['Atividade', 'Etapa', 'Duração', 'Espera', 'Pessoas', 'Situação', ''].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {acts.map((a) => {
              const st = rowState(a);
              const orig = asIsById.get(a.id);
              return (
                <tr key={a.id} className={clsx(st && 'bg-brand/5')}>
                  <td className={clsx(td, 'text-ink')}>
                    {a.type === 'decision' ? '◆ ' : ''}
                    {a.name}
                    <span className="ml-1 font-mono text-xs text-muted">{a.id}</span>
                  </td>
                  <td className={td}>{a.stage}</td>
                  <td className={clsx(td, 'tabular')}>
                    {a.type === 'task' ? fmtDuration(a.duration, a.unit) : '—'}
                    {orig && orig.duration !== a.duration && <span className="block text-xs text-muted line-through">{fmtDuration(orig.duration, orig.unit)}</span>}
                  </td>
                  <td className={clsx(td, 'tabular')}>
                    {fmtDuration(a.wait, a.unit)}
                    {orig && orig.wait !== a.wait && <span className="block text-xs text-muted line-through">{fmtDuration(orig.wait, orig.unit)}</span>}
                  </td>
                  <td className={clsx(td, 'tabular')}>{a.people ?? '—'}</td>
                  <td className={td}>{st ? <Badge tone={st === 'nova' ? 'violet' : 'brand'}>{st}</Badge> : <span className="text-muted">igual ao AS-IS</span>}</td>
                  <td className={clsx(td, 'whitespace-nowrap')}>
                    {a.type !== 'start' && a.type !== 'end' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setMeta({});
                          setPending({ kind: 'edit', activity: a, draft: structuredClone(a) });
                        }}
                      >
                        Mudar
                      </Button>
                    )}
                    {a.type === 'task' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remover ${a.name}`}
                        onClick={() => {
                          setMeta({});
                          setPending({ kind: 'remove', activity: a });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    {st === 'alterada' && (
                      <Button size="sm" variant="ghost" aria-label={`Restaurar ${a.name} do AS-IS`} onClick={() => setScenario((s) => restoreFromAsIs(s, w.asIs.activities, a.id, { justification: 'Restaurado pelo usuário' }), `Restaurada “${a.name}”`)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {removed.length > 0 && (
          <p className="mt-2 text-sm text-ink2">
            Removidas em relação ao AS-IS: {removed.map((a) => a.name).join(', ')}.
          </p>
        )}
      </Card>

      <ScenarioAssumptions sc={sc} setScenario={setScenario} assumption={assumption} setAssumption={setAssumption} asIsVolume={w.asIs.volume} />

      <Card title="Registro de mudanças" subtitle="O quê, por quê, quem valida">
        {sc.changes.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma mudança ainda.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {[...sc.changes].reverse().map((c) => (
              <li key={c.id} className="rounded-xl border border-line/15 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{CHANGE_LABEL[c.kind]}</Badge>
                  <span className="font-medium text-ink">{c.summary}</span>
                  <span className="text-xs text-muted">{fmtDateTime(c.at)}</span>
                </div>
                {c.before && c.after && (
                  <p className="mt-1 text-xs text-ink2">
                    {Object.keys(c.after).map((k) => `${FIELD_LABEL[k as keyof Activity] ?? k}: ${show((c.before as any)[k])} → ${show((c.after as any)[k])}`).join(' · ')}
                  </p>
                )}
                {c.justification && <p className="mt-1 text-xs text-ink2">Justificativa: {c.justification}</p>}
                {c.hypothesis && (
                  <p className="text-xs text-ink2">
                    Hipótese <BasisTag basis="a_validar" />: {c.hypothesis}
                  </p>
                )}
                {c.validator && <p className="text-xs text-ink2">Quem valida: {c.validator}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Diálogo de mudança: antes/depois + confirmação */}
      <Drawer
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? `${CHANGE_LABEL[pending.kind]}: ${pending.activity.name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmPending} disabled={!!diff && !Object.keys(diff.after).length}>
              Confirmar mudança
            </Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-4">
            {pending.kind === 'remove' ? (
              <Callout tone="warn" title="A atividade será removida do TO-BE">
                O fluxo será religado: quem vinha para “{pending.activity.name}” passa a seguir para {successors.length ? successors.join(', ') : 'o fim do caminho'}. O AS-IS continua com ela.
              </Callout>
            ) : (
              'draft' in pending && (
                <>
                  <Field label="Tipo de mudança">
                    {(f) => (
                      <Select {...f} value={pending.kind} onChange={(e) => setPending({ ...pending, kind: e.target.value as ChangeKind })}>
                        {(['simplify', 'automate', 'reduce_wait', 'reduce_rework', 'reorder', 'edit'] as ChangeKind[]).map((k) => (
                          <option key={k} value={k}>
                            {CHANGE_LABEL[k]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  {pending.kind === 'automate' && (
                    <Callout tone="info">
                      Informe o tempo e as pessoas que continuarão necessários (supervisão, exceções). Não presumimos eliminação total do trabalho humano.
                    </Callout>
                  )}
                  <ActivityForm value={pending.draft} onChange={(d) => setPending({ ...pending, draft: d })} all={sc.process.activities} stages={sc.process.stageOrder} />
                  <div className="rounded-xl border border-line/15 bg-surface2/50 p-3 text-sm">
                    <p className="font-semibold text-ink">Antes → depois</p>
                    {diff && Object.keys(diff.after).length ? (
                      <ul className="mt-1 space-y-0.5 text-ink2">
                        {Object.keys(diff.after).map((k) => (
                          <li key={k}>
                            {FIELD_LABEL[k as keyof Activity] ?? k}: <span className="line-through">{show((diff.before as any)[k])}</span> → <strong className="text-ink">{show((diff.after as any)[k])}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted">Altere algum campo acima.</p>
                    )}
                  </div>
                </>
              )
            )}
            <Field label="Justificativa" required help="Por que esta mudança? Qual evidência?">
              {(f) => <Textarea {...f} value={meta.justification ?? ''} onChange={(e) => setMeta({ ...meta, justification: e.target.value })} />}
            </Field>
            <Field label="Hipótese a validar" help="O que precisa ser verdade para o benefício acontecer?">
              {(f) => <Textarea {...f} value={meta.hypothesis ?? ''} onChange={(e) => setMeta({ ...meta, hypothesis: e.target.value })} />}
            </Field>
            <Field label="Quem valida" help="Opcional — função ou nome.">
              {(f) => <Input {...f} value={meta.validator ?? ''} onChange={(e) => setMeta({ ...meta, validator: e.target.value })} />}
            </Field>
          </div>
        )}
      </Drawer>

      <Modal
        open={!!combine}
        onClose={() => setCombine(null)}
        title="Combinar duas atividades"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCombine(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!combine?.keep || !combine?.merge || combine.keep === combine.merge || !combine.name.trim() || !meta.justification?.trim()}
              onClick={() => {
                const c = combine!;
                try {
                  setScenario((s) => combineActivities(s, c.keep, c.merge, { name: c.name.trim(), duration: c.duration }, meta), `Combinadas ${c.keep} e ${c.merge}`);
                  setCombine(null);
                  setMeta({});
                } catch (e) {
                  toast('bad', e instanceof Error ? e.message : 'Não foi possível combinar.');
                }
              }}
            >
              Confirmar
            </Button>
          </>
        }
      >
        {combine && (
          <div className="space-y-3">
            {(['keep', 'merge'] as const).map((k) => (
              <Field key={k} label={k === 'keep' ? 'Atividade que permanece' : 'Atividade absorvida (será removida)'}>
                {(f) => (
                  <Select {...f} value={combine[k]} onChange={(e) => setCombine({ ...combine, [k]: e.target.value })}>
                    <option value="">Escolha…</option>
                    {acts
                      .filter((a) => a.type === 'task')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id} · {a.name}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
            ))}
            <Field label="Nome da atividade combinada">{(f) => <Input {...f} value={combine.name} onChange={(e) => setCombine({ ...combine, name: e.target.value })} />}</Field>
            <Field label="Nova duração esperada" help="Na unidade da atividade que permanece. Informe a sua hipótese — não somamos nem reduzimos automaticamente.">
              {(f) => <NumberInput {...f} value={combine.duration} onChange={(v) => setCombine({ ...combine, duration: v })} />}
            </Field>
            <Field label="Justificativa" required>
              {(f) => <Textarea {...f} value={meta.justification ?? ''} onChange={(e) => setMeta({ ...meta, justification: e.target.value })} />}
            </Field>
          </div>
        )}
      </Modal>

      <Drawer
        open={!!adding}
        onClose={() => setAdding(null)}
        title="Adicionar atividade ao TO-BE"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!adding?.act.name.trim() || !meta.justification?.trim()}
              onClick={() => {
                try {
                  setScenario((s) => addActivity(s, { ...adding!.act, name: adding!.act.name.trim() }, adding!.after, meta), `Adicionada “${adding!.act.name}”`);
                  setAdding(null);
                  setMeta({});
                } catch (e) {
                  toast('bad', e instanceof Error ? e.message : 'Não foi possível adicionar.');
                }
              }}
            >
              Adicionar
            </Button>
          </>
        }
      >
        {adding && (
          <div className="space-y-4">
            <Field label="Inserir depois de" help="O fluxo é religado automaticamente (você vê o resultado no mapa e na comparação).">
              {(f) => (
                <Select {...f} value={adding.after ?? ''} onChange={(e) => setAdding({ ...adding, after: e.target.value || undefined })}>
                  <option value="">— não ligar automaticamente —</option>
                  {acts
                    .filter((a) => a.type === 'task' || a.type === 'start')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id} · {a.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <ActivityForm value={adding.act} onChange={(a) => setAdding({ ...adding, act: a })} all={sc.process.activities} stages={sc.process.stageOrder} />
            <Field label="Justificativa" required>
              {(f) => <Textarea {...f} value={meta.justification ?? ''} onChange={(e) => setMeta({ ...meta, justification: e.target.value })} />}
            </Field>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function ScenarioAssumptions({ sc, setScenario, assumption, setAssumption, asIsVolume }: { sc: Scenario; setScenario: (fn: (s: Scenario) => Scenario | null, m?: string) => void; assumption: string; setAssumption: (s: string) => void; asIsVolume?: number }) {
  return (
    <Card title="Premissas financeiras e de cenário" subtitle="Informadas por você — usadas no business case">
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Investimento inicial (R$)" help="Implantação, licenças, treinamento. Pode ser 0.">
          {(f) => <NumberInput {...f} value={sc.investment} onChange={(v) => setScenario((s) => ({ ...s, investment: v }))} />}
        </Field>
        <Field label="Custo recorrente novo (R$/mês)" help="Ex.: assinatura de software. Pode ser 0.">
          {(f) => <NumberInput {...f} value={sc.recurringCostPerMonth} onChange={(v) => setScenario((s) => ({ ...s, recurringCostPerMonth: v }))} />}
        </Field>
        <Field label="Horizonte do ROI (meses)" help="Convenção de análise.">
          {(f) => <NumberInput {...f} value={sc.horizonMonths} onChange={(v) => v && v >= 1 && setScenario((s) => ({ ...s, horizonMonths: Math.round(v) }))} />}
        </Field>
        <Field label="Volume no TO-BE" help={`Vazio = igual ao AS-IS (${asIsVolume ?? 'não informado'}). Se diferente, a comparação é normalizada.`}>
          {(f) => <NumberInput {...f} value={sc.process.volume} onChange={(v) => setScenario((s) => ({ ...s, process: { ...s.process, volume: v } }))} />}
        </Field>
      </div>
      <div className="mt-4">
        <p className="text-sm font-semibold text-ink">Premissas e hipóteses do cenário</p>
        <ul className="mt-2 space-y-2">
          {sc.assumptions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 text-ink2">{a.text}</span>
              <Select
                aria-label="Situação da premissa"
                className="w-40"
                value={a.status}
                onChange={(e) => setScenario((s) => ({ ...s, assumptions: s.assumptions.map((x) => (x.id === a.id ? { ...x, status: e.target.value as AssumptionStatus } : x)) }), `Premissa: ${a.text} → ${e.target.value}`)}
              >
                <option value="a_validar">A validar</option>
                <option value="validada">Validada</option>
                <option value="rejeitada">Rejeitada</option>
              </Select>
              <Button size="sm" variant="ghost" aria-label="Remover premissa" onClick={() => setScenario((s) => ({ ...s, assumptions: s.assumptions.filter((x) => x.id !== a.id) }))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input aria-label="Nova premissa" placeholder="Ex.: transportadora aceita agendamento por API" value={assumption} onChange={(e) => setAssumption(e.target.value)} />
          <Button
            variant="secondary"
            disabled={!assumption.trim()}
            onClick={() => {
              setScenario((s) => ({ ...s, assumptions: [...s.assumptions, { id: uid('as_'), text: assumption.trim(), status: 'a_validar' }] }), `Premissa adicionada: ${assumption.trim()}`);
              setAssumption('');
            }}
          >
            Adicionar
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Dependências">{(f) => <Textarea {...f} value={sc.dependencies ?? ''} onChange={(e) => setScenario((s) => ({ ...s, dependencies: e.target.value || undefined }))} />}</Field>
        <Field label="Riscos do cenário">{(f) => <Textarea {...f} value={sc.risks ?? ''} onChange={(e) => setScenario((s) => ({ ...s, risks: e.target.value || undefined }))} />}</Field>
      </div>
    </Card>
  );
}

