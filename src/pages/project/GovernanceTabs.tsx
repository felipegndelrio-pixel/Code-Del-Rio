import { useState } from 'react';
import { useProject } from '../ProjectDetail';
import { supabase } from '../../lib/supabase';
import { fetchAll, type Table } from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import {
  CHANGE_STATUS,
  DECISION_STATUS,
  ENGAGEMENT,
  ISSUE_STATUS,
  LEVEL,
  PRIORITY,
  RISK_STATUS,
  RISK_STRATEGY,
  SCALE_1_5,
  labelOf,
} from '../../lib/constants';
import { Badge, Card, ErrorBox, Spinner, fmtDate } from '../../components/ui';
import { EntityManager, type FieldDef } from '../../components/EntityManager';
import { RiskMatrix } from '../../components/charts';
import { isOpenRisk } from '../../lib/kpi';

function useRows<T>(table: Table) {
  const { project } = useProject();
  return useAsync(() => fetchAll<T>(supabase, table, { projectIds: [project.id], order: 'code' }), [project.id, table]);
}

export function RisksTab() {
  const { project, canManage, memberOptions, personName } = useProject();
  const { data, error, loading, reload } = useRows<any>('risks');
  const [cell, setCell] = useState<{ p: number; i: number } | null>(null);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const rows = (data ?? []).filter((r) => !cell || (r.probability === cell.p && r.impact === cell.i));
  const fields: FieldDef[] = [
    { name: 'title', label: 'Risco', type: 'text', required: true, inTable: true, full: true },
    { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'category', label: 'Categoria', type: 'text' },
    { name: 'cause', label: 'Causa', type: 'textarea' },
    { name: 'effect', label: 'Efeito', type: 'textarea' },
    { name: 'probability', label: 'Probabilidade', type: 'select', options: SCALE_1_5, required: true },
    { name: 'impact', label: 'Impacto', type: 'select', options: SCALE_1_5, required: true },
    {
      name: 'score',
      label: 'P×I',
      type: 'int',
      inTable: true,
      tableOnly: true,
      render: (r) => <span className={r.score >= 15 ? 'font-bold text-red-400' : r.score >= 8 ? 'text-orange-300' : 'text-slate-200'}>{r.score}</span>,
    },
    { name: 'owner_id', label: 'Responsável', type: 'select', options: memberOptions, inTable: true, render: (r) => personName(r.owner_id) },
    { name: 'response_strategy', label: 'Estratégia de resposta', type: 'select', options: RISK_STRATEGY, inTable: true },
    { name: 'response_plan', label: 'Plano de resposta', type: 'textarea' },
    { name: 'contingency_plan', label: 'Plano de contingência', type: 'textarea' },
    { name: 'trigger_event', label: 'Gatilho', type: 'textarea' },
    { name: 'status', label: 'Status', type: 'select', options: RISK_STATUS, required: true, inTable: true, badge: true },
    { name: 'review_date', label: 'Próxima revisão', type: 'date', inTable: true },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card subtitle="Riscos abertos" title="Matriz P × I">
        <RiskMatrix risks={(data ?? []).filter(isOpenRisk)} onCell={(p, i) => setCell(cell && cell.p === p && cell.i === i ? null : { p, i })} />
        {cell && (
          <button className="mt-2 text-xs text-teal-200 underline" onClick={() => setCell(null)}>
            Limpar filtro P{cell.p}×I{cell.i}
          </button>
        )}
        <p className="mt-3 text-[11px] text-slate-400">Severidade = probabilidade × impacto (1–25). Alto ≥ 15, médio 8–14.</p>
      </Card>
      <EntityManager
        title="Registro de riscos"
        table="risks"
        projectId={project.id}
        rows={rows}
        fields={fields}
        reload={reload}
        canCreate={canManage}
        canEdit={() => canManage}
        canDelete={() => canManage}
        defaults={{ status: 'aberto', probability: 3, impact: 3 }}
        filter={{ name: 'status', label: 'Status', options: RISK_STATUS }}
      />
    </div>
  );
}

export function IssuesTab() {
  const { project, canManage, canContribute, memberOptions, personName, me } = useProject();
  const { data, error, loading, reload } = useRows<any>('issues');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const fields: FieldDef[] = [
    { name: 'title', label: 'Problema / impedimento', type: 'text', required: true, inTable: true, full: true },
    { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'severity', label: 'Severidade', type: 'select', options: PRIORITY, required: true, inTable: true, badge: true },
    { name: 'owner_id', label: 'Responsável', type: 'select', options: memberOptions, inTable: true, render: (r) => personName(r.owner_id) },
    { name: 'status', label: 'Status', type: 'select', options: ISSUE_STATUS, required: true, inTable: true, badge: true },
    { name: 'opened_on', label: 'Aberto em', type: 'date', inTable: true },
    { name: 'due_date', label: 'Prazo', type: 'date', inTable: true },
    { name: 'resolved_on', label: 'Resolvido em', type: 'date' },
    { name: 'resolution', label: 'Resolução', type: 'textarea' },
  ];
  return (
    <EntityManager
      title="Problemas e impedimentos"
      table="issues"
      projectId={project.id}
      rows={data ?? []}
      fields={fields}
      reload={reload}
      canCreate={canContribute}
      canEdit={(r) => canManage || r.owner_id === me}
      canDelete={() => canManage}
      lockedFor={(r) => (canManage || r.owner_id !== me ? [] : ['title', 'owner_id', 'severity'])}
      defaults={{ status: 'aberto', severity: 'media' }}
      filter={{ name: 'status', label: 'Status', options: ISSUE_STATUS }}
    />
  );
}

export function ChangesTab() {
  const { project, canManage, personName } = useProject();
  const { data, error, loading, reload } = useRows<any>('change_requests');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const fields: FieldDef[] = [
    { name: 'title', label: 'Solicitação de mudança', type: 'text', required: true, inTable: true, full: true },
    { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'justification', label: 'Justificativa', type: 'textarea' },
    { name: 'requested_by_name', label: 'Solicitante', type: 'text', inTable: true },
    { name: 'impact_scope', label: 'Impacto em escopo', type: 'textarea' },
    { name: 'impact_schedule_days', label: 'Impacto em prazo (dias)', type: 'int', inTable: true },
    { name: 'impact_cost', label: 'Impacto em custo (R$)', type: 'money', inTable: true },
    { name: 'status', label: 'Status', type: 'select', options: CHANGE_STATUS, required: true, inTable: true, badge: true },
    { name: 'decision_notes', label: 'Parecer', type: 'textarea' },
    {
      name: 'decided_at',
      label: 'Decisão',
      type: 'text',
      inTable: true,
      tableOnly: true,
      render: (r) => (r.decided_at ? `${personName(r.decided_by)} · ${fmtDate(r.decided_at)}` : '—'),
    },
  ];
  return (
    <EntityManager
      title="Solicitações de mudança"
      table="change_requests"
      projectId={project.id}
      rows={data ?? []}
      fields={fields}
      reload={reload}
      canCreate={canManage}
      canEdit={() => canManage}
      canDelete={() => canManage}
      defaults={{ status: 'submetida' }}
      filter={{ name: 'status', label: 'Status', options: CHANGE_STATUS }}
    />
  );
}

export function DecisionsTab() {
  const { project, canManage, memberOptions, personName } = useProject();
  const { data, error, loading, reload } = useRows<any>('decisions');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const fields: FieldDef[] = [
    { name: 'title', label: 'Decisão necessária', type: 'text', required: true, inTable: true, full: true },
    { name: 'context', label: 'Contexto', type: 'textarea' },
    { name: 'options', label: 'Opções avaliadas', type: 'textarea' },
    { name: 'decision', label: 'Decisão tomada', type: 'textarea' },
    { name: 'impact', label: 'Impacto', type: 'textarea' },
    { name: 'owner_id', label: 'Quem decide', type: 'select', options: memberOptions, inTable: true, render: (r) => personName(r.owner_id) },
    { name: 'due_date', label: 'Prazo', type: 'date', inTable: true },
    { name: 'status', label: 'Status', type: 'select', options: DECISION_STATUS, required: true, inTable: true, badge: true },
  ];
  return (
    <EntityManager
      title="Decisões e aprovações"
      table="decisions"
      projectId={project.id}
      rows={data ?? []}
      fields={fields}
      reload={reload}
      canCreate={canManage}
      canEdit={() => canManage}
      canDelete={() => canManage}
      defaults={{ status: 'pendente' }}
      filter={{ name: 'status', label: 'Status', options: DECISION_STATUS }}
      extraActions={(r) =>
        r.decided_at ? (
          <span className="mr-2 text-[11px] text-slate-400">
            {personName(r.decided_by)} · {fmtDate(r.decided_at)}
          </span>
        ) : null
      }
    />
  );
}

export function StakeholdersTab() {
  const { project, canManage } = useProject();
  const { data, error, loading, reload } = useRows<any>('stakeholders');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const fields: FieldDef[] = [
    { name: 'name', label: 'Nome', type: 'text', required: true, inTable: true },
    { name: 'organization', label: 'Organização', type: 'text', inTable: true },
    { name: 'role_title', label: 'Cargo / papel', type: 'text', inTable: true },
    { name: 'email', label: 'E-mail', type: 'text' },
    { name: 'influence', label: 'Influência', type: 'select', options: LEVEL, inTable: true },
    { name: 'interest', label: 'Interesse', type: 'select', options: LEVEL, inTable: true },
    { name: 'engagement_current', label: 'Engajamento atual', type: 'select', options: ENGAGEMENT, inTable: true },
    { name: 'engagement_desired', label: 'Engajamento desejado', type: 'select', options: ENGAGEMENT, inTable: true },
    { name: 'strategy', label: 'Estratégia de engajamento', type: 'textarea' },
  ];
  const quadrant = (inf: string | null, int: string | null) => {
    const hi = (x: string | null) => x === 'alta';
    return hi(inf) && hi(int) ? 'Gerenciar de perto' : hi(inf) ? 'Manter satisfeito' : hi(int) ? 'Manter informado' : 'Monitorar';
  };
  const groups = ['Gerenciar de perto', 'Manter satisfeito', 'Manter informado', 'Monitorar'];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {groups.map((g) => {
          const items = (data ?? []).filter((s) => quadrant(s.influence, s.interest) === g);
          return (
            <Card key={g} subtitle="Poder × interesse" title={g}>
              <ul className="space-y-1 text-sm">
                {items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{s.name}</span>
                    {s.engagement_current && s.engagement_desired && s.engagement_current !== s.engagement_desired && (
                      <Badge tone="orange">{labelOf(ENGAGEMENT, s.engagement_current)}→{labelOf(ENGAGEMENT, s.engagement_desired)}</Badge>
                    )}
                  </li>
                ))}
                {!items.length && <li className="text-slate-500">—</li>}
              </ul>
            </Card>
          );
        })}
      </div>
      <EntityManager
        title="Stakeholders"
        table="stakeholders"
        projectId={project.id}
        rows={data ?? []}
        fields={fields}
        reload={reload}
        canCreate={canManage}
        canEdit={() => canManage}
        canDelete={() => canManage}
      />
    </div>
  );
}

export function LessonsTab() {
  const { project, canManage, canContribute, me, personName } = useProject();
  const { data, error, loading, reload } = useRows<any>('lessons_learned');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const fields: FieldDef[] = [
    { name: 'category', label: 'Categoria', type: 'text', inTable: true },
    { name: 'situation', label: 'Situação', type: 'textarea', required: true, inTable: true },
    { name: 'what_worked', label: 'O que funcionou', type: 'textarea' },
    { name: 'what_to_improve', label: 'O que melhorar', type: 'textarea' },
    { name: 'recommendation', label: 'Recomendação', type: 'textarea', inTable: true },
    { name: 'created_by', label: 'Registrado por', type: 'text', inTable: true, tableOnly: true, render: (r) => personName(r.created_by) },
  ];
  return (
    <EntityManager
      title="Lições aprendidas"
      table="lessons_learned"
      projectId={project.id}
      rows={data ?? []}
      fields={fields}
      reload={reload}
      canCreate={canContribute}
      canEdit={(r) => canManage || r.created_by === me}
      canDelete={() => canManage}
    />
  );
}
