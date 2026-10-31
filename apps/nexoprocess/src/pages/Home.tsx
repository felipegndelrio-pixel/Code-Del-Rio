// Início do app (V4): construído a partir do estado real do usuário.
// Sem projetos → proposta e formas de começar. Com projetos → retomar o trabalho.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, ChevronDown, Download, FileJson, FileSpreadsheet, FlaskConical, MessageSquareText, Plus, Search, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Callout, Card, Input, Segmented, Skeleton, useConfirm, useToast } from '../components/ui';
import { journey, type StepKey } from '../domain/journey';
import type { Workspace } from '../domain/types';
import { db, exportBackup, parseBackup, restoreBackup, storageMode } from '../storage/db';
import { download, downloadTemplateCsv, downloadTemplateXlsx, openDemo } from '../state/actions';
import { STEP_PATH } from '../config/nav';
import { demoBlocked } from '../license/demo';
import InstallHint from '../components/InstallHint';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';

type Filter = 'todos' | 'andamento' | 'exemplo';

export default function Home() {
  const { t, fmt } = useI18n();
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
    if (!(await confirm({ title: t('home.remove.title'), body: <>{t('home.remove.body', { name: w.asIs.name })}</>, confirm: t('home.remove.confirm'), danger: true }))) return;
    await db.deleteWorkspace(w.id);
    toast('ok', t('home.remove.done'));
    void load();
  };

  const wipe = async () => {
    if (!(await confirm({ title: t('home.wipe.title'), body: <>{t('home.wipe.body')}</>, confirm: t('home.wipe.confirm'), danger: true }))) return;
    await db.clearAll();
    toast('ok', t('home.wipe.done'));
    void load();
  };

  const backup = async () => {
    if (demoBlocked('exportar')) return;
    const b = await exportBackup();
    await download(`nexoprocess-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b, null, 2), 'application/json');
    toast('ok', t('home.toast.backup', { n: b.workspaces.length }));
  };

  const restore = async (f: File, kind: 'projeto' | 'backup') => {
    if (demoBlocked('salvar')) return;
    try {
      const ws = parseBackup(await f.text());
      const n = await restoreBackup(ws);
      toast('ok', kind === 'projeto' ? t('home.toast.imported', { n }) : t('home.toast.restored', { n }));
      void load();
    } catch (e) {
      toast('bad', `${e instanceof Error ? e.message : t('home.error.invalidFile')} ${t('home.error.useFile')}`);
    }
  };

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list ?? [])
      .filter((w) => (filter === 'exemplo' ? w.isDemo : filter === 'andamento' ? !w.isDemo : true))
      .filter((w) => !term || w.asIs.name.toLowerCase().includes(term) || (w.asIs.area ?? '').toLowerCase().includes(term))
      .map((w) => ({ w, j: journey(w) }));
  }, [list, q, filter]);

  const stepShort = (key: StepKey) => t(`journey.${key}.short` as MessageKey);
  const real = (list ?? []).filter((w) => !w.isDemo);
  const hasProjects = (list?.length ?? 0) > 0;

  const fileInputs = (
    <>
      <input ref={projectRef} type="file" accept="application/json,.json" className="hidden" aria-label={t('home.file.project')} onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void restore(f, 'projeto');
        e.target.value = '';
      }} />
      <input ref={backupRef} type="file" accept="application/json,.json" className="hidden" aria-label={t('home.file.backup')} onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void restore(f, 'backup');
        e.target.value = '';
      }} />
    </>
  );

  const ways = (
    <div className="grid gap-3 md:grid-cols-3">
      <StartOption icon={<MessageSquareText className="h-5 w-5" />} title={t('home.way.questions.title')} text={t('home.way.questions.text')} cta={t('home.way.questions.cta')} primary onClick={() => nav('/app/novo')} />
      <StartOption icon={<FileSpreadsheet className="h-5 w-5" />} title={t('home.way.import.title')} text={t('home.way.import.text')} cta={t('home.way.import.cta')} onClick={() => nav('/app/importar')}>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void downloadTemplateXlsx()}>
            {t('home.template.xlsx')}
          </button>
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void downloadTemplateCsv()}>
            {t('home.template.csv')}
          </button>
        </div>
      </StartOption>
      <StartOption icon={<FlaskConical className="h-5 w-5" />} title={t('home.way.demo.title')} text={t('home.way.demo.text')} cta={t('home.way.demo.cta')} onClick={() => void demo()} />
    </div>
  );

  return (
    <div className="safe-x mx-auto max-w-content space-y-6 py-8">
      {fileInputs}
      {mode === 'memoria' && (
        <Callout tone="warn" title={t('home.memory.title')}>
          {t('home.memory.body')}
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
            <p className="eyebrow">{t('home.hero.eyebrow')}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t('home.hero.title')}</h1>
            <p className="mt-3 text-base text-ink2">{t('home.hero.text')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => nav('/app/novo')}>
                <Plus className="h-5 w-5" aria-hidden /> {t('home.hero.first')}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => nav('/app/importar')}>
                <FileSpreadsheet className="h-5 w-5" aria-hidden /> {t('home.way.import.cta')}
              </Button>
              <Button size="lg" variant="ghost" onClick={() => void demo()}>
                {t('home.way.demo.cta')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </section>
          <ol className="grid gap-4 border-y border-line/10 py-6 md:grid-cols-3" aria-label={t('home.how.aria')}>
            {(['1', '2', '3'] as const).map((n, i) => (
              <li key={n} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brandInk">{i + 1}</span>
                <div>
                  <p className="font-semibold">{t(`home.how.${n}.title` as MessageKey)}</p>
                  <p className="text-sm text-ink2">{t(`home.how.${n}.text` as MessageKey)}</p>
                </div>
              </li>
            ))}
          </ol>
          {/* As três formas de começar já estão no topo; aqui só os atalhos de quem chega com arquivo. */}
          <div className="grid gap-3 text-sm text-ink2 sm:grid-cols-2">
            <p>
              <span className="font-semibold text-ink">{t('home.shortcut.sheet')}</span>{t('home.shortcut.sheetRest')}{' '}
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void downloadTemplateXlsx()}>
                {t('home.template.xlsx')}
              </button>{' '}
              ·{' '}
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => void downloadTemplateCsv()}>
                {t('home.template.csv')}
              </button>
            </p>
            <p>
              <span className="font-semibold text-ink">{t('home.shortcut.device')}</span>{' '}
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => projectRef.current?.click()}>
                {t('home.shortcut.importProject')}
              </button>
              {t('home.shortcut.or')}
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => backupRef.current?.click()}>
                {t('home.shortcut.restoreBackup')}
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
              <p className="eyebrow">{t('home.list.eyebrow')}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t('home.list.title')}</h1>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button variant="secondary" onClick={() => projectRef.current?.click()}>
                <Upload className="h-4 w-4" aria-hidden /> {t('home.shortcut.importProject')}
              </Button>
              <Button onClick={() => nav('/app/novo')}>
                <Plus className="h-4 w-4" aria-hidden /> {t('home.list.mapNew')}
              </Button>
            </div>
          </div>

          {(list?.length ?? 0) > 2 && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input aria-label={t('home.list.searchAria')} placeholder={t('home.list.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
              </div>
              <Segmented<Filter> label={t('home.list.filterLabel')} value={filter} onChange={setFilter} options={[{ value: 'todos', label: t('home.list.filterAll') }, { value: 'andamento', label: t('home.list.filterMine') }, { value: 'exemplo', label: t('home.list.filterSample') }]} />
            </div>
          )}

          <ul className="divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/15 bg-surface shadow-card" aria-label={t('home.list.aria')}>
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
                      {w.isDemo && <Badge tone="amber">{t('home.item.sample')}</Badge>}
                      {j.blocked && <Badge tone="bad">{t('home.item.error')}</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {w.asIs.area ? `${w.asIs.area} · ` : ''}
                      {t('home.item.meta', { n: w.asIs.activities.filter((a) => a.type === 'task').length, date: fmt.dateTime(w.updatedAt) })}
                    </p>
                  </div>
                  <div className="w-full min-w-[9rem] sm:w-44">
                    <div className="flex justify-between text-xs text-muted">
                      <span>{t('home.item.step', { done, total: j.steps.length })}</span>
                      <span className="truncate pl-2">{j.next ? stepShort(j.next.key) : t('journey.done')}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label={t('home.item.progressAria', { name: w.asIs.name })} aria-valuenow={done} aria-valuemin={0} aria-valuemax={j.steps.length}>
                      <div className="h-full rounded-full bg-accentStrong" style={{ width: `${(done / j.steps.length) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => nav(`/app/p/${w.id}/${nextPath}`)} aria-label={`${t('home.item.continue')}${j.next ? `: ${stepShort(j.next.key)}` : ''} — ${w.asIs.name}`}>
                      {t('home.item.continue')}{j.next ? `: ${stepShort(j.next.key)}` : ''}
                    </Button>
                    {w.isDemo && (
                      <Button size="sm" variant="ghost" onClick={() => void demo(true)} title={t('home.item.resetTitle')}>
                        {t('home.item.reset')}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => void remove(w)} aria-label={t('home.item.deleteAria', { name: w.asIs.name })}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
            {!rows.length && <li className="p-6 text-center text-sm text-muted">{t('home.list.empty')}</li>}
          </ul>
          {!real.length && (
            <Callout tone="info" title={t('home.onlyDemo.title')}>
              {t('home.onlyDemo.body')}
            </Callout>
          )}

          <section>
            <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-ink2 hover:text-ink">
              <ChevronDown className={clsx('h-4 w-4 transition-transform', moreOpen && 'rotate-180')} aria-hidden /> {t('home.more')}
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
            {t('home.privacy.short')}{' '}
            <Link to="/app/ajuda#privacidade" className="font-semibold text-accent hover:underline">
              {t('home.details')}
            </Link>
          </span>
        </p>
      )}

      {/* Só depois de carregar a lista: evita deslocar o layout (CLS). */}
      {list !== null && hasProjects && (
        <Card title={t('home.control.title')} subtitle={t('home.control.subtitle')}>
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="flex gap-3 text-sm text-ink2">
              <ShieldCheck className="h-6 w-6 shrink-0 text-ok" aria-hidden />
              <div className="space-y-1">
                <p>
                  {t('home.control.p1a')}<strong>{t('home.control.p1b')}</strong>.
                </p>
                <p>
                  {t('home.control.p2a')}<em>{t('home.control.p2b')}</em>{t('home.control.p2c')}<em>{t('home.control.p2d')}</em>.{' '}
                  <Link to="/app/ajuda#privacidade" className="font-semibold text-accent hover:underline">
                    {t('home.details')}
                  </Link>
                </p>
                <p>
                  {t('home.docs')}{' '}
                  <Link to="/privacidade" className="font-semibold text-accent hover:underline">
                    {t('home.docs.privacy')}
                  </Link>{' '}
                  ·{' '}
                  <Link to="/termos" className="font-semibold text-accent hover:underline">
                    {t('home.docs.terms')}
                  </Link>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Button size="sm" variant="secondary" onClick={() => void backup()}>
                <Download className="h-4 w-4" aria-hidden /> {t('home.backup.download')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => backupRef.current?.click()}>
                <FileJson className="h-4 w-4" aria-hidden /> {t('home.backup.restore')}
              </Button>
              <Button size="sm" variant="ghost" className="text-bad" onClick={() => void wipe()}>
                <Trash2 className="h-4 w-4" aria-hidden /> {t('home.backup.wipe')}
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
