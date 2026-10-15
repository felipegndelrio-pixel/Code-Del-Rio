import { useState } from 'react';
import clsx from 'clsx';
import { Link2, Trash2 } from 'lucide-react';
import { useProject } from '../ProjectDetail';
import { supabase } from '../../lib/supabase';
import { fetchAll } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { useAsync } from '../../hooks/useAsync';
import { MILESTONE_STATUS } from '../../lib/constants';
import type { Milestone, WbsDependency, WbsItem } from '../../lib/types';
import { criticalPath } from '../../lib/cpm';
import { isMilestoneLate, parseDate, todayUTC } from '../../lib/kpi';
import { Badge, Button, Card, ErrorBox, Modal, Spinner, fmtDate, inputCls, useToast } from '../../components/ui';
import { EntityManager, type FieldDef } from '../../components/EntityManager';

export default function ScheduleTab() {
  const { project, canManage, memberOptions, personName } = useProject();
  const toast = useToast();
  const [depFor, setDepFor] = useState<WbsItem | null>(null);
  const [pred, setPred] = useState('');
  const { data, error, loading, reload } = useAsync(async () => {
    const ids = [project.id];
    const [wbs, deps, milestones] = await Promise.all([
      fetchAll<WbsItem>(supabase, 'wbs_items', { projectIds: ids, order: 'sort_order' }),
      fetchAll<WbsDependency>(supabase, 'wbs_dependencies', { projectIds: ids }),
      fetchAll<Milestone>(supabase, 'milestones', { projectIds: ids, order: 'planned_date' }),
    ]);
    return { wbs, deps, milestones };
  }, [project.id]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  const byId = new Map(data.wbs.map((w) => [w.id, w]));
  const depth = (w: WbsItem): number => (w.parent_id && byId.get(w.parent_id) ? 1 + depth(byId.get(w.parent_id)!) : 0);
  const ordered = orderTree(data.wbs);
  const wbsOptions = data.wbs.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }));
  const cpm = criticalPath(data.wbs, data.deps);
  const today = todayUTC();

  const wbsFields: FieldDef[] = [
    {
      name: 'name',
      label: 'Nome',
      type: 'text',
      required: true,
      inTable: true,
      render: (r) => (
        <span style={{ paddingLeft: depth(r) * 14 }} className={clsx(r.is_deliverable && 'font-semibold text-white', cpm.ok && cpm.nodes[r.id]?.critical && 'text-red-300')}>
          {r.name}
          {r.is_deliverable && <Badge tone="teal">Entrega</Badge>}
        </span>
      ),
    },
    { name: 'parent_id', label: 'Item pai', type: 'select', options: wbsOptions },
    { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'is_deliverable', label: 'É entrega?', type: 'bool' },
    { name: 'owner_id', label: 'Responsável', type: 'select', options: memberOptions, inTable: true, render: (r) => personName(r.owner_id) },
    { name: 'planned_start', label: 'Início planejado', type: 'date', inTable: true },
    { name: 'planned_end', label: 'Fim planejado', type: 'date', inTable: true },
    { name: 'actual_start', label: 'Início real', type: 'date' },
    { name: 'actual_end', label: 'Fim real', type: 'date' },
    { name: 'progress', label: 'Avanço (%)', type: 'int', min: 0, max: 100, inTable: true, render: (r) => `${r.progress}%` },
    { name: 'weight', label: 'Peso', type: 'number', min: 0.01, hint: 'Ponderação no avanço físico' },
    { name: 'planned_cost', label: 'Custo planejado (R$)', type: 'money', min: 0 },
    { name: 'actual_cost', label: 'Custo real (R$)', type: 'money', min: 0 },
    { name: 'sort_order', label: 'Ordem', type: 'int' },
  ];
  const msFields: FieldDef[] = [
    { name: 'name', label: 'Marco', type: 'text', required: true, inTable: true },
    { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'wbs_item_id', label: 'Item da EAP', type: 'select', options: wbsOptions },
    { name: 'planned_date', label: 'Data planejada', type: 'date', required: true, inTable: true },
    { name: 'forecast_date', label: 'Data prevista', type: 'date', inTable: true },
    { name: 'actual_date', label: 'Data real', type: 'date', inTable: true, hint: 'Obrigatória para status Atingido' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: MILESTONE_STATUS,
      required: true,
      inTable: true,
      badge: true,
      render: (r) => (isMilestoneLate(r, today) ? <Badge tone="red">Vencido</Badge> : <Badge tone={r.status === 'atingido' ? 'green' : 'amber'}>{r.status}</Badge>),
    },
  ];

  return (
    <div className="space-y-6">
      <Card subtitle="Cronograma" title="Gantt da EAP e caminho crítico">
        <Gantt wbs={ordered} milestones={data.milestones} critical={cpm.ok ? new Set(cpm.criticalPath) : new Set()} depth={depth} />
        <p className={clsx('mt-3 text-sm', cpm.ok ? 'text-red-300' : 'text-slate-400')}>
          {cpm.ok
            ? `Caminho crítico (${cpm.projectDuration} dias corridos): ${cpm.criticalPath.map((id) => byId.get(id)?.code).join(' → ')}`
            : `Caminho crítico não calculado — ${cpm.reason}.`}
        </p>
      </Card>

      <EntityManager
        title="EAP / Entregas e atividades"
        table="wbs_items"
        projectId={project.id}
        rows={ordered}
        fields={wbsFields}
        reload={reload}
        canCreate={canManage}
        canEdit={() => canManage}
        canDelete={() => canManage}
        defaults={{ progress: 0, weight: 1, is_deliverable: false, sort_order: data.wbs.length + 1 }}
        extraActions={(r) =>
          canManage ? (
            <button className="rounded p-1.5 text-cyan-200 hover:bg-navy-700" onClick={() => setDepFor(r)} aria-label={`Dependências de ${r.code}`}>
              <Link2 className="h-4 w-4" />
            </button>
          ) : null
        }
        emptyHint="Estruture as entregas para habilitar avanço ponderado e caminho crítico."
      />

      <EntityManager
        title="Marcos"
        table="milestones"
        projectId={project.id}
        rows={data.milestones}
        fields={msFields}
        reload={reload}
        canCreate={canManage}
        canEdit={() => canManage}
        canDelete={() => canManage}
        defaults={{ status: 'pendente' }}
        filter={{ name: 'status', label: 'Status', options: MILESTONE_STATUS }}
      />

      <Modal open={!!depFor} title={`Predecessoras de ${depFor?.code}`} onClose={() => setDepFor(null)}>
        {depFor && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-400">Relação término-início: {depFor.name} só começa após o término das predecessoras.</p>
            <ul className="space-y-1">
              {data.deps
                .filter((d) => d.successor_id === depFor.id)
                .map((d) => (
                  <li key={d.predecessor_id} className="flex items-center gap-2 rounded border border-navy-700 px-3 py-2">
                    <span className="font-mono text-xs text-teal-200">{byId.get(d.predecessor_id)?.code}</span>
                    <span className="flex-1">{byId.get(d.predecessor_id)?.name}</span>
                    <button
                      className="p-1 text-red-300"
                      aria-label="Remover predecessora"
                      onClick={async () => {
                        const { error } = await supabase.from('wbs_dependencies').delete().eq('predecessor_id', d.predecessor_id).eq('successor_id', depFor.id);
                        if (error) toast('error', friendlyError(error));
                        else reload();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
            </ul>
            <div className="flex gap-2">
              <select className={inputCls} value={pred} onChange={(e) => setPred(e.target.value)} aria-label="Predecessora">
                <option value="">Selecione…</option>
                {data.wbs
                  .filter((w) => w.id !== depFor.id)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
              </select>
              <Button
                disabled={!pred}
                onClick={async () => {
                  const { error } = await supabase.from('wbs_dependencies').insert({ project_id: project.id, predecessor_id: pred, successor_id: depFor.id });
                  if (error) return toast('error', friendlyError(error));
                  setPred('');
                  reload();
                }}
              >
                Adicionar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function orderTree(items: WbsItem[]): WbsItem[] {
  const children = new Map<string | null, WbsItem[]>();
  const ids = new Set(items.map((i) => i.id));
  for (const i of items) {
    const k = i.parent_id && ids.has(i.parent_id) ? i.parent_id : null;
    children.set(k, [...(children.get(k) ?? []), i]);
  }
  const out: WbsItem[] = [];
  const walk = (k: string | null) => {
    for (const c of (children.get(k) ?? []).sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))) {
      out.push(c);
      walk(c.id);
    }
  };
  walk(null);
  return out;
}

function Gantt({ wbs, milestones, critical, depth }: { wbs: WbsItem[]; milestones: Milestone[]; critical: Set<string>; depth: (w: WbsItem) => number }) {
  const rows = wbs.filter((w) => w.planned_start && w.planned_end);
  const ds = [...rows.flatMap((w) => [parseDate(w.planned_start)!, parseDate(w.planned_end)!]), ...milestones.map((m) => parseDate(m.planned_date)!)];
  if (!rows.length) return <p className="text-sm text-slate-400">Cadastre itens da EAP com início e fim planejados para ver o Gantt.</p>;
  const today = todayUTC();
  const min = Math.min(...ds);
  const max = Math.max(...ds) + 86_400_000;
  const pos = (t: number) => ((t - min) / (max - min)) * 100;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {rows.map((w) => {
          const s = parseDate(w.planned_start)!;
          const e = parseDate(w.planned_end)! + 86_400_000;
          return (
            <div key={w.id} className="flex h-7 items-center">
              <span className="w-56 shrink-0 truncate pr-2 text-xs text-slate-200" style={{ paddingLeft: depth(w) * 10 }}>
                <span className="font-mono text-teal-200">{w.code}</span> {w.name}
              </span>
              <span className="relative h-full flex-1 border-l border-navy-700">
                {today >= min && today <= max && <span className="absolute bottom-0 top-0 w-px bg-red-400/60" style={{ left: `${pos(today)}%` }} />}
                <span
                  className={clsx('absolute top-1.5 h-4 rounded', critical.has(w.id) ? 'bg-red-500' : w.is_deliverable ? 'bg-cyan-600' : 'bg-teal-700')}
                  style={{ left: `${pos(s)}%`, width: `${Math.max(0.6, pos(e) - pos(s))}%` }}
                  title={`${fmtDate(w.planned_start)} → ${fmtDate(w.planned_end)} · ${w.progress}%`}
                >
                  <span className="absolute inset-y-0 left-0 rounded bg-white/30" style={{ width: `${w.progress}%` }} />
                </span>
              </span>
            </div>
          );
        })}
        {milestones.map((m) => (
          <div key={m.id} className="flex h-6 items-center">
            <span className="w-56 shrink-0 truncate pr-2 text-xs text-cyan-200">◆ {m.name}</span>
            <span className="relative h-full flex-1 border-l border-navy-700">
              <span
                className={clsx('absolute top-1.5 h-3 w-3 -translate-x-1/2 rotate-45', m.status === 'atingido' ? 'bg-teal-400' : isMilestoneLate(m, today) ? 'bg-red-500' : 'bg-cyan-400')}
                style={{ left: `${pos(parseDate(m.planned_date)!)}%` }}
                title={fmtDate(m.planned_date)}
              />
            </span>
          </div>
        ))}
        <p className="mt-2 text-[11px] text-slate-500">Vermelho = caminho crítico · linha vermelha = hoje · faixa clara = avanço</p>
      </div>
    </div>
  );
}
