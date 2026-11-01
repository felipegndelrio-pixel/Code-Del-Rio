// Assistente guiado: cria o AS-IS sem planilha e sem conhecer BPMN.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GitBranch, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Callout, Card, Field, Input, NumberInput, Select, Term, Textarea, useConfirm, useToast } from '../components/ui';
import { newActivity, newProcess, normalizeStages } from '../domain/factory';
import type { Activity, DurationUnit, LeanClass, Period, ProcessModel } from '../domain/types';
import { uid } from '../domain/units';
import { validateProcess } from '../domain/validation';
import { checkStorage, db } from '../storage/db';
import { createFromDraft, DraftAlreadyUsedError, DraftDivergedError, resumeDraft, staleFromSave, type StaleDraft } from '../state/draftCommit';
import { StaleDraftNotice } from '../components/StaleDraftNotice';
import { demoBlocked } from '../license/demo';
import { useHardwareBack } from '../state/backNav';
import { localDraft } from '../storage/localDraft';
import { tr } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';

interface WItem {
  key: string;
  name: string;
  duration?: number;
  unit: DurationUnit;
  owner?: string;
  people?: number;
  isDecision?: boolean;
  /** Para onde vai quando a resposta é NÃO: chave de outro item ou "__end". */
  noTarget?: string;
  lean?: LeanClass | '';
}
interface WStage {
  key: string;
  name: string;
  items: WItem[];
}
interface WState {
  /** Identifica o rascunho: o mesmo rascunho nunca vira dois projetos (ver state/draftCommit). */
  draftId?: string;
  step: number;
  name: string;
  description: string;
  area: string;
  stages: WStage[];
  volume?: number;
  period: Period;
  costPerHour?: number;
}

const STEP_COUNT = 5;
const DRAFT = 'wizard';
const blankItem = (): WItem => ({ key: uid('i'), name: '', unit: 'min' });
const initial = (): WState => ({
  draftId: uid('rd'),
  step: 0,
  name: '',
  description: '',
  area: '',
  stages: [
    { key: uid('s'), name: '', items: [blankItem()] },
    { key: uid('s'), name: '', items: [blankItem()] },
  ],
  period: 'mes',
});

/** O que o formulário vira no projeto: a revisão e a gravação usam esta mesma análise. */
export function analyzeWizard(s: WState) {
  const named = (st: WStage) => st.items.filter((i) => i.name.trim());
  const stages = s.stages.filter((st) => st.name.trim() && named(st).length > 0);
  const dropped = s.stages
    .filter((st) => !stages.includes(st))
    .filter((st) => st.name.trim() || named(st).length > 0)
    .map((st) => ({ key: st.key, name: st.name.trim(), reason: (st.name.trim() ? 'sem_atividades' : 'sem_nome') as 'sem_atividades' | 'sem_nome', activities: named(st).map((i) => i.name.trim()) }));
  const flat = stages.flatMap((st) => named(st).map((i) => ({ st, i })));
  const keys = new Set(flat.map((x) => x.i.key));
  // "Se não" apontando para item removido ou que não entra no projeto: o caminho se perderia.
  const invalidDecisions = flat.filter(({ i }) => i.isDecision && i.noTarget && i.noTarget !== '__end' && !keys.has(i.noTarget)).map(({ st, i }) => ({ key: i.key, name: i.name.trim(), stage: st.name.trim() }));
  return { stages, flat, dropped, invalidDecisions };
}

export function wizardToProcess(s: WState): ProcessModel {
  const p = newProcess(s.name.trim() || tr('d.assistant.001'));
  p.description = s.description.trim() || undefined;
  p.area = s.area.trim() || undefined;
  p.volume = s.volume;
  p.volumePeriod = s.period;
  p.defaultCostPerHour = s.costPerHour;
  const { stages, flat } = analyzeWizard(s);
  const idOf = new Map(flat.map((x, n) => [x.i.key, `A${n + 1}`]));
  let order = 0;
  const acts: Activity[] = [];
  const first = flat[0];
  const last = flat[flat.length - 1];
  if (!first) return p;
  acts.push(newActivity({ id: 'INICIO', stage: first.st.name.trim(), name: tr('d.assistant.004'), type: 'start', order: ++order, next: [idOf.get(first.i.key)!] }));
  let needsNoEnd = false;
  flat.forEach(({ st, i }, n) => {
    const nextId = flat[n + 1] ? idOf.get(flat[n + 1].i.key)! : 'FIM';
    const a = newActivity({
      id: idOf.get(i.key)!,
      stage: st.name.trim(),
      name: i.name.trim(),
      order: ++order,
      unit: i.unit,
      duration: i.duration,
      owner: i.owner?.trim() || undefined,
      people: i.people,
      lean: i.lean || undefined,
    });
    if (i.isDecision) {
      a.type = 'decision';
      a.duration = undefined;
      a.people = undefined;
      a.nextYes = nextId;
      if (i.noTarget === '__end') {
        a.nextNo = 'FIM_NAO';
        needsNoEnd = true;
      } else if (i.noTarget && idOf.has(i.noTarget)) a.nextNo = idOf.get(i.noTarget);
    } else a.next = [nextId];
    acts.push(a);
  });
  acts.push(newActivity({ id: 'FIM', stage: last.st.name.trim(), name: tr('d.type.end'), type: 'end', order: ++order }));
  if (needsNoEnd) acts.push(newActivity({ id: 'FIM_NAO', stage: last.st.name.trim(), name: tr('d.assistant.008'), type: 'end', order: ++order }));
  // Atividades que recebem o "não" de uma decisão anterior a elas mesmas = retrabalho? Não presumimos: o usuário marca depois.
  p.activities = acts;
  p.stageOrder = stages.map((st) => st.name.trim());
  return normalizeStages(p);
}

export default function Wizard() {
  const { t } = useI18n();
  const STEPS = [1, 2, 3, 4, 5].map((n) => t(`wz.step.${n}` as 'wz.step.1'));
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  // Se a cópia local já virou processo, o registro durável no IndexedDB diz (resumeDraft abaixo).
  const [already, setAlready] = useState<{ workspaceId: string; exists: boolean } | undefined>();
  const [storage, setStorage] = useState<'indexeddb' | 'memoria' | null>(null);
  const [ackDropped, setAckDropped] = useState('');
  // Rascunho antigo (sem draftId) não ganha identidade só na memória: createFromDraft a grava antes de criar.
  const [local] = useState(() => {
    const d = localDraft.read<WState>(DRAFT);
    return d && Array.isArray(d.stages) && (d.name || d.stages.some((st) => st.name)) ? d : undefined;
  });
  const [s, setS] = useState<WState>(() => local ?? initial());
  const [loaded, setLoaded] = useState(!!local);
  const [restored, setRestored] = useState(!!local);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Esta aba perdeu o direito de editar (outra aba criou o processo): não salva nem cria; o conteúdo fica na tela.
  const [stale, setStale] = useState<StaleDraft | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    void checkStorage().then(setStorage);
    // Rascunho (ou cópia local) que já virou processo não é restaurado; a limpeza é refeita.
    resumeDraft<WState>(DRAFT, local?.draftId)
      .then((r) => {
        if (r.usedBy) setAlready(r.usedBy);
        const d = r.draft;
        const next = d && Array.isArray(d.stages) && (d.name || d.stages.some((st) => st.name)) ? d : undefined;
        if (r.localUsed) {
          setS(next ?? initial());
          setRestored(!!next);
        } else if (!local && next) {
          setS(next);
          setRestored(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [local]);
  // Criando o processo: o auto-save para. Mesmo um salvamento já agendado não recria o rascunho:
  // db.saveDraft não grava rascunho cujo registro "criado" já existe.
  const committing = useRef(false);
  useEffect(() => {
    if (!loaded || stale) return;
    if ((s.name || s.stages.some((st) => st.name)) && !committing.current) localDraft.write(DRAFT, s);
    // Fora de 'salvo' (virou processo em outra aba ou foi assumido por ela), esta aba fica desatualizada.
    const t = setTimeout(() => {
      if (committing.current) return;
      void db
        .saveDraft(DRAFT, s)
        .then((r) => staleFromSave(r, s.draftId))
        .then((st) => {
          if (st && !committing.current) setStale(st);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [s, loaded, stale]);
  useEffect(() => headingRef.current?.focus(), [s.step]);

  const set = (patch: Partial<WState>) => setS((x) => ({ ...x, ...patch }));
  const setStage = (k: string, patch: Partial<WStage>) => setS((x) => ({ ...x, stages: x.stages.map((st) => (st.key === k ? { ...st, ...patch } : st)) }));
  const setItem = (sk: string, ik: string, patch: Partial<WItem>) =>
    setS((x) => ({ ...x, stages: x.stages.map((st) => (st.key === sk ? { ...st, items: st.items.map((i) => (i.key === ik ? { ...i, ...patch } : i)) } : st)) }));

  const process = useMemo(() => wizardToProcess(s), [s]);
  const analysis = useMemo(() => analyzeWizard(s), [s]);
  const issues = useMemo(() => (s.step === 4 ? validateProcess(process) : []), [s.step, process]);
  const droppedSig = analysis.dropped.map((x) => `${x.key}:${x.reason}:${x.activities.length}`).join('|');
  const needsAck = droppedSig !== '' && ackDropped !== droppedSig;
  const blockReason = stale
    ? t('wz.block.stale')
    : analysis.invalidDecisions.length
    ? t('wz.block.decisions')
    : issues.some((i) => i.severity === 'error')
      ? t('wz.block.errors')
      : needsAck
        ? t('wz.block.ack')
        : null;

  const check = (step: number): boolean => {
    const e: Record<string, string> = {};
    if (step === 0 && !s.name.trim()) e.name = t('wz.err.name');
    if (step === 1) {
      const named = s.stages.filter((st) => st.name.trim());
      if (!named.length) e.stages = t('wz.err.noStages');
      const names = named.map((st) => st.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) e.stages = t('wz.err.dupStages');
    }
    if (step === 2) {
      const any = s.stages.some((st) => st.name.trim() && st.items.some((i) => i.name.trim()));
      if (!any) e.items = t('wz.err.noItems');
      const namedKeys = new Set(s.stages.flatMap((st) => st.items.filter((i) => i.name.trim()).map((i) => i.key)));
      for (const st of s.stages)
        for (const i of st.items) {
          if (i.isDecision && i.name.trim() && !i.noTarget) e[`no_${i.key}`] = t('wz.err.noTarget');
          else if (i.isDecision && i.name.trim() && i.noTarget !== '__end' && !namedKeys.has(i.noTarget!)) e[`no_${i.key}`] = t('wz.err.targetRemoved');
        }
    }
    setErrors(e);
    return !Object.keys(e).length;
  };
  const go = (d: number) => {
    if (d > 0 && !check(s.step)) return;
    set({ step: Math.max(0, Math.min(STEP_COUNT - 1, s.step + d)) });
    window.scrollTo({ top: 0 });
  };

  useHardwareBack('formulario', s.step > 0, () => go(-1), String(s.step));

  const finish = async () => {
    if (!check(0) || !check(1) || !check(2)) return;
    if (blockReason) {
      toast('bad', t('wz.toast.almost', { reason: `${blockReason.charAt(0).toLowerCase()}${blockReason.slice(1)}` }));
      return;
    }
    if (stale || demoBlocked('salvar')) return;
    setBusy(true);
    committing.current = true;
    let r;
    try {
      // Rascunho antigo sem identidade: a recebida (já gravada antes de criar) passa a valer nesta tela.
      r = await createFromDraft(DRAFT, s, process, { kind: 'wizard' }, { onDraftId: (id) => setS((x) => ({ ...x, draftId: id })) });
    } catch (e) {
      committing.current = false;
      setBusy(false);
      // Outra aba criou o processo (com outro conteúdo) ou ele foi excluído: esta aba para e mantém o conteúdo.
      if (e instanceof DraftDivergedError) {
        setStale({ reason: 'divergente', workspaceId: e.workspaceId });
        return;
      }
      if (e instanceof DraftAlreadyUsedError) {
        setStale({ reason: 'excluido' });
        return;
      }
      // A criação falhou: nada foi gravado, o rascunho continua e a pessoa pode tentar de novo.
      toast('bad', t('wz.toast.saveFail'));
      return;
    }
    setBusy(false);
    // Criado. A limpeza do rascunho é separada: se falhar, não é erro de criação.
    if (r.reused) toast('info', t('wz.toast.reused'));
    if (!r.durable) toast('bad', t('wz.toast.notDurable'));
    else toast('ok', t('wz.toast.ok'));
    if (r.cleanup === 'falhou') toast('info', t('wz.toast.cleanupFail'));
    nav(`/app/p/${r.w.id}/validar`);
  };

  /** Sai do modo "aba desatualizada" só por escolha da pessoa (depois de copiar). */
  const startOver = () => {
    localDraft.remove(DRAFT);
    setStale(null);
    setS(initial());
    setRestored(false);
  };

  const discard = async () => {
    if (!(await confirm({ title: t('wz.discard.title'), body: t('wz.discard.body'), confirm: t('wz.discard.confirm'), danger: true }))) return;
    await db.deleteDraft(DRAFT);
    localDraft.remove(DRAFT);
    setS(initial());
    setRestored(false);
  };

  const allItems = s.stages.flatMap((st) => st.items.filter((i) => i.name.trim()).map((i) => ({ ...i, stage: st.name })));
  const pct = Math.round(((s.step + 1) / STEP_COUNT) * 100);

  return (
    <div className="safe-x mx-auto max-w-3xl space-y-5 py-6">
      <div>
        <p className="text-sm font-semibold text-brand">{t('wz.kicker')}</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
          {t(`wz.title.${s.step + 1}` as 'wz.title.1')}
        </h1>
        <div className="mt-3" aria-label={t('wz.progress', { n: s.step + 1, total: STEP_COUNT, name: STEPS[s.step] })}>
          <div className="flex justify-between text-xs text-muted">
            <span className="font-medium text-ink2">
              {t('wz.progress', { n: s.step + 1, total: STEP_COUNT, name: STEPS[s.step] })}
            </span>
            <span data-testid="draft-storage">{stale ? t('wz.save.stale') : storage === 'memoria' ? t('wz.save.memory') : t('wz.save.saved')}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label={t('wz.progress.bar')} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {storage === 'memoria' && (
        <Callout tone="warn" title={t('wz.mem.title')}>
          {t('wz.mem.body')}
        </Callout>
      )}
      {stale && (
        <StaleDraftNotice
          reason={stale.reason}
          noun="processo"
          text={wizardText(s)}
          onOpen={stale.workspaceId ? () => nav(`/app/p/${stale.workspaceId}/visao-geral`) : undefined}
          onNew={stale.reason === 'excluido' ? startOver : undefined}
        />
      )}
      {already && !restored && !stale && (
        <Callout
          tone="info"
          title={already.exists ? t('wz.already.exists') : t('wz.already.deleted')}
          action={already.exists ? <Button size="sm" variant="ghost" onClick={() => nav(`/app/p/${already.workspaceId}/visao-geral`)}>{t('wz.already.open')}</Button> : undefined}
        >
          {t('wz.already.body')}
        </Callout>
      )}
      {restored && !stale && (
        <Callout tone="info" title={t('wz.restored.title')} action={<Button size="sm" variant="ghost" onClick={() => void discard()}>{t('wz.restored.restart')}</Button>}>
          {t('wz.restored.body')}
        </Callout>
      )}

      {s.step === 0 && (
        <Card>
          <div className="space-y-4">
            <Field label={t('wz.f.name')} required help={t('wz.f.name.help')} error={errors.name}>
              {(p) => <Input {...p} value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('wz.f.name.ph')} autoFocus />}
            </Field>
            <Field label={t('wz.f.desc')} help={t('wz.f.desc.help')}>
              {(p) => <Textarea {...p} value={s.description} onChange={(e) => set({ description: e.target.value })} />}
            </Field>
            <Field label={t('wz.f.area')} help={t('wz.optional')}>
              {(p) => <Input {...p} value={s.area} onChange={(e) => set({ area: e.target.value })} placeholder={t('wz.f.area.ph')} />}
            </Field>
          </div>
        </Card>
      )}

      {s.step === 1 && (
        <Card title={t('wz.s1.title')} subtitle={t('wz.s1.sub')}>
          <p className="mb-3 text-sm text-ink2">{t('wz.s1.hint')}</p>
          {errors.stages && <p className="mb-2 text-sm font-medium text-bad" role="alert">{errors.stages}</p>}
          <ol className="space-y-2">
            {s.stages.map((st, i) => (
              <li key={st.key} className="flex items-center gap-2">
                <span className="w-6 text-right text-sm font-bold text-muted">{i + 1}.</span>
                <Input aria-label={t('wz.s1.nameAria', { n: i + 1 })} value={st.name} onChange={(e) => setStage(st.key, { name: e.target.value })} placeholder={[t('wz.s1.ph1'), t('wz.s1.ph2'), t('wz.s1.ph3'), t('wz.s1.ph4')][i] ?? t('wz.s1.ph')} />
                <Button size="sm" variant="ghost" aria-label={t('wz.moveUp')} disabled={i === 0} onClick={() => set({ stages: move(s.stages, i, -1) })}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" aria-label={t('wz.moveDown')} disabled={i === s.stages.length - 1} onClick={() => set({ stages: move(s.stages, i, 1) })}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" aria-label={t('wz.s1.removeAria', { n: i + 1 })} disabled={s.stages.length === 1} onClick={() => set({ stages: s.stages.filter((x) => x.key !== st.key) })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => set({ stages: [...s.stages, { key: uid('s'), name: '', items: [blankItem()] }] })}>
            <Plus className="h-4 w-4" /> {t('wz.s1.add')}
          </Button>
        </Card>
      )}

      {s.step === 2 && (
        <div className="space-y-4">
          <Callout tone="info">
            {t('wz.s2.hint')}
          </Callout>
          {errors.items && <p className="text-sm font-medium text-bad" role="alert">{errors.items}</p>}
          {s.stages
            .filter((st) => st.name.trim())
            .map((st, si) => (
              <Card key={st.key} title={st.name} subtitle={t('wz.s2.stage', { n: si + 1 })}>
                <ol className="space-y-3">
                  {st.items.map((it, ii) => (
                    <li key={it.key} className={clsx('rounded-xl border p-3', it.isDecision ? 'border-violet/40 bg-violet/5' : 'border-line/15 bg-surface2/40')}>
                      <div className="flex items-start gap-2">
                        <span className="mt-3 w-5 text-right text-xs font-bold text-muted">{ii + 1}.</span>
                        <div className="grid flex-1 gap-3 sm:grid-cols-2">
                          <Field label={it.isDecision ? t('wz.s2.question') : t('wz.s2.what')} className="sm:col-span-2">
                            {(p) => <Input {...p} value={it.name} onChange={(e) => setItem(st.key, it.key, { name: e.target.value })} placeholder={it.isDecision ? t('wz.s2.question.ph') : t('wz.s2.what.ph')} />}
                          </Field>
                          {!it.isDecision && (
                            <>
                              <div className="flex gap-2">
                                <Field label={t('wz.s2.time')} help={t('wz.s2.time.help')} className="flex-1">
                                  {(p) => <NumberInput {...p} value={it.duration} onChange={(v) => setItem(st.key, it.key, { duration: v })} placeholder={t('wz.s2.time.ph')} />}
                                </Field>
                                <Field label={t('wz.s2.unit')} className="w-28">
                                  {(p) => (
                                    <Select {...p} value={it.unit} onChange={(e) => setItem(st.key, it.key, { unit: e.target.value as DurationUnit })}>
                                      <option value="min">{t('wz.unit.min')}</option>
                                      <option value="h">{t('wz.unit.h')}</option>
                                      <option value="d">{t('wz.unit.d')}</option>
                                    </Select>
                                  )}
                                </Field>
                              </div>
                              <Field label={t('wz.s2.who')} help={t('wz.s2.who.help')}>
                                {(p) => <Input {...p} value={it.owner ?? ''} onChange={(e) => setItem(st.key, it.key, { owner: e.target.value })} placeholder={t('wz.s2.who.ph')} list="wiz-owners" />}
                              </Field>
                              <Field label={t('wz.s2.people')} help={t('wz.s2.people.help')}>
                                {(p) => <NumberInput {...p} value={it.people} onChange={(v) => setItem(st.key, it.key, { people: v })} placeholder={t('wz.s2.people.ph')} />}
                              </Field>
                              <Field label={<>{t('wz.s2.value')} <Term k="lean" iconOnly /></>} help={t('wz.s2.value.help')}>
                                {(p) => (
                                  <Select {...p} value={it.lean ?? ''} onChange={(e) => setItem(st.key, it.key, { lean: e.target.value as LeanClass | '' })}>
                                    <option value="">{t('wz.lean.unknown')}</option>
                                    <option value="VA">{t('wz.lean.va')}</option>
                                    <option value="NNVA">{t('wz.lean.nnva')}</option>
                                    <option value="W">{t('wz.lean.w')}</option>
                                  </Select>
                                )}
                              </Field>
                            </>
                          )}
                          {it.isDecision && (
                            <>
                              <p className="text-sm text-ink2 sm:col-span-2">
                                <Badge tone="ok">{t('wz.yes')}</Badge> {t('wz.yes.rest')}
                              </p>
                              <Field label={t('wz.s2.noTo')} className="sm:col-span-2" error={errors[`no_${it.key}`]}>
                                {(p) => (
                                  <Select {...p} value={it.noTarget ?? ''} onChange={(e) => setItem(st.key, it.key, { noTarget: e.target.value })}>
                                    <option value="">{t('wz.s2.choose')}</option>
                                    <option value="__end">{t('wz.s2.endProcess')}</option>
                                    {allItems
                                      .filter((x) => x.key !== it.key)
                                      .map((x) => (
                                        <option key={x.key} value={x.key}>
                                          {x.stage} › {x.name}
                                        </option>
                                      ))}
                                  </Select>
                                )}
                              </Field>
                            </>
                          )}
                          <label className="flex min-h-[40px] items-center gap-2 text-sm text-ink2 sm:col-span-2">
                            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={!!it.isDecision} onChange={(e) => setItem(st.key, it.key, { isDecision: e.target.checked })} />
                            <GitBranch className="h-4 w-4 text-violet" aria-hidden /> {t('wz.s2.isDecision')}
                          </label>
                        </div>
                        <div className="flex flex-col">
                          <Button size="sm" variant="ghost" aria-label={t('wz.moveUp')} disabled={ii === 0} onClick={() => setStage(st.key, { items: move(st.items, ii, -1) })}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={t('wz.moveDown')} disabled={ii === st.items.length - 1} onClick={() => setStage(st.key, { items: move(st.items, ii, 1) })}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={t('wz.s2.removeAria')} disabled={st.items.length === 1} onClick={() => setStage(st.key, { items: st.items.filter((x) => x.key !== it.key) })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                <Button className="mt-3" size="sm" variant="secondary" onClick={() => setStage(st.key, { items: [...st.items, blankItem()] })}>
                  <Plus className="h-4 w-4" /> {t('wz.s2.addIn', { stage: st.name })}
                </Button>
              </Card>
            ))}
          <datalist id="wiz-owners">
            {[...new Set(allItems.map((i) => i.owner?.trim()).filter(Boolean))].map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
      )}

      {s.step === 3 && (
        <Card title={t('wz.s3.title')} subtitle={t('wz.s3.sub')}>
          <p className="mb-4 text-sm text-ink2">{t('wz.s3.hint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('wz.s3.volume')} help={t('wz.s3.volume.help')}>
              {(p) => <NumberInput {...p} value={s.volume} onChange={(v) => set({ volume: v })} placeholder={t('wz.s3.volume.ph')} />}
            </Field>
            <Field label={t('wz.s3.per')}>
              {(p) => (
                <Select {...p} value={s.period} onChange={(e) => set({ period: e.target.value as Period })}>
                  <option value="dia">{t('wz.period.dia')}</option>
                  <option value="semana">{t('wz.period.semana')}</option>
                  <option value="mes">{t('wz.period.mes')}</option>
                  <option value="ano">{t('wz.period.ano')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('wz.s3.cost')} help={t('wz.s3.cost.help')} className="sm:col-span-2">
              {(p) => <NumberInput {...p} value={s.costPerHour} onChange={(v) => set({ costPerHour: v })} placeholder={t('wz.s3.cost.ph')} />}
            </Field>
          </div>
        </Card>
      )}

      {s.step === 4 && (
        <Card title={t('wz.s4.title')} subtitle={s.name}>
          <ol className="space-y-3 text-sm">
            {s.stages
              .filter((st) => st.name.trim())
              .map((st) => (
                <li key={st.key}>
                  <p className="font-semibold text-ink">{st.name}</p>
                  <ul className="ml-4 list-disc text-ink2">
                    {st.items
                      .filter((i) => i.name.trim())
                      .map((i) => (
                        <li key={i.key}>
                          {i.isDecision ? '◆ ' : ''}
                          {i.name}
                          {i.duration !== undefined && !i.isDecision ? ` — ${i.duration} ${i.unit}` : ''}
                          {i.owner ? ` · ${i.owner}` : ''}
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
          </ol>
          <div className="mt-4 space-y-2">
            {analysis.invalidDecisions.length > 0 && (
              <Callout tone="bad" title={t('wz.s4.invTitle')} action={<Button size="sm" variant="secondary" onClick={() => set({ step: 2 })}>{t('wz.s4.invFix')}</Button>}>
                <ul className="list-disc pl-4" data-testid="wizard-invalid-decisions">
                  {analysis.invalidDecisions.map((x) => (
                    <li key={x.key}>
                      {t('wz.s4.invItem', { name: x.name, stage: x.stage })}
                    </li>
                  ))}
                </ul>
              </Callout>
            )}
            {analysis.dropped.length > 0 && (
              <Callout tone="warn" title={t('wz.s4.dropTitle')}>
                <ul className="space-y-2" data-testid="wizard-dropped-items">
                  {analysis.dropped.map((x) => (
                    <li key={x.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {x.reason === 'sem_nome' ? (x.activities.length === 1 ? t('wz.s4.dropUnnamed1', { list: x.activities.join('; ') }) : t('wz.s4.dropUnnamedN', { n: x.activities.length, list: x.activities.join('; ') })) : t('wz.s4.dropNoAct', { name: x.name })}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => set({ step: x.reason === 'sem_nome' ? 1 : 2 })}>
                        {x.reason === 'sem_nome' ? t('wz.s4.nameIt') : t('wz.s4.addActs')}
                      </Button>
                    </li>
                  ))}
                </ul>
                <label className="mt-3 flex min-h-[44px] items-center gap-2 font-medium text-ink">
                  <input type="checkbox" className="h-5 w-5" checked={!needsAck} onChange={(e) => setAckDropped(e.target.checked ? droppedSig : '')} />
                  {t('wz.s4.ack')}
                </label>
              </Callout>
            )}
            {issues.filter((i) => i.severity !== 'info').length === 0 && !analysis.dropped.length && !analysis.invalidDecisions.length ? (
              <Callout tone="ok">{t('wz.s4.allGood')}</Callout>
            ) : (
              issues
                .filter((i) => i.severity !== 'info')
                .slice(0, 8)
                .map((i) => (
                  <Callout key={i.id} tone={i.severity === 'error' ? 'bad' : 'warn'} title={i.message}>
                    {i.fix}
                  </Callout>
                ))
            )}
          </div>
        </Card>
      )}

      {/* No celular: "Voltar" curto na 1ª linha e o avanço (com o destino por extenso) ocupando a 2ª. */}
      <div className="safe-bottom sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/15 bg-bg/90 px-4 py-3 backdrop-blur">
        <Button variant="ghost" onClick={() => (s.step === 0 ? nav('/app') : go(-1))}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {s.step === 0 ? (
            t('wz.exit')
          ) : (
            <>
              <span className="sm:hidden">{t('wz.back')}</span>
              <span className="hidden sm:inline">{t('wz.backTo', { target: t(`wz.target.${s.step}` as 'wz.target.1') })}</span>
            </>
          )}
        </Button>
        {s.step < STEP_COUNT - 1 ? (
          <div className="flex w-full gap-2 sm:w-auto">
            {s.step === 3 && (
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => go(1)}>
                {t('wz.skip')}
              </Button>
            )}
            <Button className="flex-1 sm:flex-none" onClick={() => go(1)}>
              {t('wz.next', { target: t(`wz.target.${s.step + 2}` as 'wz.target.1') })} <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
            {blockReason && (
              <p className="text-sm text-ink2" id="wizard-block-reason" data-testid="wizard-block-reason">
                {blockReason}
              </p>
            )}
            <Button className="w-full sm:w-auto" onClick={() => void finish()} loading={busy} disabled={!!blockReason} aria-describedby={blockReason ? 'wizard-block-reason' : undefined}>
              {t('wz.create')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Texto simples do formulário, para a pessoa copiar quando esta aba fica desatualizada. */
function wizardText(s: WState): string {
  const lines = [tr('wz.text.process', { name: s.name || tr('wz.text.noName') })];
  if (s.description) lines.push(tr('wz.text.purpose', { v: s.description }));
  if (s.area) lines.push(tr('wz.text.area', { v: s.area }));
  for (const st of s.stages) {
    if (!st.name && !st.items.some((i) => i.name)) continue;
    lines.push('', tr('wz.text.stage', { name: st.name || tr('wz.text.noName') }));
    for (const i of st.items.filter((x) => x.name)) lines.push(`- ${i.isDecision ? tr('wz.text.decision') : ''}${i.name}${i.owner ? ` · ${i.owner}` : ''}${i.duration !== undefined && !i.isDecision ? ` · ${i.duration} ${i.unit}` : ''}`);
  }
  if (s.volume !== undefined) lines.push('', tr('wz.text.volume', { v: s.volume, per: tr(`wz.text.per.${s.period}` as 'wz.text.per.dia') }));
  if (s.costPerHour !== undefined) lines.push(tr('wz.text.cost', { v: s.costPerHour }));
  return lines.join('\n');
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
