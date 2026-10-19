// Edição do AS-IS: dados do processo, atividades, custos por função,
// restauração do original, cópias de segurança e histórico.
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { History, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ActivityForm } from '../../components/ActivityForm';
import { Badge, Button, Callout, Card, Drawer, Field, Input, NumberInput, Select, Table, td, Term, Textarea, th, useConfirm, useToast } from '../../components/ui';
import { newActivity, nextActivityId, normalizeStages } from '../../domain/factory';
import { sortedActivities } from '../../domain/graph';
import { LEAN_LABEL, TYPE_LABEL, type Activity, type Period } from '../../domain/types';
import { fmtDateTime, fmtDuration, nowIso, uid } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

export default function DataTab() {
  const { w, update, issues } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const p = w.asIs;
  const [editing, setEditing] = useState<Activity | null>(null);
  const [isNew, setIsNew] = useState(false);
  const acts = useMemo(() => sortedActivities(p), [p]);
  const owners = useMemo(() => [...new Set(p.activities.map((a) => a.owner?.trim()).filter(Boolean) as string[])].sort(), [p.activities]);
  const issueCount = (id: string) => issues.filter((i) => i.activityId === id && i.severity !== 'info').length;

  const setProc = (patch: Partial<typeof p>, msg?: string) =>
    update(
      (d) => {
        Object.assign(d.asIs, patch);
      },
      msg ? { area: 'Processo', message: msg } : undefined,
    );

  const saveActivity = () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast('bad', 'Dê um nome à atividade.');
      return;
    }
    update(
      (d) => {
        const i = d.asIs.activities.findIndex((a) => a.id === editing.id);
        const clean = { ...editing, stage: editing.stage.trim() || 'Sem etapa', name: editing.name.trim() };
        if (i >= 0) d.asIs.activities[i] = clean;
        else d.asIs.activities.push(clean);
        d.asIs = normalizeStages(d.asIs);
        d.validationAcceptedAt = undefined;
      },
      { area: 'AS-IS', message: `${isNew ? 'Adicionada' : 'Editada'} atividade “${editing.name}”` },
    );
    setEditing(null);
    toast('ok', 'Atividade salva.');
  };

  const remove = async (a: Activity) => {
    const refs = p.activities.filter((x) => x.next.includes(a.id) || x.nextYes === a.id || x.nextNo === a.id);
    if (!(await confirm({ title: `Excluir “${a.name}”?`, body: <>{refs.length ? `${refs.length} atividade(s) apontam para ela; essas ligações serão removidas e a validação mostrará o que ajustar.` : 'A atividade será removida do AS-IS.'} Uma cópia do AS-IS atual fica guardada.</>, confirm: 'Excluir', danger: true }))) return;
    update(
      (d) => {
        d.snapshots = [...d.snapshots, { id: uid('snap_'), at: nowIso(), label: `Antes de excluir “${a.name}”`, process: structuredClone(d.asIs) }].slice(-15);
        d.asIs.activities = d.asIs.activities.filter((x) => x.id !== a.id).map((x) => ({ ...x, next: x.next.filter((n) => n !== a.id), nextYes: x.nextYes === a.id ? undefined : x.nextYes, nextNo: x.nextNo === a.id ? undefined : x.nextNo }));
        d.asIs = normalizeStages(d.asIs);
        d.validationAcceptedAt = undefined;
      },
      { area: 'AS-IS', message: `Excluída atividade “${a.name}”` },
    );
  };

  const restoreBaseline = async () => {
    if (!(await confirm({ title: 'Restaurar o AS-IS original?', body: 'O AS-IS volta a ser exatamente como foi criado/importado. A versão atual fica guardada nas cópias de segurança. Cenários TO-BE não são alterados.', confirm: 'Restaurar' }))) return;
    update(
      (d) => {
        d.snapshots = [...d.snapshots, { id: uid('snap_'), at: nowIso(), label: 'Antes de restaurar o original', process: structuredClone(d.asIs) }].slice(-15);
        d.asIs = structuredClone(d.asIsBaseline);
        d.validationAcceptedAt = undefined;
      },
      { area: 'AS-IS', message: 'AS-IS restaurado para o original' },
    );
    toast('ok', 'AS-IS original restaurado.');
  };

  const restoreSnapshot = async (id: string) => {
    const s = w.snapshots.find((x) => x.id === id)!;
    if (!(await confirm({ title: 'Voltar para esta cópia?', body: `“${s.label}” (${fmtDateTime(s.at)}). A versão atual também será guardada.`, confirm: 'Restaurar cópia' }))) return;
    update(
      (d) => {
        d.snapshots = [...d.snapshots, { id: uid('snap_'), at: nowIso(), label: 'Antes de restaurar uma cópia', process: structuredClone(d.asIs) }].slice(-15);
        d.asIs = structuredClone(s.process);
        d.validationAcceptedAt = undefined;
      },
      { area: 'AS-IS', message: `Restaurada a cópia “${s.label}”` },
    );
  };

  return (
    <div className="space-y-4">
      {w.scenarios.length > 0 && (
        <Callout tone="info">
          Você está editando o processo atual (AS-IS). Os cenários TO-BE já criados são cópias independentes e não mudam com estas edições.
        </Callout>
      )}
      <Card title="Dados do processo" subtitle="AS-IS — como funciona hoje">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Nome do processo" required className="md:col-span-2">
            {(f) => <Input {...f} value={p.name} onChange={(e) => setProc({ name: e.target.value })} />}
          </Field>
          <Field label="Área">{(f) => <Input {...f} value={p.area ?? ''} onChange={(e) => setProc({ area: e.target.value || undefined })} />}</Field>
          <Field label="Descrição" className="md:col-span-2">
            {(f) => <Textarea {...f} value={p.description ?? ''} onChange={(e) => setProc({ description: e.target.value || undefined })} />}
          </Field>
          <Field label="Dono do processo">{(f) => <Input {...f} value={p.processOwner ?? ''} onChange={(e) => setProc({ processOwner: e.target.value || undefined })} />}</Field>
          <div className="flex gap-2">
            <Field label="Volume de execuções" help="Vazio = não informado." className="flex-1">
              {(f) => <NumberInput {...f} value={p.volume} onChange={(v) => setProc({ volume: v })} />}
            </Field>
            <Field label="por" className="w-28">
              {(f) => (
                <Select {...f} value={p.volumePeriod} onChange={(e) => setProc({ volumePeriod: e.target.value as Period })}>
                  <option value="dia">dia</option>
                  <option value="semana">semana</option>
                  <option value="mes">mês</option>
                  <option value="ano">ano</option>
                </Select>
              )}
            </Field>
          </div>
          {p.volumePeriod === 'dia' && (
            <Field label="Dias de operação por mês" help="Necessário para converter o volume diário em mensal.">
              {(f) => <NumberInput {...f} value={p.operatingDaysPerMonth} onChange={(v) => setProc({ operatingDaysPerMonth: v })} />}
            </Field>
          )}
          <Field label="Horas de trabalho por dia" help="Premissa para converter durações em dias.">
            {(f) => <NumberInput {...f} value={p.hoursPerDay} onChange={(v) => v && v <= 24 && setProc({ hoursPerDay: v })} />}
          </Field>
          <Field label="Custo-hora padrão (R$)" help="Carregado: salário + encargos + benefícios ÷ horas. Vazio = sem custo.">
            {(f) => <NumberInput {...f} value={p.defaultCostPerHour} onChange={(v) => setProc({ defaultCostPerHour: v })} />}
          </Field>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink2 md:col-span-3">
            <input type="checkbox" className="h-4 w-4" checked={!!p.variableCostIncludesLabor} onChange={(e) => setProc({ variableCostIncludesLabor: e.target.checked })} />
            O custo variável informado nas atividades já inclui mão de obra (evita somar o mesmo custo duas vezes).
          </label>
        </div>
        {owners.length > 0 && (
          <details className="mt-3 rounded-xl border border-line/15 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Custo-hora por função ({Object.keys(p.costPerHourByRole).length}/{owners.length} informados)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {owners.map((o) => (
                <Field key={o} label={o}>
                  {(f) => (
                    <NumberInput
                      {...f}
                      value={p.costPerHourByRole[o]}
                      onChange={(v) =>
                        update((d) => {
                          if (v === undefined) delete d.asIs.costPerHourByRole[o];
                          else d.asIs.costPerHourByRole[o] = v;
                        })
                      }
                      placeholder="R$/h"
                    />
                  )}
                </Field>
              ))}
            </div>
          </details>
        )}
      </Card>

      <Card
        title={`Atividades (${acts.length})`}
        subtitle="Clique para editar"
        action={
          <Button
            size="sm"
            onClick={() => {
              setIsNew(true);
              setEditing(newActivity({ id: nextActivityId(p), stage: p.stageOrder[p.stageOrder.length - 1] ?? 'Etapa 1', name: '', order: Math.max(0, ...p.activities.map((a) => a.order)) + 1 }));
            }}
          >
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        }
      >
        <div className="hidden md:block">
          <Table caption="Atividades do processo atual">
            <thead>
              <tr>
                {['#', 'Código', 'Etapa', 'Atividade', 'Tipo', 'Duração', 'Pessoas', 'Responsável', 'Lean', ''].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {acts.map((a) => (
                <tr key={a.id} className="hover:bg-surface2/50">
                  <td className={clsx(td, 'tabular')}>{a.order}</td>
                  <td className={clsx(td, 'font-mono text-xs')}>{a.id}</td>
                  <td className={td}>{a.stage}</td>
                  <td className={clsx(td, 'text-ink')}>
                    <button type="button" className="text-left font-medium hover:text-brand" onClick={() => (setIsNew(false), setEditing(structuredClone(a)))}>
                      {a.name}
                    </button>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {a.rework && <Badge tone="amber">retrabalho</Badge>}
                      {a.critical && <Badge tone="violet">crítica</Badge>}
                      {issueCount(a.id) > 0 && <Badge tone="bad">{issueCount(a.id)} pendência(s)</Badge>}
                      {a.flowInferred && <Badge tone="muted">ligação inferida</Badge>}
                    </div>
                  </td>
                  <td className={td}>{TYPE_LABEL[a.type]}</td>
                  <td className={clsx(td, 'tabular')}>{a.type === 'task' ? fmtDuration(a.duration, a.unit) : '—'}</td>
                  <td className={clsx(td, 'tabular')}>{a.people ?? '—'}</td>
                  <td className={td}>{a.owner ?? '—'}</td>
                  <td className={td}>{a.type === 'task' || a.type === 'decision' ? LEAN_LABEL[a.lean ?? 'U'] : '—'}</td>
                  <td className={clsx(td, 'whitespace-nowrap')}>
                    <Button size="sm" variant="ghost" aria-label={`Editar ${a.name}`} onClick={() => (setIsNew(false), setEditing(structuredClone(a)))}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Excluir ${a.name}`} onClick={() => void remove(a)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <ul className="space-y-2 md:hidden">
          {acts.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => (setIsNew(false), setEditing(structuredClone(a)))} className="w-full rounded-xl border border-line/15 bg-surface2/40 p-3 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{a.id}</span>
                  <span className="font-semibold text-ink">{a.name}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-ink2">
                  <span>{a.stage}</span>
                  <span>· {TYPE_LABEL[a.type]}</span>
                  {a.type === 'task' && <span>· {fmtDuration(a.duration, a.unit)}</span>}
                  {a.owner && <span>· {a.owner}</span>}
                  {issueCount(a.id) > 0 && <Badge tone="bad">{issueCount(a.id)} pendência(s)</Badge>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Versões do AS-IS" subtitle="Original e cópias de segurança">
          <p className="text-sm text-ink2">
            O <Term k="asis">AS-IS</Term> original ({w.source.kind === 'import' ? `importado de ${w.source.fileName}` : w.source.kind === 'demo' ? 'exemplo' : 'criado pelo assistente'}) fica preservado e pode ser restaurado a qualquer momento.
          </p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => void restoreBaseline()}>
            <RotateCcw className="h-4 w-4" /> Restaurar AS-IS original
          </Button>
          {w.snapshots.length > 0 && (
            <ul className="mt-3 divide-y divide-line/10 text-sm">
              {[...w.snapshots].reverse().map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-ink2">
                    {s.label} <span className="text-muted">· {fmtDateTime(s.at)}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void restoreSnapshot(s.id)}>
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Histórico de alterações" subtitle={<span className="inline-flex items-center gap-1"><History className="h-3 w-3" /> Neste dispositivo</span>}>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {[...w.history].reverse().slice(0, 60).map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-xs text-muted tabular">{fmtDateTime(h.at)}</span>
                <span className="text-ink2">
                  <strong className="text-ink">{h.area}:</strong> {h.message}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? 'Nova atividade' : `Editar ${editing?.id ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={saveActivity}>Salvar</Button>
          </>
        }
      >
        {editing && <ActivityForm value={editing} onChange={setEditing} all={p.activities} stages={p.stageOrder} />}
      </Drawer>
    </div>
  );
}
