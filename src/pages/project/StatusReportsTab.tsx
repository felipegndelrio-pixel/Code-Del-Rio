import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useProject } from '../ProjectDetail';
import { supabase } from '../../lib/supabase';
import { fetchAll, insertRow } from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { HEALTH, labelOf } from '../../lib/constants';
import type { StatusReport } from '../../lib/types';
import { Badge, Button, Card, EmptyState, ErrorBox, Modal, STATUS_TONE, Spinner, fmtDate, useToast } from '../../components/ui';
import { EntityForm, type FieldDef } from '../../components/EntityManager';

const METRIC_LABEL: Record<string, string> = {
  acoes_total: 'Ações',
  acoes_concluidas: 'Concluídas',
  acoes_atrasadas: 'Atrasadas',
  acoes_bloqueadas: 'Bloqueadas',
  avanco_medio_acoes: 'Avanço médio (%)',
  riscos_abertos: 'Riscos abertos',
  riscos_altos: 'Riscos altos',
  problemas_abertos: 'Problemas abertos',
  decisoes_pendentes: 'Decisões pendentes',
};

const FIELDS: FieldDef[] = [
  { name: 'report_date', label: 'Data do relatório', type: 'date', required: true },
  { name: 'period_start', label: 'Período de', type: 'date' },
  { name: 'period_end', label: 'Período até', type: 'date' },
  { name: 'overall_health', label: 'Saúde geral', type: 'select', options: HEALTH, required: true },
  { name: 'schedule_health', label: 'Prazo', type: 'select', options: HEALTH },
  { name: 'cost_health', label: 'Custo', type: 'select', options: HEALTH },
  { name: 'scope_health', label: 'Escopo', type: 'select', options: HEALTH },
  { name: 'summary', label: 'Mensagem-chave', type: 'textarea', required: true },
  { name: 'achievements', label: 'Realizações do período', type: 'textarea' },
  { name: 'next_steps', label: 'Próximos passos', type: 'textarea' },
  { name: 'attention_points', label: 'Pontos de atenção / decisões necessárias', type: 'textarea' },
];

export default function StatusReportsTab() {
  const { project, canManage, personName } = useProject();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useAsync(
    () => fetchAll<StatusReport>(supabase, 'status_reports', { projectIds: [project.id], order: 'report_date', ascending: false }),
    [project.id],
  );
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Cada relatório grava um retrato dos indicadores calculado pelo servidor no momento da emissão.</p>
        {canManage && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Novo relatório
          </Button>
        )}
      </div>
      {!data?.length && <EmptyState title="Nenhum relatório de status emitido" />}
      {data?.map((r) => (
        <Card
          key={r.id}
          subtitle={`${r.code} · ${fmtDate(r.report_date)} · ${personName(r.author_id)}`}
          title={r.summary}
          tone={r.overall_health === 'vermelho' ? 'alert' : 'default'}
          action={
            <div className="flex flex-wrap gap-1">
              {(['overall_health', 'schedule_health', 'cost_health', 'scope_health'] as const).map(
                (k) =>
                  r[k] && (
                    <Badge key={k} tone={STATUS_TONE[r[k]!]}>
                      {{ overall_health: 'Geral', schedule_health: 'Prazo', cost_health: 'Custo', scope_health: 'Escopo' }[k]}: {labelOf(HEALTH, r[k])}
                    </Badge>
                  ),
              )}
            </div>
          }
        >
          <div className="grid gap-3 text-sm md:grid-cols-3">
            {[
              ['Realizações', r.achievements],
              ['Próximos passos', r.next_steps],
              ['Atenção / decisões', r.attention_points],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-slate-500">{k}</p>
                <p className="whitespace-pre-wrap text-slate-200">{v || '—'}</p>
              </div>
            ))}
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-navy-700 pt-2 text-xs text-slate-400">
            {Object.entries(METRIC_LABEL).map(([k, label]) =>
              r.metrics?.[k] !== undefined ? (
                <div key={k}>
                  <dt className="inline">{label}: </dt>
                  <dd className="inline font-semibold text-slate-200">{String(r.metrics[k])}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </Card>
      ))}
      <Modal open={creating} title="Novo relatório de status" onClose={() => setCreating(false)} wide>
        <EntityForm
          fields={FIELDS}
          initial={{ report_date: new Date().toISOString().slice(0, 10) }}
          onCancel={() => setCreating(false)}
          submitLabel="Emitir relatório"
          onSubmit={async (vals) => {
            try {
              await insertRow(supabase, 'status_reports', { ...vals, project_id: project.id });
              toast('ok', 'Relatório emitido');
              setCreating(false);
              reload();
            } catch (e) {
              toast('error', (e as Error).message);
            }
          }}
        />
      </Modal>
    </div>
  );
}
