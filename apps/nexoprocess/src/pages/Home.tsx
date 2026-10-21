// Início do app (V4): construído a partir do estado real do usuário.
// Sem projetos → proposta e formas de começar. Com projetos → retomar o trabalho.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, ChevronDown, Download, FileJson, FileSpreadsheet, FlaskConical, MessageSquareText, Plus, Search, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Callout, Card, Input, Segmented, Skeleton, useConfirm, useToast } from '../components/ui';
import { journey } from '../domain/journey';
import type { Workspace } from '../domain/types';
import { fmtDateTime } from '../domain/units';
import { db, exportBackup, parseBackup, restoreBackup, storageMode } from '../storage/db';
import { download, downloadTemplateCsv, downloadTemplateXlsx, openDemo } from '../state/actions';
import { STEP_PATH } from '../config/nav';
import { demoBlocked } from '../license/demo';
import InstallHint from '../components/InstallHint';

type Filter = 'todos' | 'andamento' | 'exemplo';

export default function Home() {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [mode, setMode] = useState(storageMode());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [moreOpen, setMoreOpen] = useState(false);
  const backupRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const all = await db.listWorkspaces();
      setList(all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch {
      setList([]);
    }
    setMode(storageMode());
  };
  useEffect(() => {
    void load();
  }, []);

  const demo = async (reset = false) => {
    const w = await openDemo(reset);
    nav(`/app/p/${w.id}/visao-geral`);
  };

  const remove = async (w: Workspace) => {
    if (!(await confirm({ title: 'Excluir projeto?', body: <>“{w.asIs.name}” e todos os cenários, ações e resultados serão apagados deste aparelho. Não dá para desfazer.</>, confirm: 'Excluir', danger: true }))) return;
    await db.deleteWorkspace(w.id);
    toast('ok', 'Projeto excluído.');
    void load();
  };

  const wipe = async () => {
    if (!(await confirm({ title: 'Apagar todos os dados locais?', body: <>Todos os projetos, rascunhos e preferências deste navegador serão apagados. Faça um backup antes se quiser guardar algo.</>, confirm: 'Apagar tudo', danger: true }))) return;
    await db.clearAll();
    toast('ok', 'Pronto, os dados deste aparelho foram apagados.');
    void load();
  };

  const backup = async () => {
    if (demoBlocked('exportar')) return;
    const b = await exportBackup();
    await download(`nexoprocess-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b, null, 2), 'application/json');
    toast('ok', `Backup com ${b.workspaces.length} projeto(s) baixado.`);
  };

  const restore = async (f: File, kind: 'projeto' | 'backup') => {
    if (demoBlocked('salvar')) return;
    try {
      const ws = parseBackup(await f.text());
      const n = await restoreBackup(ws);
      toast('ok', kind === 'projeto' ? `${n} projeto(s) importado(s). Ele(s) aparecem na lista abaixo.` : `${n} projeto(s) restaurado(s).`);
      void load();
    } catch (e) {
      toast('bad', `${e instanceof Error ? e.message : 'Arquivo inválido.'} Use um arquivo gerado pelo NexoProcess (.nexoprocess.json ou backup).`);
    }
  };

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list ?? [])
      .filter((w) => (filter === 'exemplo' ? w.isDemo : filter === 'andamento' ? !w.isDemo : true))
      .filter((w) => !term || w.asIs.name.toLowerCase().includes(term) || (w.asIs.area ?? '').toLowerCase().includes(term))
      .map((w) => ({ w, j: journey(w) }));
  }, [list, q, filter]);

  const real = (list ?? []).filter((w) => !w.isDemo);
  const hasProjects = (list?.length ?? 0) > 0;

  const fileInputs = (
    <>
      <input ref={projectRef} type="file" accept="application/json,.json" className="hidden" aria-label="Arquivo de projeto" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void restore(f, 'projeto');
        e.target.value = '';
      }} />
      <input ref={backupRef} type="file" accept="application/json,.json" className="hidden" aria-label="Arquivo de backup" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void restore(f, 'backup');
        e.target.value = '';
      }} />
    </>
  );

  const ways = (
    <div className="grid gap-3 md:grid-cols-3">
      <StartOption icon={<MessageSquareText className="h-5 w-5" />} title="Responder perguntas" text="Um assistente guiado, ideal no celular e para quem nunca mapeou um processo." cta="Criar com o assistente" primary onClick={() => nav('/app/novo')} />
      <StartOption icon={<FileSpreadsheet className="h-5 w-5" />} title="Importar planilha" text="XLSX ou CSV. Você confirma as colunas; a leitura acontece no seu navegador." cta="Importar planilha" onClick={() => nav('/app/importar')}>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void downloadTemplateXlsx()}>
            Baixar modelo XLSX
          </button>
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void downloadTemplateCsv()}>
            Baixar exemplo CSV
          </button>
        </div>
      </StartOption>
      <StartOption icon={<FlaskConical className="h-5 w-5" />} title="Explorar a demonstração" text="Processo de pedidos fictício, completo: mapa, diagnóstico, TO-BE e plano. Não mistura com seus projetos." cta="Abrir demonstração" onClick={() => void demo()} />
    </div>
  );

  return (
    <div className="safe-x mx-auto max-w-content space-y-6 py-8">
      {fileInputs}
      {mode === 'memoria' && (
        <Callout tone="warn" title="Armazenamento local indisponível">
          Este navegador bloqueou o banco local (comum em janelas anônimas). Você pode usar o app, mas os dados somem ao fechar a aba. Baixe um backup antes de sair.
        </Callout>
      )}

      {list === null ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : !hasProjects ? (
        <>
          <section className="max-w-3xl">
            <p className="eyebrow">Análise e melhoria de processos</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Entenda seu processo, encontre os gargalos e saia com um plano de melhoria.</h1>
            <p className="mt-3 text-base text-ink2">Você conta como o trabalho acontece hoje; nós desenhamos o mapa, mostramos onde estão o tempo e o desperdício e ajudamos a montar o plano de melhoria. Leva poucos minutos.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => nav('/app/novo')}>
                <Plus className="h-5 w-5" aria-hidden /> Mapear meu primeiro processo
              </Button>
              <Button size="lg" variant="secondary" onClick={() => nav('/app/importar')}>
                <FileSpreadsheet className="h-5 w-5" aria-hidden /> Importar planilha
              </Button>
              <Button size="lg" variant="ghost" onClick={() => void demo()}>
                Abrir demonstração <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </section>
          <ol className="grid gap-4 border-y border-line/10 py-6 md:grid-cols-3" aria-label="Como funciona">
            {[
              ['Levantar', 'Etapas, atividades, tempos e responsáveis — por perguntas ou planilha. Pode dizer “não sei”.'],
              ['Analisar', 'Mapa BPMN, tempo decorrido, esforço, esperas, retrabalho e oportunidades com evidência.'],
              ['Melhorar', 'Cenário futuro comparável, plano de ação e acompanhamento do que realmente mudou.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brandInk">{i + 1}</span>
                <div>
                  <p className="font-semibold">{t}</p>
                  <p className="text-sm text-ink2">{d}</p>
                </div>
              </li>
            ))}
          </ol>
          {/* As três formas de começar já estão no topo; aqui só os atalhos de quem chega com arquivo. */}
          <div className="grid gap-3 text-sm text-ink2 sm:grid-cols-2">
            <p>
              <span className="font-semibold text-ink">Já tem uma planilha?</span> Comece pelo modelo:{' '}
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void downloadTemplateXlsx()}>
                Baixar modelo XLSX
              </button>{' '}
              ·{' '}
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void downloadTemplateCsv()}>
                Baixar exemplo CSV
              </button>
            </p>
            <p>
              <span className="font-semibold text-ink">Trocou de aparelho?</span>{' '}
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => projectRef.current?.click()}>
                Importar projeto
              </button>{' '}
              ou{' '}
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => backupRef.current?.click()}>
                Restaurar backup
              </button>
              .
            </p>
          </div>
        </>
      ) : (
        <>
          {/* No celular os botões ficam sempre em linha própria: a troca da fonte reserva pela
              IBM Plex não pode mudar a quebra de linha (era a causa do CLS 0,146 em /app). */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Seu trabalho</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Meus projetos</h1>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button variant="secondary" onClick={() => projectRef.current?.click()}>
                <Upload className="h-4 w-4" aria-hidden /> Importar projeto
              </Button>
              <Button onClick={() => nav('/app/novo')}>
                <Plus className="h-4 w-4" aria-hidden /> Mapear novo processo
              </Button>
            </div>
          </div>

          {(list?.length ?? 0) > 2 && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input aria-label="Buscar projeto" placeholder="Buscar por nome ou área" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
              </div>
              <Segmented<Filter> label="Filtrar projetos" value={filter} onChange={setFilter} options={[{ value: 'todos', label: 'Todos' }, { value: 'andamento', label: 'Meus' }, { value: 'exemplo', label: 'Exemplo' }]} />
            </div>
          )}

          <ul className="divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/15 bg-surface shadow-card" aria-label="Projetos">
            {rows.map(({ w, j }) => {
              const done = j.steps.filter((s) => s.state === 'feito').length;
              const nextPath = j.next ? STEP_PATH[j.next.key] : 'visao-geral';
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/app/p/${w.id}/visao-geral`} className="font-semibold text-ink hover:text-accent">
                        {w.asIs.name}
                      </Link>
                      {w.isDemo && <Badge tone="amber">Exemplo fictício</Badge>}
                      {j.blocked && <Badge tone="bad">Dados com erro</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {w.asIs.area ? `${w.asIs.area} · ` : ''}
                      {w.asIs.activities.filter((a) => a.type === 'task').length} atividades · atualizado {fmtDateTime(w.updatedAt)}
                    </p>
                  </div>
                  <div className="w-full min-w-[9rem] sm:w-44">
                    <div className="flex justify-between text-xs text-muted">
                      <span>Etapa {done}/{j.steps.length}</span>
                      <span className="truncate pl-2">{j.next ? j.next.short : 'Concluído'}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label={`Andamento de ${w.asIs.name}`} aria-valuenow={done} aria-valuemin={0} aria-valuemax={j.steps.length}>
                      <div className="h-full rounded-full bg-accentStrong" style={{ width: `${(done / j.steps.length) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => nav(`/app/p/${w.id}/${nextPath}`)} aria-label={`Continuar${j.next ? `: ${j.next.short}` : ''} — ${w.asIs.name}`}>
                      Continuar{j.next ? `: ${j.next.short}` : ''}
                    </Button>
                    {w.isDemo && (
                      <Button size="sm" variant="ghost" onClick={() => void demo(true)} title="Recriar a demonstração do zero">
                        Reiniciar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => void remove(w)} aria-label={`Excluir ${w.asIs.name}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
            {!rows.length && <li className="p-6 text-center text-sm text-muted">Nada encontrado com esse filtro. Que tal tentar outro termo?</li>}
          </ul>
          {!real.length && (
            <Callout tone="info" title="Por enquanto, só a demonstração por aqui">
              Quando quiser, vamos mapear seu primeiro processo — respondendo perguntas ou a partir de uma planilha. Leva poucos minutos.
            </Callout>
          )}

          <section>
            <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-ink2 hover:text-ink">
              <ChevronDown className={clsx('h-4 w-4 transition-transform', moreOpen && 'rotate-180')} aria-hidden /> Outras formas de começar
            </button>
            {moreOpen && <div className="mt-2">{ways}</div>}
          </section>
        </>
      )}

      {/* Primeira visita: só a promessa de privacidade. Backup e limpeza aparecem quando há o que guardar. */}
      {list !== null && !hasProjects && (
        <p className="flex items-start gap-2 text-sm text-ink2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
          <span>
            Seus processos ficam salvos só neste aparelho; o conteúdo não é enviado a servidores.{' '}
            <Link to="/app/ajuda#privacidade" className="font-semibold text-accent hover:underline">
              Detalhes
            </Link>
          </span>
        </p>
      )}

      {/* Só depois de carregar a lista: evita deslocar o layout (CLS). */}
      {list !== null && hasProjects && (
        <Card title="Seus dados, seu controle" subtitle="Privacidade e continuidade">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="flex gap-3 text-sm text-ink2">
              <ShieldCheck className="h-6 w-6 shrink-0 text-ok" aria-hidden />
              <div className="space-y-1">
                <p>
                  Projetos e planilhas ficam apenas neste navegador (IndexedDB). O app não envia o conteúdo dos seus projetos a servidores e <strong>não sincroniza entre aparelhos</strong>.
                </p>
                <p>
                  Para continuar em outro aparelho: abra o projeto → Visão geral → <em>Gerar arquivo do projeto</em>; no outro aparelho use <em>Importar projeto</em>.{' '}
                  <Link to="/app/ajuda#privacidade" className="font-semibold text-accent hover:underline">
                    Detalhes
                  </Link>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Button size="sm" variant="secondary" onClick={() => void backup()}>
                <Download className="h-4 w-4" aria-hidden /> Baixar backup
              </Button>
              <Button size="sm" variant="secondary" onClick={() => backupRef.current?.click()}>
                <FileJson className="h-4 w-4" aria-hidden /> Restaurar backup
              </Button>
              <Button size="sm" variant="ghost" className="text-bad" onClick={() => void wipe()}>
                <Trash2 className="h-4 w-4" aria-hidden /> Apagar dados locais
              </Button>
            </div>
          </div>
          <InstallHint />
        </Card>
      )}
    </div>
  );
}

function StartOption({ icon, title, text, cta, onClick, primary, children }: { icon: React.ReactNode; title: string; text: string; cta: string; onClick: () => void; primary?: boolean; children?: React.ReactNode }) {
  return (
    <div className={clsx('flex flex-col rounded-2xl border bg-surface p-5 shadow-card', primary ? 'border-brand/30' : 'border-line/15')}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">{icon}</span>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-ink2">{text}</p>
      <Button className="mt-4 w-full" variant={primary ? 'primary' : 'secondary'} onClick={onClick}>
        {cta}
      </Button>
      {children}
    </div>
  );
}
