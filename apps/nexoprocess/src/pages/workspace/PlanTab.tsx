import { useState } from 'react';
import clsx from 'clsx';
import { ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Callout, Card, Drawer, Empty, Field, Input, Segmented, Select, Table, td, Textarea, th, useConfirm, useToast } from '../../components/ui';
import type { ActionItem, ActionStatus, Priority } from '../../domain/types';
import { fmtDate, nowIso, uid } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

export const ACTION_STATUS: Record<ActionStatus, string> = { a_fazer: 'A fazer', em_andamento: 'Em andamento', bloqueada: 'Bloqueada', concluida: 'Concluída', cancelada: 'Cancelada' };
const PRIO: Record<Priority, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

const blank = (): ActionItem => ({ id: uid('act_'), description: '', priority: 'media', status: 'a_fazer', origin: { kind: 'manual' }, createdAt: nowIso() });

export default function PlanTab() {
  const { w, update } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<ActionItem | null>(null);
  const [filter, setFilter] = useState<'todas' | 'abertas' | 'concluida'>('todas');
  const today = new Date().toISOString().slice(0, 10);
  const overdue = (a: ActionItem) => !!a.due && a.due < today && a.status !== 'concluida' && a.status !== 'cancelada';

  const save = () => {
    if (!edit?.description.trim()) {
      toast('bad', 'Descreva a ação.');
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

  const fromChanges = () => {
    const sc = w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0];
    if (!sc) return;
    const fresh = sc.changes.filter((c) => !w.actions.some((a) => a.origin?.ref === c.id) && c.kind !== 'restore');
    if (!fresh.length) {
      toast('info', 'Todas as mudanças do TO-BE já têm ação no plano.');
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
    toast('ok', `${fresh.length} ação(ões) criadas. Defina responsáveis e prazos.`);
  };

  const list = w.actions.filter((a) => (filter === 'todas' ? true : filter === 'concluida' ? a.status === 'concluida' : a.status !== 'concluida' && a.status !== 'cancelada'));
  const changeCount = (w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0])?.changes.length ?? 0;

  return (
    <div className="space-y-4">
      <Card
        title="Plano de ação"
        subtitle="Quem faz o quê, até quando"
        action={
          <div className="flex flex-wrap gap-2">
            {changeCount > 0 && (
              <Button size="sm" variant="secondary" onClick={fromChanges}>
                <ListPlus className="h-4 w-4" /> Gerar do TO-BE
              </Button>
            )}
            <Button size="sm" onClick={() => setEdit(blank())}>
              <Plus className="h-4 w-4" /> Nova ação
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Segmented label="Filtro" value={filter} onChange={setFilter} options={[{ value: 'todas', label: `Todas (${w.actions.length})` }, { value: 'abertas', label: 'Abertas' }, { value: 'concluida', label: 'Concluídas' }]} />
          <span className="text-xs text-muted">Responsável e prazo nunca são preenchidos automaticamente — ficam “pendente” até você definir.</span>
        </div>
        {!w.actions.length ? (
          <Empty title="Nenhuma ação ainda">Gere ações a partir das mudanças do TO-BE, crie a partir de recomendações aceitas, ou adicione manualmente.</Empty>
        ) : (
          <>
            <div className="hidden md:block">
              <Table caption="Ações do plano">
                <thead>
                  <tr>
                    {['Ação', 'Responsável', 'Prazo', 'Prioridade', 'Situação', 'Indicador de sucesso', ''].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a.id} className={clsx(overdue(a) && 'bg-bad/5')}>
                      <td className={clsx(td, 'text-ink')}>
                        {a.description}
                        {a.origin?.kind !== 'manual' && <span className="block text-xs text-muted">origem: {a.origin?.kind === 'recommendation' ? 'recomendação' : 'mudança do TO-BE'}</span>}
                      </td>
                      <td className={td}>{a.owner || <Badge tone="amber">pendente</Badge>}</td>
                      <td className={td}>{a.due ? <span className={clsx(overdue(a) && 'font-semibold text-bad')}>{fmtDate(a.due)}{overdue(a) && ' · atrasada'}</span> : <Badge tone="amber">pendente</Badge>}</td>
                      <td className={td}>
                        <Badge tone={a.priority === 'alta' ? 'bad' : a.priority === 'media' ? 'amber' : 'muted'}>{PRIO[a.priority]}</Badge>
                      </td>
                      <td className={td}>
                        <Select aria-label={`Situação de ${a.description}`} value={a.status} onChange={(e) => update((d) => void (d.actions.find((x) => x.id === a.id)!.status = e.target.value as ActionStatus), { area: 'Plano de ação', message: `${a.description}: ${ACTION_STATUS[e.target.value as ActionStatus]}` })}>
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
            <ul className="space-y-2 md:hidden">
              {list.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setEdit(structuredClone(a))} className={clsx('w-full rounded-xl border p-3 text-left', overdue(a) ? 'border-bad/40' : 'border-line/15')}>
                    <p className="font-semibold text-ink">{a.description}</p>
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      <Badge tone="accent">{ACTION_STATUS[a.status]}</Badge>
                      <Badge tone={a.priority === 'alta' ? 'bad' : 'muted'}>{PRIO[a.priority]}</Badge>
                      <span className="text-ink2">{a.owner ?? 'responsável pendente'}</span>
                      <span className={clsx('text-ink2', overdue(a) && 'text-bad')}>· {a.due ? fmtDate(a.due) : 'prazo pendente'}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      {w.actions.some(overdue) && <Callout tone="bad">{w.actions.filter(overdue).length} ação(ões) com prazo vencido.</Callout>}

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
                  <Select {...f} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as ActionStatus })}>
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
            <Field label="Valor esperado" help="Ex.: −80 pessoa-h/mês (estimado no TO-BE).">
              {(f) => <Input {...f} value={edit.expectedValue ?? ''} onChange={(e) => setEdit({ ...edit, expectedValue: e.target.value || undefined })} />}
            </Field>
            <Field label="Critério de conclusão">{(f) => <Input {...f} value={edit.doneCriteria ?? ''} onChange={(e) => setEdit({ ...edit, doneCriteria: e.target.value || undefined })} />}</Field>
          </div>
        )}
      </Drawer>
    </div>
  );
}

