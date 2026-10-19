import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Database, Download, FileSpreadsheet, FlaskConical, ShieldCheck, Trash2, Upload, Wand2 } from 'lucide-react';
import { Badge, Button, Callout, Card, Empty, Skeleton, useConfirm, useToast } from '../components/ui';
import type { Workspace } from '../domain/types';
import { fmtDateTime } from '../domain/units';
import { db, exportBackup, parseBackup, restoreBackup, storageMode } from '../storage/db';
import { download, downloadTemplateCsv, downloadTemplateXlsx, openDemo } from '../state/actions';

export default function Home() {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [mode, setMode] = useState(storageMode());
  const fileRef = useRef<HTMLInputElement>(null);

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
    nav(`/app/p/${w.id}/mapa`);
  };

  const remove = async (w: Workspace) => {
    if (!(await confirm({ title: 'Excluir processo?', body: <>“{w.asIs.name}” e todos os cenários, ações e resultados serão apagados deste aparelho. Não dá para desfazer.</>, confirm: 'Excluir', danger: true }))) return;
    await db.deleteWorkspace(w.id);
    toast('ok', 'Processo excluído.');
    void load();
  };

  const wipe = async () => {
    if (!(await confirm({ title: 'Apagar todos os dados locais?', body: <>Todos os processos, rascunhos e preferências deste navegador serão apagados. Faça um backup antes se quiser guardar algo.</>, confirm: 'Apagar tudo', danger: true }))) return;
    await db.clearAll();
    toast('ok', 'Dados locais apagados.');
    void load();
  };

  const backup = async () => {
    const b = await exportBackup();
    download(`nexoprocess-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b, null, 2), 'application/json');
    toast('ok', `Backup com ${b.workspaces.length} processo(s) baixado.`);
  };

  const restore = async (f: File) => {
    try {
      const ws = parseBackup(await f.text());
      const n = await restoreBackup(ws);
      toast('ok', `${n} processo(s) restaurado(s).`);
      void load();
    } catch (e) {
      toast('bad', e instanceof Error ? e.message : 'Backup inválido.');
    }
  };

  const real = list?.filter((w) => !w.isDemo) ?? [];
  const demoW = list?.find((w) => w.isDemo);

  return (
    <div className="safe-x mx-auto max-w-6xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Como você quer começar?</h1>
        <p className="mt-1 text-ink2">Escolha um caminho. Você pode trocar depois, sem perder nada.</p>
      </div>
      {mode === 'memoria' && (
        <Callout tone="warn" title="Armazenamento local indisponível">
          Este navegador bloqueou o banco local (comum em janelas anônimas). Você pode usar o app, mas os dados somem ao fechar a aba. Baixe um backup antes de sair.
        </Callout>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StartCard icon={<Wand2 className="h-7 w-7 text-violet" />} title="Começar sem planilha" text="Perguntas simples, passo a passo. Ideal se você nunca mapeou um processo." cta="Começar o assistente" onClick={() => nav('/app/novo')} />
        <StartCard icon={<FileSpreadsheet className="h-7 w-7 text-ok" />} title="Importar minha planilha" text="XLSX ou CSV. Você confirma quais colunas usar; nada é enviado para a internet." cta="Importar planilha" onClick={() => nav('/app/importar')}>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <button type="button" className="font-semibold text-brand underline-offset-2 hover:underline" onClick={() => void downloadTemplateXlsx()}>
              Baixar modelo XLSX
            </button>
            <button type="button" className="font-semibold text-brand underline-offset-2 hover:underline" onClick={() => void downloadTemplateCsv()}>
              Baixar exemplo CSV
            </button>
          </div>
        </StartCard>
        <StartCard icon={<FlaskConical className="h-7 w-7 text-amber" />} title="Testar com um exemplo" text="Processo fictício de pedidos, completo, com decisões e retrabalho. Não mistura com seus dados." cta={demoW ? 'Abrir o exemplo' : 'Abrir exemplo'} onClick={() => void demo()} />
      </div>

      <Card title="Meus processos" subtitle="Salvos neste aparelho">
        {list === null ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : !real.length && !demoW ? (
          <Empty icon={<Database className="h-8 w-8" />} title="Nenhum processo ainda">
            Comece por um dos caminhos acima. Tudo fica salvo automaticamente neste navegador.
          </Empty>
        ) : (
          <ul className="divide-y divide-line/10">
            {[...real, ...(demoW ? [demoW] : [])].map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/app/p/${w.id}`} className="font-semibold text-ink hover:text-brand">
                    {w.asIs.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {w.isDemo && <Badge tone="amber">Exemplo fictício</Badge>}
                    <span>{w.asIs.activities.length} elementos</span>
                    <span>· {w.scenarios.length} cenário(s) TO-BE</span>
                    <span>· atualizado {fmtDateTime(w.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {w.isDemo && (
                    <Button size="sm" variant="ghost" onClick={() => void demo(true)} title="Recriar o exemplo do zero">
                      Reiniciar exemplo
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => nav(`/app/p/${w.id}`)}>
                    Abrir
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(w)} aria-label={`Excluir ${w.asIs.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Seus dados, seu controle" subtitle="Privacidade">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="flex gap-3 text-sm text-ink2">
            <ShieldCheck className="h-6 w-6 shrink-0 text-ok" aria-hidden />
            <p>
              Processos, planilhas e resultados ficam no armazenamento local deste navegador (IndexedDB). O app não envia o conteúdo dos seus processos para servidores. Limpar os dados do navegador apaga tudo — faça backups.{' '}
              <Link to="/app/ajuda#privacidade" className="font-semibold text-brand underline-offset-2 hover:underline">
                Detalhes
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Button size="sm" variant="secondary" onClick={() => void backup()}>
              <Download className="h-4 w-4" aria-hidden /> Baixar backup
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" aria-hidden /> Restaurar backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Arquivo de backup"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restore(f);
                e.target.value = '';
              }}
            />
            <Button size="sm" variant="ghost" className="text-bad" onClick={() => void wipe()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Apagar dados locais
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function StartCard({ icon, title, text, cta, onClick, children }: { icon: React.ReactNode; title: string; text: string; cta: string; onClick: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line/15 bg-surface p-5 shadow-card">
      {icon}
      <h2 className="mt-3 text-lg font-bold">{title}</h2>
      <p className="mt-1 flex-1 text-sm text-ink2">{text}</p>
      <Button className="mt-4 w-full" onClick={onClick}>
        {cta}
      </Button>
      {children}
    </div>
  );
}
