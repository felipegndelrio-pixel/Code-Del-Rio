import { createContext, useContext, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ApiError, fetchAll } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { PROJECT_STATUS, ROLE_LABEL, labelOf, type Option } from '../lib/constants';
import type { MemberRole, Profile, Project, ProjectMember } from '../lib/types';
import { Badge, ErrorBox, STATUS_TONE, Spinner, Tabs } from '../components/ui';
import Overview from './project/Overview';
import ActionsTab from './project/ActionsTab';
import ScheduleTab from './project/ScheduleTab';
import { ChangesTab, DecisionsTab, IssuesTab, LessonsTab, RisksTab, StakeholdersTab } from './project/GovernanceTabs';
import RaciTab from './project/RaciTab';
import StatusReportsTab from './project/StatusReportsTab';
import DocumentsPanel from './project/DocumentsPanel';
import MembersTab from './project/MembersTab';
import AuditTable from './project/AuditTable';

export interface ProjectCtxValue {
  project: Project;
  members: ProjectMember[];
  profiles: Profile[];
  memberOptions: Option[];
  personName: (id: string | null | undefined) => string;
  role: MemberRole | null;
  isAdmin: boolean;
  canManage: boolean;
  canContribute: boolean;
  me: string;
  reload: () => void;
}

const ProjectCtx = createContext<ProjectCtxValue | null>(null);
export const useProject = () => {
  const v = useContext(ProjectCtx);
  if (!v) throw new Error('useProject fora do contexto');
  return v;
};

const TABS = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'acoes', label: 'Plano de ação' },
  { id: 'cronograma', label: 'Cronograma & EAP' },
  { id: 'riscos', label: 'Riscos' },
  { id: 'problemas', label: 'Problemas' },
  { id: 'mudancas', label: 'Mudanças' },
  { id: 'decisoes', label: 'Decisões' },
  { id: 'stakeholders', label: 'Stakeholders' },
  { id: 'raci', label: 'RACI' },
  { id: 'relatorios', label: 'Status reports' },
  { id: 'licoes', label: 'Lições' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'membros', label: 'Membros' },
  { id: 'historico', label: 'Histórico' },
];

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('aba') ?? 'visao';
  const { profile, session } = useAuth();
  const { data, error, loading, reload } = useAsync(async () => {
    const [p, members, profiles] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).maybeSingle(),
      fetchAll<ProjectMember>(supabase, 'project_members', { projectIds: [id] }),
      fetchAll<Profile>(supabase, 'profiles', { order: 'email' }),
    ]);
    if (p.error) throw new ApiError(p.error);
    return { project: p.data as Project | null, members, profiles };
  }, [id]);

  const ctx = useMemo<ProjectCtxValue | null>(() => {
    if (!data?.project || !session) return null;
    const me = session.user.id;
    const role = data.members.find((m) => m.user_id === me)?.role ?? null;
    const isAdmin = Boolean(profile?.is_platform_admin);
    const names = new Map(data.profiles.map((p) => [p.id, p.full_name || p.email]));
    const memberIds = new Set(data.members.map((m) => m.user_id));
    return {
      project: data.project,
      members: data.members,
      profiles: data.profiles,
      memberOptions: data.profiles.filter((p) => memberIds.has(p.id)).map((p) => ({ value: p.id, label: p.full_name ? `${p.full_name}` : p.email })),
      personName: (pid) => (pid ? (names.get(pid) ?? 'Usuário sem acesso visível') : '—'),
      role,
      isAdmin,
      canManage: isAdmin || role === 'gerente' || role === 'sponsor',
      canContribute: isAdmin || role === 'gerente' || role === 'sponsor' || role === 'responsavel',
      me,
      reload,
    };
  }, [data, session, profile, reload]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data?.project || !ctx)
    return <ErrorBox error="Projeto não encontrado ou você não tem acesso a ele." />;

  const p = data.project;
  return (
    <ProjectCtx.Provider value={ctx}>
      <div className="space-y-4">
        <div>
          <Link to="/projetos" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
            <ChevronLeft className="h-3.5 w-3.5" /> Projetos
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-teal-200">{p.code}</span>
            <h1 className="mr-auto text-xl font-extrabold text-white sm:text-2xl">{p.name}</h1>
            <Badge tone={STATUS_TONE[p.status]}>{labelOf(PROJECT_STATUS, p.status)}</Badge>
            <Badge tone="cyan">{ctx.isAdmin && !ctx.role ? 'Administrador' : ctx.role ? ROLE_LABEL[ctx.role] : '—'}</Badge>
          </div>
        </div>
        <Tabs tabs={TABS} value={tab} onChange={(t) => setSp({ aba: t }, { replace: true })} />
        <div>
          {tab === 'visao' && <Overview />}
          {tab === 'acoes' && <ActionsTab />}
          {tab === 'cronograma' && <ScheduleTab />}
          {tab === 'riscos' && <RisksTab />}
          {tab === 'problemas' && <IssuesTab />}
          {tab === 'mudancas' && <ChangesTab />}
          {tab === 'decisoes' && <DecisionsTab />}
          {tab === 'stakeholders' && <StakeholdersTab />}
          {tab === 'raci' && <RaciTab />}
          {tab === 'relatorios' && <StatusReportsTab />}
          {tab === 'licoes' && <LessonsTab />}
          {tab === 'documentos' && <DocumentsPanel entityType="project" entityId={null} showAll />}
          {tab === 'membros' && <MembersTab />}
          {tab === 'historico' && <AuditTable projectId={p.id} />}
        </div>
      </div>
    </ProjectCtx.Provider>
  );
}
