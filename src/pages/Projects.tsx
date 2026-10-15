import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAll, loadDataset } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { PRIORITY, PROJECT_STATUS, labelOf, type Option } from '../lib/constants';
import type { Profile } from '../lib/types';
import { projectKpis, todayUTC } from '../lib/kpi';
import { Badge, Button, Card, EmptyState, ErrorBox, Modal, ProgressBar, STATUS_TONE, Spinner, fmtDate, inputCls, useToast } from '../components/ui';
import { EntityForm, type FieldDef } from '../components/EntityManager';

export function projectFields(people: Option[]): FieldDef[] {
  return [
    { name: 'name', label: 'Nome', type: 'text', required: true, full: true },
    { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'objectives', label: 'Objetivos', type: 'textarea' },
    { name: 'justification', label: 'Justificativa', type: 'textarea' },
    { name: 'area', label: 'Área', type: 'text' },
    { name: 'stakeholders_summary', label: 'Stakeholders (resumo)', type: 'text' },
    { name: 'sponsor_id', label: 'Sponsor', type: 'select', options: people, hint: 'Usuários já vinculados a projetos seus ou cadastrados pelo admin' },
    { name: 'manager_id', label: 'Gerente', type: 'select', options: people },
    { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUS, required: true },
    { name: 'priority', label: 'Prioridade', type: 'select', options: PRIORITY, required: true },
    { name: 'planned_start', label: 'Início planejado', type: 'date' },
    { name: 'planned_end', label: 'Fim planejado', type: 'date' },
    { name: 'actual_start', label: 'Início real', type: 'date' },
    { name: 'actual_end', label: 'Fim real', type: 'date' },
    { name: 'budget_planned', label: 'Orçamento planejado (R$)', type: 'money', min: 0 },
    { name: 'budget_actual', label: 'Custo realizado (R$)', type: 'money', min: 0 },
    { name: 'progress_manual', label: 'Avanço manual (%)', type: 'int', min: 0, max: 100, hint: 'Usado só quando não há EAP nem ações' },
    { name: 'closure_notes', label: 'Notas de encerramento', type: 'textarea' },
  ];
}

export default function Projects() {
  const { profile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => loadDataset(supabase, { auditLimit: 0 }), []);
  const profiles = useAsync(() => fetchAll<Profile>(supabase, 'profiles', { order: 'email' }), []);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = Boolean(profile?.is_platform_admin || profile?.can_create_projects);
  const today = todayUTC();

  const rows = useMemo(() => {
    if (!data) return [];
    const k = q.trim().toLowerCase();
    return projectKpis(data, today).filter(
      (x) => (!status || x.project.status === status) && (!k || `${x.project.code} ${x.project.name} ${x.project.area ?? ''}`.toLowerCase().includes(k)),
    );
  }, [data, status, q, today]);

  const people = (profiles.data ?? []).map((p) => ({ value: p.id, label: p.full_name ? `${p.full_name} (${p.email})` : p.email }));
  const pmap = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.email]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="headline mr-auto text-2xl font-extrabold">Projetos</h1>
        <input className={inputCls + ' w-48'} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar projetos" />
        <select className={inputCls + ' w-44'} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar status">
          <option value="">Todos (inclui encerrados)</option>
          {PROJECT_STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Novo projeto
          </Button>
        )}
      </div>
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !rows.length ? (
        <EmptyState title="Nenhum projeto encontrado">{!canCreate && 'Você ainda não foi incluído em projetos.'}</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((k) => (
            <Link key={k.project.id} to={`/projetos/${k.project.id}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-brand">
              <Card className="h-full transition hover:border-teal-brand/60" tone={k.delayed ? 'alert' : 'default'}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-teal-200">{k.project.code}</p>
                    <p className="truncate font-bold text-white">{k.project.name}</p>
                    <p className="truncate text-xs text-slate-400">
                      {k.project.area ?? 'Sem área'} · Gerente: {k.project.manager_id ? pmap.get(k.project.manager_id) ?? '—' : '—'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={STATUS_TONE[k.project.status]}>{labelOf(PROJECT_STATUS, k.project.status)}</Badge>
                    {k.delayed && <Badge tone="red">Atrasado</Badge>}
                  </div>
                </div>
                <ProgressBar value={k.physical.value} planned={k.planned.value} />
                <div className="mt-2 flex justify-between text-xs text-slate-400">
                  <span>
                    {fmtDate(k.project.planned_start)} → {fmtDate(k.project.planned_end)}
                  </span>
                  <span className={k.overdueActions ? 'text-red-300' : ''}>{k.overdueActions} ação(ões) atrasada(s)</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Modal open={creating} title="Novo projeto" onClose={() => setCreating(false)} wide>
        <EntityForm
          fields={projectFields(people).filter((f) => !['actual_start', 'actual_end', 'budget_actual', 'closure_notes', 'progress_manual'].includes(f.name))}
          initial={{ status: 'planejado', priority: 'media' }}
          submitLabel="Criar projeto"
          onCancel={() => setCreating(false)}
          onSubmit={async (vals) => {
            // UUID gerado no cliente: o vínculo de gerente é criado por gatilho
            // e o registro é lido em seguida (ver docs/ARQUITETURA.md).
            const id = crypto.randomUUID();
            const { error } = await supabase.from('projects').insert({ ...vals, id });
            if (error) return toast('error', friendlyError(error));
            toast('ok', 'Projeto criado');
            setCreating(false);
            nav(`/projetos/${id}`);
          }}
        />
      </Modal>
    </div>
  );
}
