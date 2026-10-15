// Dados de EXEMPLO (fictícios) para o modo demonstração. Nomes, valores e
// projetos são inventados e identificados com "(exemplo)".
type Internal = {
  insert: (t: string, r: Record<string, any>) => Record<string, any>;
  update: (t: string, row: Record<string, any>, patch: Record<string, any>) => Record<string, any>;
  rows: (t: string) => Record<string, any>[];
};

export const DEMO_PEOPLE = [
  { id: '00000000-0000-4000-8000-000000000001', email: 'voce@demo.local', full_name: 'Você (demo)', is_platform_admin: true, can_create_projects: true },
  { id: '00000000-0000-4000-8000-000000000002', email: 'ana@exemplo.demo', full_name: 'Ana Souza (exemplo)' },
  { id: '00000000-0000-4000-8000-000000000003', email: 'bruno@exemplo.demo', full_name: 'Bruno Lima (exemplo)' },
  { id: '00000000-0000-4000-8000-000000000004', email: 'carla@exemplo.demo', full_name: 'Carla Mendes (exemplo)' },
  { id: '00000000-0000-4000-8000-000000000005', email: 'diego@exemplo.demo', full_name: 'Diego Rocha (exemplo)' },
];

export function seedDemo(db: Internal) {
  const d = (n: number) => {
    const t = new Date();
    t.setDate(t.getDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const [me, ana, bruno, carla, diego] = DEMO_PEOPLE.map((p) => p.id);
  for (const p of DEMO_PEOPLE)
    db.rows('profiles').push({ is_platform_admin: false, can_create_projects: false, area: null, active: true, created_at: new Date().toISOString(), ...p });

  const done = (row: Record<string, any>, daysAgo: number) => {
    row.completed_at = `${d(-daysAgo)}T15:00:00.000Z`;
    row.completed_by = row.owner_id ?? me;
  };

  // 1) Projeto em andamento com EAP, dependências e caminho crítico
  const erp = db.insert('projects', {
    name: 'Implantação de ERP (exemplo)', area: 'Tecnologia', status: 'em_andamento', priority: 'alta',
    description: 'Substituir sistemas legados de compras, estoque e financeiro.',
    objectives: 'Fechamento contábil em D+3; integração de compras e estoque.', justification: 'Sistemas sem suporte e retrabalho manual.',
    sponsor_id: ana, manager_id: me, planned_start: d(-120), planned_end: d(90), actual_start: d(-118),
    budget_planned: 850000, budget_actual: 410000,
  });
  for (const [u, role] of [[bruno, 'responsavel'], [carla, 'responsavel'], [diego, 'observador']] as const)
    db.insert('project_members', { project_id: erp.id, user_id: u, role });
  const w = (name: string, s: number, e: number, progress: number, extra: Record<string, any> = {}) =>
    db.insert('wbs_items', { project_id: erp.id, name, planned_start: d(s), planned_end: d(e), progress, is_deliverable: true, ...extra });
  const w1 = w('Desenho de processos', -120, -75, 100, { sort_order: 1, weight: 1 });
  const w2 = w('Configuração e customização', -74, -10, 70, { sort_order: 2, weight: 3 });
  const w3 = w('Migração de dados', -40, 30, 35, { sort_order: 3, weight: 2 });
  const w4 = w('Testes integrados e treinamento', 31, 75, 0, { sort_order: 4, weight: 2 });
  const w5 = w('Go-live e operação assistida', 76, 90, 0, { sort_order: 5, weight: 1 });
  for (const [a, b] of [[w1, w2], [w2, w4], [w3, w4], [w4, w5]]) db.insert('wbs_dependencies', { project_id: erp.id, predecessor_id: a.id, successor_id: b.id });
  const m1 = db.insert('milestones', { project_id: erp.id, wbs_item_id: w1.id, name: 'Desenho aprovado', planned_date: d(-75), actual_date: d(-73), status: 'atingido' });
  db.insert('milestones', { project_id: erp.id, wbs_item_id: w3.id, name: 'Carga de dados validada', planned_date: d(20), status: 'pendente' });
  db.insert('milestones', { project_id: erp.id, wbs_item_id: w5.id, name: 'Go-live', planned_date: d(90), status: 'pendente' });
  const a = (title: string, owner: string, s: number, due: number, extra: Record<string, any> = {}) =>
    db.insert('actions', { project_id: erp.id, title, owner_id: owner, start_date: d(s), due_date: d(due), ...extra });
  const a1 = a('Mapear processos de compras', bruno, -118, -90, { status: 'concluida', priority: 'alta', evidence: 'Fluxos aprovados em comitê', milestone_id: m1.id });
  done(a1, 88);
  const a2 = a('Parametrizar plano de contas', carla, -60, -15, { status: 'concluida', evidence: 'Plano de contas carregado em homologação' });
  done(a2, 12);
  const a3 = a('Definir regras de integração com bancos', bruno, -45, -5, { status: 'em_andamento', progress: 60, priority: 'critica', criticality: 'alta', next_step: 'Validar layout CNAB com tesouraria' });
  a('Limpar cadastro de fornecedores', carla, -30, 10, { status: 'bloqueada', progress: 40, priority: 'alta', blockers: 'Aguardando acesso à base legada (TI infraestrutura)', criticality: 'alta' });
  const a5 = a('Carga piloto de estoque', me, -10, 25, { status: 'em_andamento', progress: 25 });
  a('Plano de treinamento de usuários-chave', ana, 20, 60, { priority: 'media' });
  a('Roteiro de testes integrados', bruno, 25, 50, { priority: 'alta' });
  db.insert('action_dependencies', { project_id: erp.id, action_id: a5.id, depends_on_id: a3.id });
  db.insert('risks', { project_id: erp.id, title: 'Qualidade dos dados legados abaixo do esperado', category: 'Dados', probability: 4, impact: 4, owner_id: carla, response_strategy: 'mitigar', response_plan: 'Saneamento prévio e regras de validação na carga', status: 'em_tratamento', review_date: d(7) });
  db.insert('risks', { project_id: erp.id, title: 'Indisponibilidade de usuários-chave para testes', category: 'Pessoas', probability: 3, impact: 4, owner_id: ana, response_strategy: 'mitigar', response_plan: 'Agenda reservada com diretores', status: 'aberto' });
  db.insert('risks', { project_id: erp.id, title: 'Atraso do fornecedor na entrega de customizações', category: 'Fornecedor', probability: 4, impact: 5, owner_id: me, response_strategy: 'transferir', response_plan: 'Multa contratual e marco de aceite', status: 'aberto', review_date: d(3) });
  db.insert('decisions', { project_id: erp.id, title: 'Aprovar escopo adicional de relatórios fiscais', context: 'Fiscal solicitou 6 relatórios fora do escopo.', options: 'A) incluir agora (+R$ 45 mil); B) fase 2', owner_id: ana, due_date: d(5) });
  db.insert('change_requests', { project_id: erp.id, title: 'Incluir módulo de contratos', justification: 'Exigência de auditoria', requested_by_name: 'Jurídico (exemplo)', impact_schedule_days: 15, impact_cost: 60000, status: 'em_analise' });
  const s1 = db.insert('stakeholders', { project_id: erp.id, name: 'Diretoria Financeira (exemplo)', influence: 'alta', interest: 'alta', engagement_current: 'apoiador', engagement_desired: 'lider' });
  const s2 = db.insert('stakeholders', { project_id: erp.id, name: 'Equipe de Compras (exemplo)', influence: 'media', interest: 'alta', engagement_current: 'neutro', engagement_desired: 'apoiador' });
  const s3 = db.insert('stakeholders', { project_id: erp.id, name: 'TI Infraestrutura (exemplo)', influence: 'alta', interest: 'media', engagement_current: 'resistente', engagement_desired: 'apoiador' });
  for (const [act, st, r] of [['Go-live', s1, 'A'], ['Go-live', s3, 'R'], ['Go-live', s2, 'C'], ['Migração de dados', s3, 'R'], ['Migração de dados', s1, 'A'], ['Migração de dados', s2, 'I']] as const)
    db.insert('raci_assignments', { project_id: erp.id, activity: act, stakeholder_id: st.id, raci: r });
  db.insert('issues', { project_id: erp.id, title: 'Ambiente de homologação instável', severity: 'alta', owner_id: bruno, status: 'em_analise', due_date: d(4) });
  db.insert('status_reports', { project_id: erp.id, overall_health: 'amarelo', schedule_health: 'amarelo', cost_health: 'verde', scope_health: 'verde', summary: 'Configuração avança; migração de dados é o ponto de atenção.', achievements: 'Plano de contas parametrizado.', next_steps: 'Carga piloto de estoque.', attention_points: 'Decidir escopo de relatórios fiscais até sexta.' });

  // 2) Projeto atrasado e acima do orçamento
  const cd = db.insert('projects', {
    name: 'Expansão do Centro Logístico (exemplo)', area: 'Operações', status: 'em_andamento', priority: 'critica',
    sponsor_id: diego, manager_id: carla, planned_start: d(-200), planned_end: d(-10), actual_start: d(-195),
    budget_planned: 1200000, budget_actual: 1350000, objectives: 'Ampliar capacidade de armazenagem em 40%.',
  });
  db.insert('project_members', { project_id: cd.id, user_id: bruno, role: 'responsavel' });
  const c = (title: string, owner: string, s: number, due: number, extra: Record<string, any> = {}) =>
    db.insert('actions', { project_id: cd.id, title, owner_id: owner, start_date: d(s), due_date: d(due), ...extra });
  const c1 = c('Obter licença ambiental', carla, -200, -150, { status: 'concluida', evidence: 'Licença nº 0000 (exemplo)' });
  done(c1, 140);
  const c2 = c('Concluir obra civil', bruno, -150, -30, { status: 'concluida' });
  done(c2, 12);
  c('Instalar porta-paletes', bruno, -40, -12, { status: 'em_andamento', progress: 70, priority: 'critica', criticality: 'alta' });
  c('Integrar WMS ao novo layout', me, -25, -3, { status: 'em_andamento', progress: 30, priority: 'alta' });
  c('Contratar e treinar equipe do turno B', carla, -20, 15, { status: 'nao_iniciada', priority: 'alta' });
  db.insert('risks', { project_id: cd.id, title: 'Multa por atraso na entrega ao cliente âncora', probability: 5, impact: 4, owner_id: carla, response_strategy: 'mitigar', response_plan: 'Operação temporária em armazém terceiro', status: 'aberto' });
  db.insert('risks', { project_id: cd.id, title: 'Estouro adicional de custos de obra', probability: 3, impact: 3, owner_id: diego, response_strategy: 'aceitar', status: 'aberto' });
  db.insert('milestones', { project_id: cd.id, name: 'Operação inicial', planned_date: d(-10), forecast_date: d(20), status: 'pendente' });
  db.insert('decisions', { project_id: cd.id, title: 'Aprovar aditivo de R$ 150 mil', owner_id: diego, due_date: d(2) });
  db.insert('issues', { project_id: cd.id, title: 'Fornecedor de porta-paletes com entrega parcial', severity: 'critica', owner_id: bruno, status: 'aberto' });

  // 3) Projeto no prazo
  const rc = db.insert('projects', {
    name: 'Programa de Redução de Custos (exemplo)', area: 'Financeiro', status: 'em_andamento', priority: 'media',
    sponsor_id: ana, manager_id: me, planned_start: d(-60), planned_end: d(120), budget_planned: 150000, budget_actual: 40000,
  });
  const r = (title: string, owner: string, s: number, due: number, extra: Record<string, any> = {}) =>
    db.insert('actions', { project_id: rc.id, title, owner_id: owner, start_date: d(s), due_date: d(due), ...extra });
  const r1 = r('Renegociar contratos de energia', ana, -60, -20, { status: 'concluida' });
  done(r1, 22);
  r('Consolidar fornecedores de facilities', me, -30, 30, { status: 'em_andamento', progress: 55 });
  r('Revisar política de viagens', ana, 0, 45, {});
  db.insert('change_requests', { project_id: rc.id, title: 'Incluir frota no escopo', status: 'submetida', impact_cost: 20000 });
  db.insert('lessons_learned', { project_id: rc.id, category: 'Compras', situation: 'Renegociação conduzida com dados de consumo de 24 meses.', what_worked: 'Base histórica fortaleceu a negociação.', recommendation: 'Levantar histórico antes de toda renegociação.' });

  // 4) Projeto concluído (continua consultável)
  const ok = db.insert('projects', {
    name: 'Migração de e-mail para nuvem (exemplo)', area: 'Tecnologia', status: 'em_andamento', manager_id: me,
    planned_start: d(-300), planned_end: d(-200), actual_start: d(-298), budget_planned: 90000, budget_actual: 82000,
  });
  const o1 = db.insert('actions', { project_id: ok.id, title: 'Migrar caixas de correio', owner_id: me, start_date: d(-290), due_date: d(-210), status: 'concluida' });
  done(o1, 205);
  db.update('projects', ok, { status: 'concluido', actual_end: d(-198), closure_notes: 'Entregue dentro do orçamento.' });
}
