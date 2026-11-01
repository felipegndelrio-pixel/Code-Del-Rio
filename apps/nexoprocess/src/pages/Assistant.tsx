// Assistente conversacional estruturado (V4): perguntas curtas + controles
// adequados ao toque. Funciona igual no desktop; é o fluxo principal no celular.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Bot, Check, ChevronLeft, ChevronRight, Download, ListPlus, Map as MapIcon, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Badge, Button, Callout, Field, Input, NumberInput, Segmented, Select, Textarea, useConfirm, useToast } from '../components/ui';
import { allActivities, analyzeDraft, draftActivityFrom, draftToProcess, emptyDraft, parseList, type AssistantDraft, type DecisionProblem, type DraftActivity, type DraftAnalysis, type DraftStage } from '../domain/assistant';
import type { DurationUnit, LeanClass, Period } from '../domain/types';
import { fmtNum, uid } from '../domain/units';
import { validateProcess } from '../domain/validation';
import { checkStorage, db } from '../storage/db';
import { shareProject } from '../state/actions';
import { createFromDraft, DraftAlreadyUsedError, DraftDivergedError, resumeDraft, staleFromSave, type StaleDraft } from '../state/draftCommit';
import { StaleDraftNotice } from '../components/StaleDraftNotice';
import { lazyLabels, tr, type MessageKey } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';
import { useHardwareBack } from '../state/backNav';
import { localDraft } from '../storage/localDraft';
import { demoBlocked } from '../license/demo';
import { recommend } from '../domain/recommendations';
import { stepRequirements } from '../domain/journey';
import type { Workspace } from '../domain/types';

const DRAFT = 'assistant';
const SECTION_COUNT = 7;
const UNIT_TXT = lazyLabels<DurationUnit>({ min: 'as.unit.min', h: 'as.unit.h', d: 'as.unit.d' });
const PERIOD_TXT = lazyLabels<Period>({ dia: 'wz.period.dia', semana: 'wz.period.semana', mes: 'wz.period.mes', ano: 'wz.period.ano' });

function stepOrder(d: AssistantDraft): string[] {
  return ['name', 'trigger', 'outcome', 'stages', ...d.stages.map((s) => `acts:${s.key}`), 'details', 'decisions', 'volume', 'cost', 'review'];
}
/** Para onde o botão leva, em linguagem natural ("Avançar para as etapas"). */
function stepTarget(step: string, d: AssistantDraft): string {
  if (step.startsWith('acts:')) {
    const st = d.stages.find((x) => `acts:${x.key}` === step);
    return st ? tr('as.target.actsOf', { name: st.name }) : tr('as.target.acts');
  }
  const T: Record<string, MessageKey> = { name: 'as.target.name', trigger: 'as.target.trigger', outcome: 'as.target.outcome', stages: 'as.target.stages', details: 'as.target.details', decisions: 'as.target.decisions', volume: 'as.target.volume', cost: 'as.target.cost', review: 'as.target.review' };
  return tr(T[step] ?? 'as.target.next');
}
const plural = (n: number, one: MessageKey, many: MessageKey) => tr(n === 1 ? one : many, { n });

/** Confirmação curta ao chegar em marcos do roteiro (não aparece ao corrigir a partir da revisão). */
function ackFor(step: string, d: AssistantDraft, order: string[]): string | null {
  const acts = allActivities(d);
  if (step === 'trigger') return tr('as.ack.trigger', { name: d.name });
  if (step === order.find((x) => x.startsWith('acts:'))) return tr('as.ack.stages', { count: plural(d.stages.length, 'as.n.stageDef.1', 'as.n.stageDef.n') });
  if (step === 'details' && acts.length) return tr('as.ack.details', { count: plural(acts.length, 'as.n.act.1', 'as.n.act.n') });
  if (step === 'volume') return tr('as.ack.volume');
  return null;
}

function sectionOf(step: string): number {
  if (['name', 'trigger', 'outcome'].includes(step)) return 0;
  if (step === 'stages') return 1;
  if (step.startsWith('acts:')) return 2;
  return { details: 3, decisions: 4, volume: 5, cost: 5, review: 6 }[step] ?? 0;
}

export default function Assistant() {
  const { t: tx } = useI18n();
  const SECTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => tx(`as.section.${n}` as 'as.section.1'));
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  // A cópia do localStorage é lida de forma síncrona: ao recarregar, a tela já abre
  // na pergunta em que a pessoa estava (sem piscar na primeira pergunta).
  // Se essa cópia já virou projeto, o registro durável no IndexedDB diz (resumeDraft abaixo).
  const [already, setAlready] = useState<{ workspaceId: string; exists: boolean } | undefined>();
  // Rascunho antigo (sem draftId) não ganha identidade só na memória: createFromDraft a grava antes de criar.
  const [local] = useState(() => {
    const x = localDraft.read<AssistantDraft>(DRAFT);
    return x && x.version === 1 && x.name ? x : undefined;
  });
  const [d, setD] = useState<AssistantDraft>(() => local ?? emptyDraft());
  const [loaded, setLoaded] = useState(!!local);
  const [restored, setRestored] = useState(!!local);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ w: Workspace; durable: boolean; cleanup: 'ok' | 'falhou'; reused: boolean } | null>(null);
  const [storage, setStorage] = useState<'indexeddb' | 'memoria' | null>(null);
  const [ackDropped, setAckDropped] = useState('');
  // Esta aba perdeu o direito de editar (outra aba criou o projeto): não salva nem cria; o conteúdo fica na tela.
  const [stale, setStale] = useState<StaleDraft | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void checkStorage().then(setStorage);
    // Rascunho (ou cópia local) que já virou projeto não é restaurado; a limpeza é refeita.
    resumeDraft<AssistantDraft>(DRAFT, local?.draftId)
      .then((r) => {
        if (r.usedBy) setAlready(r.usedBy);
        const x = r.draft;
        const next = x && x.version === 1 && x.name ? x : undefined;
        if (r.localUsed) {
          setD(next ?? emptyDraft());
          setRestored(!!next);
        } else if (!local && next) {
          setD(next);
          setRestored(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [local]);
  // Criando o projeto: o auto-save para. Mesmo um salvamento já agendado não recria o rascunho:
  // db.saveDraft não grava rascunho cujo registro "criado" já existe.
  const committing = useRef(false);
  useEffect(() => {
    if (!loaded || done || stale) return;
    // Auto-save: cópia imediata no localStorage + IndexedDB com debounce. Fora de 'salvo'
    // (o rascunho virou projeto em outra aba ou foi assumido por ela), esta aba fica desatualizada.
    if (d.name && !committing.current) localDraft.write(DRAFT, d);
    const t = setTimeout(() => {
      if (committing.current) return;
      void db
        .saveDraft(DRAFT, d)
        .then((r) => staleFromSave(r, d.draftId))
        .then((st) => {
          if (st && !committing.current) setStale(st);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [d, loaded, done, stale]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
    composerRef.current?.querySelector<HTMLElement>('input,textarea,button:not([data-back])')?.focus({ preventScroll: true });
  }, [d.step]);

  const order = stepOrder(d);
  const idx = Math.max(0, order.indexOf(d.step));
  const nextLabel = d.returnToReview ? tx('as.backToReview') : tx('as.next', { target: stepTarget(order[Math.min(order.length - 1, idx + 1)], d) });
  const ack = d.returnToReview ? null : ackFor(d.step, d, order);
  const set = (patch: Partial<AssistantDraft>) => setD((x) => ({ ...x, ...patch }));
  const go = (step: string) => setD((x) => ({ ...x, step, returnToReview: x.step === 'review' && SINGLE_ANSWER.has(step) }));
  const next = (patch: Partial<AssistantDraft> = {}) =>
    setD((x) => {
      const merged = { ...x, ...patch };
      if (merged.returnToReview) return { ...merged, step: 'review', returnToReview: false };
      const o = stepOrder(merged);
      const i = o.indexOf(merged.step);
      return { ...merged, step: o[Math.min(o.length - 1, i + 1)] };
    });
  /** Um passo para trás, mantendo as respostas: atividade anterior nos detalhes, resumo ao corrigir, ou pergunta anterior. */
  const canBack = !done && (idx > 0 || (d.step === 'details' && d.detailIndex > 0) || !!d.returnToReview);
  const back = () => {
    if (d.step === 'details' && d.detailIndex > 0) set({ detailIndex: d.detailIndex - 1 });
    else if (d.returnToReview) setD((x) => ({ ...x, step: 'review', returnToReview: false }));
    else if (idx > 0) go(order[idx - 1]);
  };
  useHardwareBack('assistente', canBack, back, `${d.step}:${d.detailIndex}:${d.returnToReview ? 1 : 0}`);

  /** Desktop: Enter avança (campos de texto de uma linha vazios ou sem formulário próprio). */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.nativeEvent.isComposing) return;
    if (!window.matchMedia?.('(pointer: fine)').matches) return;
    const t = e.target as HTMLElement;
    if (t.closest('textarea,button,select,a,[role="radio"]')) return;
    const input = t instanceof HTMLInputElement ? t : null;
    // Campo com formulário próprio (nome, "adicionar item" com texto): o formulário decide.
    if (input?.form && input.value.trim()) return;
    if (input?.form && !input.form.hasAttribute('data-add')) return;
    const primary = composerRef.current?.querySelector<HTMLButtonElement>('[data-primary]:not(:disabled)');
    if (!primary) return;
    e.preventDefault();
    primary.click();
  };

  const setStage = (key: string, patch: Partial<DraftStage>) => setD((x) => ({ ...x, stages: x.stages.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const setAct = (key: string, patch: Partial<DraftActivity>) => setD((x) => ({ ...x, stages: x.stages.map((s) => ({ ...s, activities: s.activities.map((a) => (a.key === key ? { ...a, ...patch } : a)) })) }));

  const acts = allActivities(d);
  const owners = [...new Set(acts.map((a) => a.owner?.trim()).filter(Boolean) as string[])];
  // Mesma análise usada na gravação (draftToProcess): a revisão mostra exatamente o que entra.
  const analysis = useMemo(() => analyzeDraft(d), [d]);
  const process = useMemo(() => (d.step === 'review' ? draftToProcess(d) : null), [d]);
  const issues = useMemo(() => (process ? validateProcess(process).filter((i) => i.severity !== 'info') : []), [process]);
  const droppedSig = analysis.droppedStages.map((x) => `${x.key}:${x.reason}:${x.activities.length}`).join('|');
  const needsAck = droppedSig !== '' && ackDropped !== droppedSig;
  const blockReason = stale
    ? tx('as.block.stale')
    : !analysis.flat.length
    ? tx('as.block.noActs')
    : issues.some((i) => i.severity === 'error')
      ? tx('as.block.errors')
      : analysis.invalidDecisions.length
        ? tx('as.block.decisions')
        : needsAck
          ? tx('as.block.ack')
          : null;

  const finish = async () => {
    if (!process || blockReason || stale) return;
    if (demoBlocked('salvar')) return;
    setBusy(true);
    committing.current = true;
    try {
      // Rascunho antigo sem identidade: a recebida (já gravada antes de criar) passa a valer nesta tela.
      const r = await createFromDraft(DRAFT, d, process, { kind: 'wizard' }, { onDraftId: (id) => setD((x) => ({ ...x, draftId: id })) });
      setDone(r);
      window.scrollTo({ top: 0 });
    } catch (e) {
      committing.current = false;
      // Outra aba criou o projeto (com outro conteúdo) ou ele foi excluído: esta aba para e mantém o conteúdo.
      if (e instanceof DraftDivergedError) setStale({ reason: 'divergente', workspaceId: e.workspaceId });
      else if (e instanceof DraftAlreadyUsedError) setStale({ reason: 'excluido' });
      // A criação falhou: nada foi gravado, o rascunho continua e a pessoa pode tentar de novo.
      else toast('bad', tx('wz.toast.saveFail'));
    } finally {
      setBusy(false);
    }
  };
  /** Sai do modo "aba desatualizada" só por escolha da pessoa (depois de copiar). */
  const startOver = () => {
    localDraft.remove(DRAFT);
    setStale(null);
    setD(emptyDraft());
    setRestored(false);
  };
  const discard = async () => {
    if (!(await confirm({ title: tx('wz.discard.title'), body: tx('wz.discard.body'), confirm: tx('wz.discard.confirm'), danger: true }))) return;
    await db.deleteDraft(DRAFT).catch(() => {});
    localDraft.remove(DRAFT);
    setD(emptyDraft());
    setRestored(false);
  };

  // Transcrição: perguntas já respondidas, com "Corrigir".
  const answered = order.slice(0, idx).map((step) => ({ step, ...summary(step, d) })).filter((x) => x.q);
  const section = sectionOf(d.step);

  if (done) return <Success w={done.w} durable={done.durable} cleanupFailed={done.cleanup === 'falhou'} reused={done.reused} warnings={issues.length} onOpen={(path) => nav(`/app/p/${done.w.id}/${path}`, { replace: true })} />;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-6 pt-4 sm:pt-8">
      <div className="mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold">{tx('as.h1')}</h1>
          <Link to="/app/novo/formulario" className="inline-flex min-h-[32px] items-center text-xs font-semibold text-accent hover:underline">
            {tx('as.fillAll')}
          </Link>
        </div>
        <ol className="mt-3 flex gap-1" aria-label={tx('as.progress', { n: section + 1, total: SECTION_COUNT, name: SECTIONS[section] })}>
          {SECTIONS.map((s, i) => (
            <li key={s} className="flex-1" title={s}>
              <span className={clsx('block h-1.5 rounded-full', i < section ? 'bg-brand' : i === section ? 'bg-accentStrong' : 'bg-surface2')} />
            </li>
          ))}
        </ol>
        <p className="mt-1 flex justify-between text-xs text-muted">
          <span className="font-medium text-ink2">
            {tx('as.progress', { n: section + 1, total: SECTION_COUNT, name: SECTIONS[section] })}
          </span>
          <span data-testid="draft-storage">{stale ? tx('wz.save.stale') : storage === 'memoria' ? tx('wz.save.memory') : tx('as.save.saved')}</span>
        </p>
      </div>

      {storage === 'memoria' && (
        <div className="mb-3">
          <Callout tone="warn" title={tx('wz.mem.title')}>
            {tx('as.mem.body')}
          </Callout>
        </div>
      )}
      {stale && (
        <div className="mb-3">
          <StaleDraftNotice
            reason={stale.reason}
            noun="projeto"
            text={draftText(d)}
            onOpen={stale.workspaceId ? () => nav(`/app/p/${stale.workspaceId}/visao-geral`) : undefined}
            onNew={stale.reason === 'excluido' ? startOver : undefined}
          />
        </div>
      )}
      {already && !restored && !stale && (
        <div className="mb-3">
          <Callout
            tone="info"
            title={already.exists ? tx('as.already.exists') : tx('as.already.deleted')}
            action={already.exists ? <Button size="sm" variant="ghost" onClick={() => nav(`/app/p/${already.workspaceId}/visao-geral`)}>{tx('as.already.open')}</Button> : undefined}
          >
            {tx('wz.already.body')}
          </Callout>
        </div>
      )}
      {restored && !stale && (
        <div className="mb-3">
          <Callout tone="info" title={tx('wz.restored.title')} action={<Button size="sm" variant="ghost" onClick={() => void discard()}>{tx('wz.restored.restart')}</Button>} />
        </div>
      )}

      <div className="space-y-3" aria-live="polite">
        {answered.map((x) => (
          <div key={x.step} className="space-y-1.5">
            <Bubble>{x.q}</Bubble>
            <Answer onEdit={() => go(x.step)}>{x.a}</Answer>
          </div>
        ))}
      </div>

      <div
        ref={composerRef}
        key={`${d.step}:${d.step === 'details' ? d.detailIndex : ''}`}
        onKeyDown={onKeyDown}
        className="np-fade-in mt-4 rounded-2xl border border-line/15 bg-surface p-4 shadow-card sm:p-5"
        data-testid="assistant-step"
      >
        <button
          type="button"
          data-back
          className="-ml-2 -mt-1 mb-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-ink2 hover:bg-surface2 hover:text-ink"
          onClick={() => (canBack ? back() : nav('/app'))}
          aria-label={canBack ? (d.returnToReview ? tx('as.back.summary') : tx('as.back.prev')) : tx('as.back.home')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> {tx('wz.back')}
        </button>
        {ack && (
          <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-ok" data-testid="assistant-ack">
            <Check className="h-4 w-4 shrink-0" aria-hidden /> {ack}
          </p>
        )}
        {d.step === 'name' && (
          <TextStep
            q={tx('as.name.q')}
            help={tx('wz.f.name.help')}
            placeholder={tx('wz.f.name.ph')}
            nextLabel={nextLabel}
            value={d.name}
            onChange={(v) => set({ name: v })}
            examples={[tx('as.name.ex1'), tx('as.name.ex2'), tx('as.name.ex3')]}
            onNext={() => next()}
            required
          />
        )}
        {d.step === 'trigger' && (
          <TextStep q={tx('as.trigger.q')} help={tx('as.trigger.help')} placeholder={tx('as.trigger.ph')} nextLabel={nextLabel} value={d.trigger ?? ''} onChange={(v) => set({ trigger: v })} onNext={() => next()} onSkip={() => next({ trigger: undefined })} />
        )}
        {d.step === 'outcome' && (
          <TextStep q={tx('as.outcome.q')} help={tx('as.outcome.help')} placeholder={tx('as.outcome.ph')} nextLabel={nextLabel} value={d.outcome ?? ''} onChange={(v) => set({ outcome: v })} onNext={() => next()} onSkip={() => next({ outcome: undefined })} />
        )}
        {d.step === 'stages' && (
          <ListStep
            q={tx('as.stages.q')}
            help={tx('as.stages.help')}
            items={d.stages.map((s) => ({ key: s.key, label: s.name }))}
            onChange={(items) =>
              set({
                stages: items.map((it) => d.stages.find((s) => s.key === it.key) ?? { key: it.key, name: it.label, activities: [] }).map((s, i) => ({ ...s, name: items[i].label })),
              })
            }
            addLabel={tx('wz.s1.add')}
            textPlaceholder={tx('as.stages.textPh')}
            nextLabel={nextLabel}
            onNext={() => next()}
          />
        )}
        {d.step.startsWith('acts:') &&
          (() => {
            const st = d.stages.find((s) => `acts:${s.key}` === d.step);
            if (!st) return null;
            return (
              <ListStep
                key={st.key}
                q={tx('as.acts.q', { name: st.name })}
                help={tx('as.acts.help')}
                items={st.activities.map((a) => ({ key: a.key, label: a.name, meta: [a.owner, a.duration !== undefined ? `${fmtNum(a.duration)} ${UNIT_TXT[a.unit]}` : ''].filter(Boolean).join(' · ') }))}
                parse={(line) => {
                  const a = draftActivityFrom(line);
                  return { key: a.key, label: a.name, meta: [a.owner, a.duration !== undefined ? `${fmtNum(a.duration)} ${UNIT_TXT[a.unit]}` : ''].filter(Boolean).join(' · '), raw: line };
                }}
                onChange={(items) =>
                  setStage(st.key, {
                    skipped: false,
                    activities: items.map((it) => {
                      const prev = st.activities.find((a) => a.key === it.key);
                      if (prev) return { ...prev, name: it.label };
                      const fresh = draftActivityFrom(it.raw ?? it.label);
                      return { ...fresh, key: it.key, name: it.label };
                    }),
                  })
                }
                addLabel={tx('as.acts.add')}
                textPlaceholder={tx('as.acts.textPh')}
                nextLabel={nextLabel}
                onNext={() => next()}
                onSkip={() => {
                  setStage(st.key, { skipped: true });
                  next();
                }}
                skipLabel={tx('as.acts.skip')}
              />
            );
          })()}
        {d.step === 'details' && <DetailsStep d={d} owners={owners} setAct={setAct} set={set} nextLabel={nextLabel} onNext={() => next()} />}
        {d.step === 'decisions' && <DecisionsStep d={d} analysis={analysis} set={set} nextLabel={nextLabel} onNext={() => next({ decisionsAnswered: true })} />}
        {d.step === 'volume' && (
          <div className="space-y-4">
            <Bubble>{tx('as.vol.q')}</Bubble>
            <p className="text-sm text-ink2">{tx('as.vol.help')}</p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label={tx('as.vol.runs')} className="w-40">
                {(f) => <NumberInput {...f} value={d.volume} onChange={(v) => set({ volume: v, volumeUnknown: false })} placeholder={tx('as.vol.ph')} />}
              </Field>
              <div>
                <p className="mb-1 text-sm font-medium">{tx('as.vol.per')}</p>
                <Segmented<Period> label={tx('as.vol.period')} value={d.period} onChange={(v) => set({ period: v })} options={(Object.keys(PERIOD_TXT) as Period[]).map((k) => ({ value: k, label: PERIOD_TXT[k] }))} />
              </div>
            </div>
            <Actions>
              <Button variant="secondary" onClick={() => next({ volume: undefined, volumeUnknown: true })}>
                {tx('wz.lean.unknown')}
              </Button>
              <Button data-primary onClick={() => next({ volumeUnknown: false })} disabled={d.volume === undefined}>
                {nextLabel} <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </Actions>
          </div>
        )}
        {d.step === 'cost' && (
          <div className="space-y-4">
            <Bubble>{tx('as.cost.q')}</Bubble>
            <p className="text-sm text-ink2">{tx('as.cost.help')}</p>
            <Field label={tx('as.cost.label')} className="w-48">
              {(f) => <NumberInput {...f} value={d.costPerHour} onChange={(v) => set({ costPerHour: v, costUnknown: false })} placeholder={tx('wz.s3.cost.ph')} />}
            </Field>
            <Actions>
              <Button variant="secondary" onClick={() => next({ costPerHour: undefined, costUnknown: true })}>
                {tx('as.cost.skip')}
              </Button>
              <Button data-primary onClick={() => next({ costUnknown: false })} disabled={d.costPerHour === undefined}>
                {nextLabel} <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </Actions>
          </div>
        )}
        {d.step === 'review' && process && (
          <div className="space-y-4">
            <Bubble>{tx('as.rev.q')}</Bubble>
            <dl className="divide-y divide-line/10 rounded-lg border border-line/15 text-sm" data-testid="assistant-review">
              <ReviewRow label={tx('as.rev.process')} value={d.name} onEdit={() => go('name')} />
              <ReviewRow label={tx('as.rev.startEnd')} value={`${d.trigger || tr('d.type.start')} → ${d.outcome || tr('d.type.end')}`} onEdit={() => go('trigger')} />
              <ReviewRow label={tx('as.rev.stages')} value={analysis.stages.map((s) => `${s.name.trim()} (${s.activities.filter((a) => a.name.trim()).length})`).join(' → ') || '—'} onEdit={() => go('stages')} />
              <ReviewRow label={tx('as.rev.details')} value={tx('as.rev.detailsVal', { t: `${acts.filter((a) => a.duration !== undefined).length}/${acts.length}`, o: `${acts.filter((a) => a.owner).length}/${acts.length}` })} onEdit={() => set({ step: 'details', detailIndex: 0 })} />
              <ReviewRow label={tx('as.rev.decisions')} value={analysis.decisions.length ? analysis.decisions.map((x) => x.question.trim()).join('; ') : tx('as.rev.none')} onEdit={() => go('decisions')} />
              <ReviewRow label={tx('as.rev.volume')} value={d.volumeUnknown || d.volume === undefined ? tx('as.rev.notInformed') : tx('as.perPeriod', { v: fmtNum(d.volume), period: PERIOD_TXT[d.period] })} onEdit={() => go('volume')} />
              <ReviewRow label={tx('as.rev.cost')} value={d.costUnknown || d.costPerHour === undefined ? tx('as.rev.notInformed') : tx('as.money', { v: fmtNum(d.costPerHour) })} onEdit={() => go('cost')} />
            </dl>
            {analysis.invalidDecisions.length > 0 && (
              <Callout tone="bad" title={plural(analysis.invalidDecisions.length, 'as.n.decFix.1', 'as.n.decFix.n')} action={<Button size="sm" variant="secondary" onClick={() => go('decisions')}>{tx('as.rev.fixDecisions')}</Button>}>
                <ul className="list-disc pl-4" data-testid="invalid-decisions">
                  {analysis.invalidDecisions.map((x) => (
                    <li key={x.decision.key}>
                      {tx('as.rev.decN', { n: x.n })}
                      {x.decision.question.trim() ? ` “${x.decision.question.trim()}”` : ''}: {PROBLEM_TXT[x.problem]}
                    </li>
                  ))}
                </ul>
              </Callout>
            )}
            {analysis.droppedStages.length > 0 && (
              <Callout tone="warn" title={tx('as.rev.dropTitle')}>
                <ul className="space-y-2" data-testid="dropped-items">
                  {analysis.droppedStages.map((x) => (
                    <li key={x.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {tx('as.rev.dropStage', { name: x.name || tx('wz.text.noNameShort'), reason: DROP_TXT[x.reason] })}
                        {x.activities.length ? ` (${plural(x.activities.length, 'as.n.act.1', 'as.n.act.n')}: ${x.activities.join('; ')})` : ''}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => (x.reason === 'sem_nome' ? go('stages') : setD((y) => ({ ...y, step: `acts:${x.key}`, returnToReview: true })))}>
                        {tx('as.rev.completeNow')}
                      </Button>
                    </li>
                  ))}
                </ul>
                <label className="mt-3 flex min-h-[44px] items-center gap-2 font-medium text-ink">
                  <input type="checkbox" className="h-5 w-5" checked={!needsAck} onChange={(e) => setAckDropped(e.target.checked ? droppedSig : '')} />
                  {tx('as.rev.ack')}
                </label>
              </Callout>
            )}
            {issues.length === 0 && !analysis.invalidDecisions.length && !analysis.droppedStages.length ? (
              <Callout tone="ok">{tx('as.rev.allGood')}</Callout>
            ) : (
              issues.slice(0, 6).map((i) => (
                <Callout key={i.id} tone={i.severity === 'error' ? 'bad' : 'warn'} title={i.message}>
                  {i.fix}
                </Callout>
              ))
            )}
            <Actions>
              {blockReason && (
                <p className="w-full text-right text-sm text-ink2" id="assistant-block-reason" data-testid="assistant-block-reason">
                  {blockReason}
                </p>
              )}
              <Button data-primary onClick={() => void finish()} loading={busy} disabled={!!blockReason} aria-describedby={blockReason ? 'assistant-block-reason' : undefined}>
                <Check className="h-4 w-4" aria-hidden /> {tx('as.rev.create')}
              </Button>
            </Actions>
          </div>
        )}
      </div>
      <div ref={endRef} />
    </div>
  );
}

/** Texto simples do rascunho, para a pessoa copiar quando esta aba fica desatualizada. */
function draftText(d: AssistantDraft): string {
  const lines = [tr('wz.text.process', { name: d.name || tr('wz.text.noName') })];
  if (d.trigger) lines.push(tr('as.text.starts', { v: d.trigger }));
  if (d.outcome) lines.push(tr('as.text.ends', { v: d.outcome }));
  for (const s of d.stages) {
    lines.push('', tr('wz.text.stage', { name: s.name || tr('wz.text.noName') }) + (s.skipped ? tr('as.text.later') : ''));
    for (const a of s.activities) lines.push(`- ${a.name}${a.owner ? ` · ${a.owner}` : ''}${a.duration !== undefined ? ` · ${fmtNum(a.duration)} ${UNIT_TXT[a.unit]}` : ''}`);
  }
  if (d.decisions.length) lines.push('', tr('as.text.decisions'), ...d.decisions.map((x) => `- ${x.question}`));
  if (d.volume !== undefined && !d.volumeUnknown) lines.push('', tr('as.text.volume', { v: fmtNum(d.volume), period: PERIOD_TXT[d.period] }));
  if (d.costPerHour !== undefined && !d.costUnknown) lines.push(tr('wz.text.cost', { v: fmtNum(d.costPerHour) }));
  return lines.join('\n');
}

function summary(step: string, d: AssistantDraft): { q: string; a: string } {
  if (step === 'name') return { q: tr('wz.f.name'), a: d.name };
  if (step === 'trigger') return { q: tr('as.trigger.q'), a: d.trigger || tr('as.sum.skipped') };
  if (step === 'outcome') return { q: tr('as.sum.endQ'), a: d.outcome || tr('as.sum.skipped') };
  if (step === 'stages') return { q: tr('as.sum.stagesQ'), a: d.stages.map((s) => s.name).join(' → ') };
  if (step.startsWith('acts:')) {
    const s = d.stages.find((x) => `acts:${x.key}` === step);
    if (!s) return { q: '', a: '' };
    return { q: tr('as.sum.actsQ', { name: s.name }), a: s.skipped ? tr('as.sum.skipped') : s.activities.map((a) => a.name).join('; ') };
  }
  if (step === 'details') {
    const acts = allActivities(d);
    return { q: tr('as.sum.detailsQ'), a: tr('as.sum.detailsA', { a: acts.filter((x) => x.duration !== undefined).length, b: acts.length }) };
  }
  if (step === 'decisions') return { q: tr('as.sum.decQ'), a: d.decisions.length ? d.decisions.map((x) => x.question).join('; ') : tr('as.sum.none') };
  if (step === 'volume') return { q: tr('as.sum.volQ'), a: d.volumeUnknown || d.volume === undefined ? tr('wz.lean.unknown') : tr('as.perPeriod', { v: fmtNum(d.volume), period: PERIOD_TXT[d.period] }) };
  if (step === 'cost') return { q: tr('as.sum.costQ'), a: d.costUnknown || d.costPerHour === undefined ? tr('as.rev.notInformed') : tr('as.money', { v: fmtNum(d.costPerHour) }) };
  return { q: '', a: '' };
}

const PROBLEM_TXT = lazyLabels<DecisionProblem>({ sem_pergunta: 'as.prob.noQuestion', atividade_removida: 'as.prob.actRemoved', destino_removido: 'as.prob.targetRemoved' });
const DROP_TXT = lazyLabels<'pulada' | 'sem_atividades' | 'sem_nome'>({ pulada: 'as.drop.later', sem_atividades: 'as.drop.noActs', sem_nome: 'wz.text.noNameShort' });

// Perguntas de resposta única: corrigidas a partir do resumo, voltam direto ao resumo.
const SINGLE_ANSWER = new Set(['name', 'trigger', 'outcome', 'decisions', 'volume', 'cost']);

function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-brandInk" aria-hidden>
        <Bot className="h-4 w-4" />
      </span>
      <p className="rounded-2xl rounded-tl-sm bg-surface2 px-3 py-2 text-[15px] font-medium text-ink">{children}</p>
    </div>
  );
}
function Answer({ children, onEdit }: { children: ReactNode; onEdit: () => void }) {
  const { t: tx } = useI18n();
  return (
    <div className="flex items-start justify-end gap-2 pl-10">
      <p className="min-w-0 rounded-2xl rounded-tr-sm bg-brand/10 px-3 py-2 text-sm text-ink">{children}</p>
      <button type="button" onClick={onEdit} className="mt-1 inline-flex min-h-[32px] shrink-0 items-center gap-1 text-xs font-semibold text-accent hover:underline">
        <Pencil className="h-3 w-3" aria-hidden /> {tx('as.fix')}
      </button>
    </div>
  );
}
function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-1">{children}</div>;
}
function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  const { t: tx } = useI18n();
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{value}</dd>
      <button type="button" onClick={onEdit} className="shrink-0 text-xs font-semibold text-accent hover:underline" aria-label={tx('as.fixLabel', { label })}>
        {tx('as.fix')}
      </button>
    </div>
  );
}

function TextStep({ q, help, placeholder, nextLabel, value, onChange, examples, onNext, onSkip, required }: { q: string; help: string; placeholder: string; nextLabel: string; value: string; onChange: (v: string) => void; examples?: string[]; onNext: () => void; onSkip?: () => void; required?: boolean }) {
  const { t: tx } = useI18n();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!required || value.trim()) onNext();
      }}
    >
      <Bubble>{q}</Bubble>
      <p className="text-sm text-ink2">{help}</p>
      <Input aria-label={q} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} enterKeyHint="next" />
      {examples && (
        <div className="flex flex-wrap gap-2" aria-label={tx('as.name.suggestions')}>
          {examples.map((x) => (
            <button key={x} type="button" onClick={() => onChange(x)} className="min-h-[36px] rounded-full border border-line/20 px-3 text-sm text-ink2 hover:border-accent hover:text-ink">
              {x}
            </button>
          ))}
        </div>
      )}
      <Actions>
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            {tx('wz.skip')}
          </Button>
        )}
        <Button type="submit" disabled={required && !value.trim()}>
          {nextLabel} <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </Actions>
    </form>
  );
}

type Item = { key: string; label: string; meta?: string; raw?: string };
function ListStep({ q, help, items, onChange, addLabel, textPlaceholder, nextLabel, onNext, onSkip, skipLabel, parse }: { q: string; help: string; items: Item[]; onChange: (items: Item[]) => void; addLabel: string; textPlaceholder: string; nextLabel: string; onNext: () => void; onSkip?: () => void; skipLabel?: string; parse?: (line: string) => Item }) {
  const { t: tx } = useI18n();
  const [mode, setMode] = useState<'um' | 'texto'>('um');
  const [one, setOne] = useState('');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Item[] | null>(null);
  const toItem = parse ?? ((line: string) => ({ key: uid('i'), label: line }));
  const add = () => {
    const v = one.trim();
    if (!v) return;
    onChange([...items, toItem(v)]);
    setOne('');
  };
  const move = (i: number, dlt: number) => {
    const j = i + dlt;
    if (j < 0 || j >= items.length) return;
    const out = [...items];
    [out[i], out[j]] = [out[j], out[i]];
    onChange(out);
  };
  return (
    <div className="space-y-3">
      <Bubble>{q}</Bubble>
      <p className="text-sm text-ink2">{help}</p>
      <Segmented
        label={tx('as.list.how')}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setPreview(null);
        }}
        options={[
          { value: 'um', label: tx('as.list.one') },
          { value: 'texto', label: tx('as.list.text') },
        ]}
      />
      {mode === 'um' ? (
        <form
          className="flex gap-2"
          data-add
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input aria-label={addLabel} value={one} onChange={(e) => setOne(e.target.value)} placeholder={textPlaceholder.split('\n')[0]} enterKeyHint="enter" />
          <Button type="submit" variant="secondary" disabled={!one.trim()} aria-label={addLabel}>
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
        </form>
      ) : preview ? (
        <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
          <p className="text-sm font-medium">{tx('as.list.preview')}</p>
          <ol className="list-decimal space-y-0.5 pl-5 text-sm">
            {preview.map((p) => (
              <li key={p.key}>
                {p.label} {p.meta && <span className="text-xs text-muted">({p.meta})</span>}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                onChange([...items, ...preview]);
                setPreview(null);
                setText('');
                setMode('um');
              }}
            >
              <ListPlus className="h-4 w-4" aria-hidden /> {tx('as.list.addN', { n: preview.length })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              {tx('as.list.adjust')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea aria-label={tx('as.list.freeText', { q })} value={text} onChange={(e) => setText(e.target.value)} placeholder={textPlaceholder} rows={5} />
          <p className="text-xs text-muted">{tx('as.list.hint')}</p>
          <Button size="sm" variant="secondary" disabled={!text.trim()} onClick={() => setPreview(parseList(text).map(toItem))}>
            {tx('as.list.organize')}
          </Button>
        </div>
      )}
      {items.length > 0 && (
        <ol className="space-y-1.5" aria-label={tx('as.list.added')}>
          {items.map((it, i) => (
            <li key={it.key} className="flex items-center gap-2 rounded-lg border border-line/15 bg-surface2/40 py-1 pl-3 pr-1">
              <span className="w-5 text-xs font-semibold text-muted">{i + 1}.</span>
              <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
                <input aria-label={tx('as.list.item', { n: i + 1 })} value={it.label} onChange={(e) => onChange(items.map((x) => (x.key === it.key ? { ...x, label: e.target.value } : x)))} className="min-h-[36px] min-w-0 flex-1 bg-transparent text-sm text-ink outline-none focus-visible:outline-none" />
                {it.meta && <span className="-mt-1 pb-1 text-xs text-muted sm:mt-0 sm:shrink-0 sm:pb-0">{it.meta}</span>}
              </span>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-ink disabled:opacity-30" aria-label={tx('as.list.up', { label: it.label })} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-ink disabled:opacity-30" aria-label={tx('as.list.down', { label: it.label })} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-bad" aria-label={tx('as.list.remove', { label: it.label })} onClick={() => onChange(items.filter((x) => x.key !== it.key))}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <Actions>
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            {skipLabel ?? tx('wz.skip')}
          </Button>
        )}
        <Button data-primary onClick={onNext} disabled={!items.length || items.some((x) => !x.label.trim())}>
          {nextLabel} <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </Actions>
    </div>
  );
}

function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T | undefined; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('min-h-[40px] rounded-full border px-3.5 text-sm transition-colors', value === o.value ? 'border-brand bg-brand text-brandInk' : 'border-line/25 text-ink2 hover:border-line/50 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DetailsStep({ d, owners, setAct, set, nextLabel, onNext }: { d: AssistantDraft; owners: string[]; setAct: (k: string, p: Partial<DraftActivity>) => void; set: (p: Partial<AssistantDraft>) => void; nextLabel: string; onNext: () => void }) {
  const { t: tx } = useI18n();
  const acts = allActivities(d);
  const i = Math.min(d.detailIndex, Math.max(0, acts.length - 1));
  const a = acts[i];
  if (!a)
    return (
      <div className="space-y-3">
        <Bubble>{tx('as.det.none')}</Bubble>
        <Actions>
          <Button data-primary onClick={onNext}>{nextLabel}</Button>
        </Actions>
      </div>
    );
  const known = a.reviewed;
  return (
    <div className="space-y-4">
      <Bubble>
        {tx('as.det.title', { name: a.name })} <span className="font-normal text-muted">({a.stage})</span>
      </Bubble>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {tx('as.det.count', { n: i + 1, total: acts.length })}
        {known && <Badge tone="ok">{tx('as.det.known')}</Badge>}
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tx('as.det.timeQ')}</legend>
        <div className="flex flex-wrap items-center gap-2">
          <NumberInput aria-label={tx('wz.s2.time')} className="w-28" value={a.durationUnknown ? undefined : a.duration} onChange={(v) => setAct(a.key, { duration: v, durationUnknown: false })} placeholder={tx('wz.s2.time.ph')} />
          <Segmented<DurationUnit> label={tx('as.det.unitLabel')} value={a.unit} onChange={(u) => setAct(a.key, { unit: u })} options={[{ value: 'min', label: tx('as.unit.min') }, { value: 'h', label: tx('wz.unit.h') }, { value: 'd', label: tx('wz.unit.d') }]} />
          <button type="button" aria-pressed={!!a.durationUnknown} onClick={() => setAct(a.key, { durationUnknown: !a.durationUnknown, duration: undefined })} className={clsx('min-h-[40px] rounded-full border px-3 text-sm', a.durationUnknown ? 'border-brand bg-brand text-brandInk' : 'border-line/25 text-ink2')}>
            {tx('as.det.unmeasured')}
          </button>
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tx('as.det.whoQ')}</legend>
        {owners.length > 0 && <Chips label={tx('as.det.owners')} value={a.owner} options={owners.map((o) => ({ value: o, label: o }))} onChange={(v) => setAct(a.key, { owner: v })} />}
        <Input aria-label={tx('as.det.who')} value={a.owner ?? ''} onChange={(e) => setAct(a.key, { owner: e.target.value || undefined })} placeholder={tx('as.det.who.ph')} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tx('as.det.peopleQ')}</legend>
        <Chips label={tx('as.det.people')} value={a.people !== undefined ? String(Math.min(a.people, 4)) as '1' : undefined} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: tx('as.det.fourPlus') }]} onChange={(v) => setAct(a.key, { people: Number(v) })} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tx('as.det.waitQ')}</legend>
        <Chips label={tx('as.det.wait')} value={a.waitState} options={[{ value: 'nao_ha', label: tx('as.det.noWait') }, { value: 'informada', label: tx('as.det.yesInform') }, { value: 'nao_sei', label: tx('as.det.unsure') }]} onChange={(v) => setAct(a.key, { waitState: v })} />
        {a.waitState === 'informada' && (
          <div className="flex items-center gap-2 text-sm">
            <NumberInput aria-label={tx('as.det.waitTime')} className="w-28" value={a.wait} onChange={(v) => setAct(a.key, { wait: v })} />
            <span className="text-ink2">{tx('as.det.sameUnit', { unit: UNIT_TXT[a.unit] })}</span>
          </div>
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tx('as.det.reworkQ')}</legend>
        <Chips label={tx('as.det.rework')} value={a.rework} options={[{ value: 'nao', label: tx('as.det.no') }, { value: 'sim', label: tx('as.det.yesRework') }, { value: 'nao_sei', label: tx('as.det.unsure') }]} onChange={(v) => setAct(a.key, { rework: v })} />
        {a.rework === 'sim' && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink2">{tx('as.det.happensIn')}</span>
            <NumberInput aria-label={tx('as.det.reworkPct')} className="w-24" value={a.reworkPct} onChange={(v) => setAct(a.key, { reworkPct: v !== undefined ? Math.min(100, v) : undefined })} />
            <span className="text-ink2">{tx('as.det.outOf100')}</span>
          </div>
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tx('as.det.leanQ')}</legend>
        <Chips<LeanClass | 'nao_sei'>
          label={tx('as.det.lean')}
          value={a.lean}
          options={[
            { value: 'VA', label: tx('as.det.leanVA') },
            { value: 'NNVA', label: tx('as.det.leanNNVA') },
            { value: 'W', label: tx('as.det.leanW') },
            { value: 'nao_sei', label: tx('as.det.unsure') },
          ]}
          onChange={(v) => setAct(a.key, { lean: v })}
        />
        <p className="text-xs text-muted">{tx('as.det.requiredNote')}</p>
      </fieldset>
      <Actions>
        {i > 0 && (
          <Button variant="ghost" onClick={() => set({ detailIndex: i - 1 })}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> {tx('as.det.prev')}
          </Button>
        )}
        <Button variant="secondary" onClick={onNext}>
          {tx('as.det.skipRest')}
        </Button>
        {i < acts.length - 1 ? (
          <Button
            data-primary
            onClick={() => {
              setAct(a.key, { reviewed: true });
              set({ detailIndex: i + 1 });
            }}
          >
            {tx('as.det.nextAct')} <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button
            data-primary
            onClick={() => {
              setAct(a.key, { reviewed: true });
              onNext();
            }}
          >
            {nextLabel} <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </Actions>
    </div>
  );
}

function DecisionsStep({ d, analysis, set, nextLabel, onNext }: { d: AssistantDraft; analysis: DraftAnalysis; set: (p: Partial<AssistantDraft>) => void; nextLabel: string; onNext: () => void }) {
  const { t: tx } = useI18n();
  // Só atividades que entram no projeto podem ser escolhidas (as de etapas puladas, não).
  const acts = analysis.flat.map(({ s, a }) => ({ key: a.key, name: a.name.trim(), stage: s.name.trim() }));
  const valid = new Set(acts.map((a) => a.key));
  const setDec = (key: string, patch: Partial<AssistantDraft['decisions'][number]>) => set({ decisions: d.decisions.map((x) => (x.key === key ? { ...x, ...patch } : x)) });
  const add = () => set({ decisions: [...d.decisions, { key: uid('dc'), question: '', afterKey: acts[0]?.key ?? '', noTarget: '__end' }] });
  const problems = new Map(analysis.invalidDecisions.map((x) => [x.decision.key, x.problem]));
  const blocked = problems.size > 0;
  return (
    <div className="space-y-4">
      <Bubble>{tx('as.dec.q')}</Bubble>
      <p className="text-sm text-ink2">{tx('as.dec.help')}</p>
      {d.decisions.map((x, n) => {
        const problem = problems.get(x.key);
        const afterOk = valid.has(x.afterKey);
        const noOk = x.noTarget === '__end' || valid.has(x.noTarget);
        return (
          <div key={x.key} className={clsx('space-y-3 rounded-lg border p-3', problem ? 'border-bad/50 bg-bad/5' : 'border-violet/30 bg-violet/5')} data-testid="assistant-decision">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{tx('as.rev.decN', { n: n + 1 })}</p>
              <Button size="sm" variant="ghost" aria-label={tx('as.dec.removeAria', { n: n + 1 })} onClick={() => set({ decisions: d.decisions.filter((y) => y.key !== x.key) })}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            {problem && (
              <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-bad">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {problem === 'sem_pergunta' ? tx('as.dec.writeQ') : tx('as.dec.chooseOther', { problem: `${PROBLEM_TXT[problem].charAt(0).toUpperCase()}${PROBLEM_TXT[problem].slice(1)}` })}
              </p>
            )}
            <Field label={tx('as.dec.question')}>{(f) => <Input {...f} value={x.question} onChange={(e) => setDec(x.key, { question: e.target.value })} placeholder={tx('as.dec.question.ph')} />}</Field>
            <Field label={tx('as.dec.after')}>
              {(f) => (
                <Select {...f} value={afterOk ? x.afterKey : ''} onChange={(e) => setDec(x.key, { afterKey: e.target.value })} aria-invalid={!afterOk || undefined}>
                  {!afterOk && (
                    <option value="" disabled>
                      {tx('as.dec.chooseAct')}
                    </option>
                  )}
                  {acts.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.stage} › {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={tx('wz.s2.noTo')}>
              {(f) => (
                <Select {...f} value={noOk ? x.noTarget : ''} onChange={(e) => setDec(x.key, { noTarget: e.target.value })} aria-invalid={!noOk || undefined}>
                  {!noOk && (
                    <option value="" disabled>
                      {tx('as.dec.chooseTo')}
                    </option>
                  )}
                  <option value="__end">{tx('wz.s2.endProcess')}</option>
                  {acts.map((a) => (
                    <option key={a.key} value={a.key}>
                      {tx('as.dec.goTo')} {a.stage} › {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        );
      })}
      {blocked && (
        <p className="text-sm text-ink2" data-testid="decisions-block-reason">
          {tx('as.dec.blocked')}
        </p>
      )}
      <Actions>
        <Button variant="secondary" onClick={add} disabled={!acts.length}>
          <Plus className="h-4 w-4" aria-hidden /> {d.decisions.length ? tx('as.dec.another') : tx('as.dec.yesAdd')}
        </Button>
        <Button data-primary onClick={onNext} disabled={blocked}>
          {d.decisions.length ? nextLabel : tx('as.dec.noneNext', { next: `${nextLabel.charAt(0).toLowerCase()}${nextLabel.slice(1)}` })} <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </Actions>
    </div>
  );
}

/** "Aha!": o que acabou de ser mapeado, com números reais do processo criado. */
function Success({ w, durable, cleanupFailed, reused, warnings, onOpen }: { w: Workspace; durable: boolean; cleanupFailed: boolean; reused: boolean; warnings: number; onOpen: (path: string) => void }) {
  const { t: tx } = useI18n();
  const p = w.asIs;
  const tasks = p.activities.filter((a) => a.type === 'task');
  const owners = new Set(tasks.map((a) => a.owner?.trim()).filter(Boolean)).size;
  const decisions = p.activities.filter((a) => a.type === 'decision').length;
  const timed = tasks.filter((a) => typeof a.duration === 'number').length;
  // Requisito real do diagnóstico (domain/journey): pelo menos uma atividade com duração.
  const diagReady = stepRequirements('diagnostico', w).every((r) => r.kind !== 'obrigatório' || r.ok);
  const recs = useMemo(() => recommend(p, w.bottleneck.criterion, w.bottleneck.thresholdPct).length, [p, w.bottleneck]);
  const toast = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const facts = [
    plural(tasks.length, 'as.n.inOrder.1', 'as.n.inOrder.n'),
    owners ? plural(owners, 'as.n.owner.1', 'as.n.owner.n') : null,
    decisions ? plural(decisions, 'as.n.decPoint.1', 'as.n.decPoint.n') : null,
    recs ? plural(recs, 'as.n.opp.1', 'as.n.opp.n') : null,
  ].filter(Boolean) as string[];
  const download = async () => {
    try {
      await shareProject(w);
    } catch {
      toast('bad', tx('as.ok.fileFail'));
    }
  };
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-6 sm:pt-12" data-testid="assistant-success">
      <div className={clsx('np-fade-in rounded-2xl border bg-surface p-6 text-center shadow-card sm:p-8', durable ? 'border-ok/30' : 'border-amber/50')}>
        <span className={clsx('mx-auto flex h-14 w-14 items-center justify-center rounded-full', durable ? 'bg-ok/15 text-ok' : 'bg-amber/15 text-amber')} aria-hidden>
          {durable ? <Sparkles className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
        </span>
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-extrabold tracking-tight outline-none">
          {durable ? tx('as.ok.titleDurable', { stages: plural(p.stageOrder.length, 'as.n.stage.1', 'as.n.stage.n') }) : tx('as.ok.title', { stages: plural(p.stageOrder.length, 'as.n.stage.1', 'as.n.stage.n') })}
        </h1>
        {durable ? (
          <p className="mt-2 text-ink2" data-testid="success-storage">
            {tx('as.ok.saved', { name: p.name })}
          </p>
        ) : (
          <div className="mt-3 text-left" data-testid="success-storage">
            <Callout tone="warn" title={tx('as.ok.notSaved')} action={<Button size="sm" onClick={() => void download()}><Download className="h-4 w-4" aria-hidden /> {tx('as.ok.download')}</Button>}>
              {tx('as.ok.notSavedBody', { name: p.name })}
            </Callout>
          </div>
        )}
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm">
          {facts.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> {f}
            </li>
          ))}
          <li className="flex items-start gap-2" data-testid="success-diagnosis">
            {diagReady ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> : <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden />}
            <span>
              {!diagReady
                ? tx('as.ok.diagNo')
                : timed < tasks.length
                  ? tx('as.ok.diagPartial', { a: timed, b: tasks.length })
                  : tx('as.ok.diagAll')}
            </span>
          </li>
          {warnings > 0 && (
            <li className="flex items-start gap-2 text-ink2">
              <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden /> {plural(warnings, 'as.n.warn.1', 'as.n.warn.n')}
            </li>
          )}
        </ul>
        {reused && (
          <p className="mt-4 text-xs text-muted" data-testid="success-reused">
            {tx('as.ok.reused')}
          </p>
        )}
        {cleanupFailed && (
          <p className="mt-4 text-xs text-muted" data-testid="success-cleanup">
            {tx('as.ok.cleanup')}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {diagReady ? (
            <Button size="lg" onClick={() => onOpen('plano')}>
              {tx('as.ok.plan')} <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button size="lg" onClick={() => onOpen('dados')}>
              {tx('as.ok.durations')} <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
          <Button size="lg" variant="secondary" onClick={() => onOpen(warnings ? 'validar' : 'mapa')}>
            <MapIcon className="h-4 w-4" aria-hidden /> {warnings ? tx('as.ok.review') : tx('as.ok.map')}
          </Button>
        </div>
      </div>
    </div>
  );
}
