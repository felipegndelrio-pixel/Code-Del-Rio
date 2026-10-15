import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarRange, Columns3, List, Plus, Send, Trash2 } from 'lucide-react';
import { useProject } from '../ProjectDetail';
import { supabase } from '../../lib/supabase';
import { fetchAll, insertRow, updateRow } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { useAsync } from '../../hooks/useAsync';
import { ACTION_STATUS, CRITICALITY, PRIORITY, labelOf, type Option } from '../../lib/constants';
import type { Action, ActionComment, ActionDependency, Milestone, WbsItem } from '../../lib/types';
import { isActionOverdue, parseDate, todayUTC } from '../../lib/kpi';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorBox, Modal, STATUS_TONE, Spinner, Tabs, fmtDate, inputCls, useToast } from '../../components/ui';
import { EntityForm, type FieldDef } from '../../components/EntityManager';
import DocumentsPanel from './DocumentsPanel';
import AuditTable from './AuditTable';

export const OWNER_EDITABLE = ['status', 'progress', 'blockers', 'evidence', 'next_step', 'actual_start'];

export function actionFields(members: Option[], milestones: Option[], wbs: Option[]): FieldDef[] {
  return [
    { name: 'title', label: 'Ação', type: 'text', required: true, full: true },
    { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'objective', label: 'Objetivo', type: 'textarea' },
    { name: 'owner_id', label: 'Responsável principal', type: 'select', options: members },
    { name: 'participants', label: 'Participantes', type: 'text' },
    { name: 'start_date', label: 'Início', type: 'date' },
    { name: 'due_date', label: 'Prazo', type: 'date' },
    { name: 'actual_start', label: 'Início real', type: 'date' },
    { name: 'status', label: 'Status', type: 'select', options: ACTION_STATUS, required: true },
    { name: 'priority', label: 'Prioridade', type: 'select', options: PRIORITY, required: true },
    { name: 'criticality', label: 'Criticidade', type: 'select', options: CRITICALITY, required: true },
    { name: 'progress', label: 'Avanço (%)', type: 'int', min: 0, max: 100 },
    { name: 'milestone_id', label: 'Marco', type: 'select', options: milestones },
    { name: 'wbs_item_id', label: 'Item da EAP', type: 'select', options: wbs },
    { name: 'blockers', label: 'Bloqueios', type: 'textarea', hint: 'Obrigatório quando o status é Bloqueada' },
    { name: 'evidence', label: 'Evidências', type: 'textarea' },
    { name: 'next_step', label: 'Próximo passo', type: 'textarea' },
  ];
}

type View = 'tabela' | 'kanban' | 'cronograma';

export default function ActionsTab() {
  const ctx = useProject();
  const { project, canManage, me, memberOptions, personName } = ctx;
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<View>('tabela');
  const [fStatus, setFStatus] = useState('');
  const [fOwner, setFOwner] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [onlyLate, setOnlyLate] = useState(false);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmDone, setConfirmDone] = useState<Action | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const today = todayUTC();

  const { data, error, loading, reload } = useAsync(async () => {
    const ids = [project.id];
    const [actions, deps, milestones, wbs] = await Promise.all([
      fetchAll<Action>(supabase, 'actions', { projectIds: ids, order: 'code' }),
      fetchAll<ActionDependency>(supabase, 'action_dependencies', { projectIds: ids }),
      fetchAll<Milestone>(supabase, 'milestones', { projectIds: ids, order: 'planned_date' }),
      fetchAll<WbsItem>(supabase, 'wbs_items', { projectIds: ids, order: 'sort_order' }),
    ]);
    return { actions, deps, milestones, wbs };
  }, [project.id]);

  const openId = sp.get('acao');
  const canEdit = (a: Action) => canManage || a.owner_id === me;

  const visible = useMemo(() => {
    if (!data) return [];
    const k = q.trim().toLowerCase();
    return data.actions.filter(
      (a) =>
        (!fStatus || a.status === fStatus) &&
        (!fOwner || a.owner_id === fOwner) &&
        (!fPriority || a.priority === fPriority) &&
        (!onlyLate || isActionOverdue(a, today)) &&
        (!k || `${a.code} ${a.title} ${a.description ?? ''}`.toLowerCase().includes(k)),
    );
  }, [data, fStatus, fOwner, fPriority, onlyLate, q, today]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  const msOptions = data.milestones.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` }));
  const wbsOptions = data.wbs.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }));
  const fields = actionFields(memberOptions, msOptions, wbsOptions);
  const open = openId ? data.actions.find((a) => a.id === openId) : null;

  const setStatus = async (a: Action, status: string) => {
    if (a.status === status) return;
    if (status === 'bloqueada' && !a.blockers) {
      toast('error', 'Descreva o bloqueio no detalhe da ação antes de marcá-la como bloqueada.');
      setSp({ aba: 'acoes', acao: a.id }, { replace: true });
      return;
    }
    if (status === 'concluida') return setConfirmDone(a);
    try {
      await updateRow(supabase, 'actions', a.id, { status });
      toast('ok', `${a.code}: ${labelOf(ACTION_STATUS, status)}`);
      reload();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex rounded-lg border border-navy-600 p-0.5" role="group" aria-label="Visualização">
          {(
            [
              ['tabela', List, 'Tabela'],
              ['kanban', Columns3, 'Kanban'],
              ['cronograma', CalendarRange, 'Cronograma'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={clsx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm', view === v ? 'bg-teal-brand text-navy-950' : 'text-slate-300')}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {canManage && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nova ação
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <input className={inputCls} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ações" />
        <select className={inputCls} value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status">
          <option value="">Status: todos</option>
          {ACTION_STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select className={inputCls} value={fOwner} onChange={(e) => setFOwner(e.target.value)} aria-label="Responsável">
          <option value="">Responsável: todos</option>
          {memberOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select className={inputCls} value={fPriority} onChange={(e) => setFPriority(e.target.value)} aria-label="Prioridade">
          <option value="">Prioridade: todas</option>
          {PRIORITY.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} className="h-4 w-4 accent-teal-400" /> Só atrasadas
        </label>
      </div>

      {!visible.length ? (
        <EmptyState title={data.actions.length ? 'Nenhuma ação para os filtros' : 'Nenhuma ação cadastrada'} />
      ) : view === 'tabela' ? (
        <div className="overflow-x-auto rounded-xl border border-navy-700">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-navy-800 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Ação</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Prazo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Prioridade</th>
                <th className="px-3 py-2">Avanço</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {visible.map((a) => {
                const late = isActionOverdue(a, today);
                return (
                  <tr key={a.id} className="cursor-pointer hover:bg-navy-800/60" onClick={() => setSp({ aba: 'acoes', acao: a.id }, { replace: true })}>
                    <td className="px-3 py-2 font-mono text-xs text-teal-200">{a.code}</td>
                    <td className="max-w-sm px-3 py-2">
                      <span className="line-clamp-2 text-white">{a.title}</span>
                      {a.next_step && <span className="block truncate text-xs text-slate-500">→ {a.next_step}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{personName(a.owner_id)}</td>
                    <td className={clsx('whitespace-nowrap px-3 py-2', late ? 'font-semibold text-red-300' : 'text-slate-300')}>
                      {fmtDate(a.due_date)} {late && '⚠'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[a.status]}>{labelOf(ACTION_STATUS, a.status)}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[a.priority]}>{labelOf(PRIORITY, a.priority)}</Badge>
                    </td>
                    <td className="w-28 px-3 py-2">
                      <div className="h-1.5 rounded-full bg-navy-700">
                        <div className="h-1.5 rounded-full bg-teal-brand" style={{ width: `${a.progress}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-400">{a.progress}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : view === 'kanban' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid min-w-[1000px] grid-cols-5 gap-3">
            {ACTION_STATUS.map((col) => {
              const items = visible.filter((a) => a.status === col.value);
              return (
                <div
                  key={col.value}
                  className={clsx('rounded-xl border bg-navy-900/60 p-2', dragId ? 'border-teal-brand/40' : 'border-navy-700')}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const a = data.actions.find((x) => x.id === e.dataTransfer.getData('text/plain'));
                    setDragId(null);
                    if (a && canEdit(a)) setStatus(a, col.value);
                  }}
                  aria-label={`Coluna ${col.label}`}
                >
                  <p className="mb-2 flex justify-between px-1 text-xs font-bold uppercase tracking-wide text-slate-300">
                    {col.label} <span className="text-slate-500">{items.length}</span>
                  </p>
                  <div className="space-y-2">
                    {items.map((a) => (
                      <article
                        key={a.id}
                        draggable={canEdit(a)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', a.id);
                          setDragId(a.id);
                        }}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setSp({ aba: 'acoes', acao: a.id }, { replace: true })}
                        className={clsx(
                          'cursor-pointer rounded-lg border bg-navy-800 p-2.5 text-sm hover:border-teal-brand/60',
                          isActionOverdue(a, today) ? 'border-red-500/60' : 'border-navy-600',
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[11px] text-teal-200">{a.code}</span>
                          <Badge tone={STATUS_TONE[a.priority]}>{labelOf(PRIORITY, a.priority)}</Badge>
                        </div>
                        <p className="mt-1 line-clamp-3 text-white">{a.title}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {personName(a.owner_id)} · {fmtDate(a.due_date)}
                        </p>
                        {canEdit(a) && (
                          <select
                            className="mt-2 w-full rounded border border-navy-600 bg-navy-900 px-1 py-1 text-xs lg:hidden"
                            value={a.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setStatus(a, e.target.value)}
                            aria-label={`Mover ${a.code}`}
                          >
                            {ACTION_STATUS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Timeline actions={visible} milestones={data.milestones} onOpen={(id) => setSp({ aba: 'acoes', acao: id }, { replace: true })} />
      )}

      <Modal open={creating} title="Nova ação" onClose={() => setCreating(false)} wide>
        <EntityForm
          fields={fields}
          initial={{ status: 'nao_iniciada', priority: 'media', criticality: 'media', progress: 0 }}
          onCancel={() => setCreating(false)}
          onSubmit={async (vals) => {
            try {
              await insertRow(supabase, 'actions', { ...vals, project_id: project.id });
              toast('ok', 'Ação criada');
              setCreating(false);
              reload();
            } catch (e) {
              toast('error', (e as Error).message);
            }
          }}
        />
      </Modal>

      {open && (
        <ActionDetail
          action={open}
          fields={fields}
          deps={data.deps}
          all={data.actions}
          onClose={() => setSp({ aba: 'acoes' }, { replace: true })}
          onSaved={reload}
          onComplete={() => setConfirmDone(open)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDone}
        title="Concluir ação"
        message={
          <>
            Confirmar a conclusão de <strong>{confirmDone?.code}</strong>? O sistema registrará você como responsável pela conclusão, com data e hora. Recomenda-se informar a
            evidência no detalhe da ação.
          </>
        }
        confirmLabel="Concluir"
        onCancel={() => setConfirmDone(null)}
        onConfirm={async () => {
          try {
            await updateRow(supabase, 'actions', confirmDone!.id, { status: 'concluida' });
            toast('ok', `${confirmDone!.code} concluída e registrada`);
            setConfirmDone(null);
            reload();
          } catch (e) {
            toast('error', (e as Error).message);
          }
        }}
      />
    </div>
  );
}

function Timeline({ actions, milestones, onOpen }: { actions: Action[]; milestones: Milestone[]; onOpen: (id: string) => void }) {
  const rows = actions.filter((a) => a.due_date || a.start_date);
  const dates = [...rows.flatMap((a) => [parseDate(a.start_date), parseDate(a.due_date)]), ...milestones.map((m) => parseDate(m.planned_date))].filter(
    (x): x is number => x !== null,
  );
  if (!rows.length || !dates.length) return <EmptyState title="Cadastre início e prazo das ações para ver o cronograma" />;
  const today = todayUTC();
  const min = Math.min(...dates, today);
  const max = Math.max(...dates, today) + 86_400_000;
  const pos = (t: number) => ((t - min) / (max - min)) * 100;
  const months: { label: string; left: number }[] = [];
  const d = new Date(min);
  for (let y = d.getUTCFullYear(), m = d.getUTCMonth(); Date.UTC(y, m, 1) <= max; m++) {
    const t = Date.UTC(y, m, 1);
    if (t >= min) months.push({ label: new Date(t).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }), left: pos(t) });
    if (m === 11) {
      m = -1;
      y++;
    }
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-700 bg-navy-900/60 p-3">
      <div className="min-w-[760px]">
        <div className="relative ml-52 h-5 border-b border-navy-700 text-[10px] text-slate-400">
          {months.map((m) => (
            <span key={m.label + m.left} className="absolute" style={{ left: `${m.left}%` }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="relative">
          <div className="absolute bottom-0 top-0 ml-52 w-[calc(100%-13rem)]">
            <div className="absolute bottom-0 top-0 w-px bg-red-400/70" style={{ left: `${pos(today)}%` }} title="Hoje" />
            {milestones.map((m) => (
              <div key={m.id} className="absolute -top-1 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-cyan-brand" style={{ left: `${pos(parseDate(m.planned_date)!)}%` }} title={`Marco: ${m.name}`} />
            ))}
          </div>
          {rows.map((a) => {
            const s = parseDate(a.start_date) ?? parseDate(a.due_date)!;
            const e = (parseDate(a.due_date) ?? s) + 86_400_000;
            const late = isActionOverdue(a, today);
            return (
              <button key={a.id} onClick={() => onOpen(a.id)} className="flex h-8 w-full items-center text-left hover:bg-navy-800/50">
                <span className="w-52 shrink-0 truncate pr-2 text-xs text-slate-200">
                  <span className="font-mono text-teal-200">{a.code}</span> {a.title}
                </span>
                <span className="relative h-full flex-1">
                  <span
                    className={clsx(
                      'absolute top-2 h-4 rounded',
                      a.status === 'concluida' ? 'bg-teal-600' : late ? 'bg-red-500' : a.status === 'bloqueada' ? 'bg-orange-500' : 'bg-cyan-600',
                    )}
                    style={{ left: `${pos(s)}%`, width: `${Math.max(0.6, pos(e) - pos(s))}%` }}
                  >
                    <span className="absolute inset-y-0 left-0 rounded bg-white/25" style={{ width: `${a.progress}%` }} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Linha vermelha = hoje · losango = marco · faixa clara = % de avanço</p>
      </div>
    </div>
  );
}

function ActionDetail({ action: a, fields, deps, all, onClose, onSaved, onComplete }: {
  action: Action;
  fields: FieldDef[];
  deps: ActionDependency[];
  all: Action[];
  onClose: () => void;
  onSaved: () => void;
  onComplete: () => void;
}) {
  const { canManage, canContribute, me, personName, project } = useProject();
  const toast = useToast();
  const [tab, setTab] = useState('dados');
  const [comment, setComment] = useState('');
  const [depSel, setDepSel] = useState('');
  const owner = a.owner_id === me;
  const canEdit = canManage || owner;
  const comments = useAsync(() => fetchAll<ActionComment>(supabase, 'action_comments', { eq: { action_id: a.id }, order: 'created_at' }), [a.id]);
  const myDeps = deps.filter((d) => d.action_id === a.id);
  const code = new Map(all.map((x) => [x.id, x]));

  return (
    <Modal open title={`${a.code} — ${a.title}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={STATUS_TONE[a.status]}>{labelOf(ACTION_STATUS, a.status)}</Badge>
        <span className="text-slate-400">Responsável: {personName(a.owner_id)}</span>
        {a.completed_at && (
          <span className="text-teal-200">
            Concluída em {fmtDate(a.completed_at)} por {personName(a.completed_by)}
          </span>
        )}
        {canEdit && a.status !== 'concluida' && a.status !== 'cancelada' && (
          <Button variant="secondary" className="ml-auto" onClick={onComplete}>
            Concluir
          </Button>
        )}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'dados', label: 'Dados' },
          { id: 'comentarios', label: `Comentários${comments.data ? ` (${comments.data.length})` : ''}` },
          { id: 'dependencias', label: `Dependências (${myDeps.length})` },
          { id: 'evidencias', label: 'Anexos' },
          { id: 'historico', label: 'Histórico' },
        ]}
      />
      <div className="pt-4">
        {tab === 'dados' &&
          (canEdit ? (
            <EntityForm
              fields={fields}
              initial={a}
              locked={canManage ? [] : fields.map((f) => f.name).filter((n) => !OWNER_EDITABLE.includes(n))}
              onCancel={onClose}
              onSubmit={async (vals) => {
                try {
                  if (Object.keys(vals).length) await updateRow(supabase, 'actions', a.id, vals);
                  toast('ok', 'Ação salva');
                  onSaved();
                } catch (e) {
                  toast('error', (e as Error).message);
                }
              }}
            />
          ) : (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.name} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs text-slate-500">{f.label}</dt>
                  <dd className="whitespace-pre-wrap text-slate-100">
                    {f.type === 'select' ? labelOf(f.options ?? [], (a as any)[f.name]) : f.type === 'date' ? fmtDate((a as any)[f.name]) : ((a as any)[f.name] ?? '—')}
                  </dd>
                </div>
              ))}
            </dl>
          ))}
        {tab === 'comentarios' && (
          <div className="space-y-3">
            {comments.error && <ErrorBox error={comments.error} onRetry={comments.reload} />}
            <ul className="space-y-2">
              {(comments.data ?? []).map((c) => (
                <li key={c.id} className="rounded-lg border border-navy-700 bg-navy-800 p-3 text-sm">
                  <p className="whitespace-pre-wrap text-slate-100">{c.body}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {personName(c.author_id)} · {fmtDate(c.created_at)}
                  </p>
                </li>
              ))}
              {!comments.data?.length && <li className="text-sm text-slate-400">Sem comentários.</li>}
            </ul>
            {canContribute && (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  const { error } = await supabase.from('action_comments').insert({ project_id: project.id, action_id: a.id, body: comment.trim() });
                  if (error) return toast('error', friendlyError(error));
                  setComment('');
                  comments.reload();
                }}
              >
                <input className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva um comentário…" aria-label="Comentário" maxLength={5000} />
                <Button type="submit" aria-label="Enviar comentário">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            )}
          </div>
        )}
        {tab === 'dependencias' && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-400">Esta ação depende de:</p>
            <ul className="space-y-1">
              {myDeps.map((d) => {
                const dep = code.get(d.depends_on_id);
                return (
                  <li key={d.depends_on_id} className="flex items-center gap-2 rounded border border-navy-700 px-3 py-2">
                    <span className="font-mono text-xs text-teal-200">{dep?.code}</span>
                    <span className="flex-1">{dep?.title}</span>
                    {dep && <Badge tone={STATUS_TONE[dep.status]}>{labelOf(ACTION_STATUS, dep.status)}</Badge>}
                    {canManage && (
                      <button
                        aria-label="Remover dependência"
                        className="p-1 text-red-300"
                        onClick={async () => {
                          const { error } = await supabase.from('action_dependencies').delete().eq('action_id', a.id).eq('depends_on_id', d.depends_on_id);
                          if (error) toast('error', friendlyError(error));
                          else onSaved();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
              {!myDeps.length && <li className="text-slate-500">Nenhuma dependência.</li>}
            </ul>
            {canManage && (
              <div className="flex gap-2">
                <select className={inputCls} value={depSel} onChange={(e) => setDepSel(e.target.value)} aria-label="Adicionar dependência">
                  <option value="">Adicionar dependência…</option>
                  {all
                    .filter((x) => x.id !== a.id && !myDeps.some((d) => d.depends_on_id === x.id))
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.code} — {x.title}
                      </option>
                    ))}
                </select>
                <Button
                  disabled={!depSel}
                  onClick={async () => {
                    const { error } = await supabase.from('action_dependencies').insert({ project_id: project.id, action_id: a.id, depends_on_id: depSel });
                    if (error) return toast('error', friendlyError(error));
                    setDepSel('');
                    onSaved();
                  }}
                >
                  Adicionar
                </Button>
              </div>
            )}
          </div>
        )}
        {tab === 'evidencias' && <DocumentsPanel entityType="action" entityId={a.id} />}
        {tab === 'historico' && <AuditTable projectId={project.id} recordId={a.id} />}
      </div>
    </Modal>
  );
}
