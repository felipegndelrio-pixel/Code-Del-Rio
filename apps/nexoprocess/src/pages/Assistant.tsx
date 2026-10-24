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
import { useHardwareBack } from '../state/backNav';
import { localDraft } from '../storage/localDraft';
import { demoBlocked } from '../license/demo';
import { recommend } from '../domain/recommendations';
import { stepRequirements } from '../domain/journey';
import type { Workspace } from '../domain/types';

const DRAFT = 'assistant';
const SECTIONS = ['Processo', 'Etapas', 'Atividades', 'Detalhes', 'Decisões', 'Volume e custo', 'Revisão'];
const UNIT_TXT: Record<DurationUnit, string> = { min: 'min', h: 'h', d: 'dias' };
const PERIOD_TXT: Record<Period, string> = { dia: 'dia', semana: 'semana', mes: 'mês', ano: 'ano' };

function stepOrder(d: AssistantDraft): string[] {
  return ['name', 'trigger', 'outcome', 'stages', ...d.stages.map((s) => `acts:${s.key}`), 'details', 'decisions', 'volume', 'cost', 'review'];
}
/** Para onde o botão leva, em linguagem natural ("Avançar para as etapas"). */
function stepTarget(step: string, d: AssistantDraft): string {
  if (step.startsWith('acts:')) {
    const st = d.stages.find((x) => `acts:${x.key}` === step);
    return st ? `as atividades de “${st.name}”` : 'as atividades';
  }
  const T: Record<string, string> = { name: 'o nome', trigger: 'o início do processo', outcome: 'o fim do processo', stages: 'as etapas', details: 'os detalhes', decisions: 'as decisões', volume: 'o volume', cost: 'o custo-hora', review: 'a revisão' };
  return T[step] ?? 'a próxima pergunta';
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Confirmação curta ao chegar em marcos do roteiro (não aparece ao corrigir a partir da revisão). */
function ackFor(step: string, d: AssistantDraft, order: string[]): string | null {
  const acts = allActivities(d);
  if (step === 'trigger') return `Ótimo, vamos mapear “${d.name}”.`;
  if (step === order.find((x) => x.startsWith('acts:'))) return `Boa! ${plural(d.stages.length, 'etapa definida', 'etapas definidas')}. Agora, o que acontece em cada uma.`;
  if (step === 'details' && acts.length) return `Boa, isso já ajuda a mapear o fluxo: ${plural(acts.length, 'atividade', 'atividades')} até aqui.`;
  if (step === 'volume') return 'Fluxo desenhado. Faltam só dois números, e os dois são opcionais.';
  return null;
}

function sectionOf(step: string): number {
  if (['name', 'trigger', 'outcome'].includes(step)) return 0;
  if (step === 'stages') return 1;
  if (step.startsWith('acts:')) return 2;
  return { details: 3, decisions: 4, volume: 5, cost: 5, review: 6 }[step] ?? 0;
}

export default function Assistant() {
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
  const nextLabel = d.returnToReview ? 'Voltar à revisão' : `Avançar para ${stepTarget(order[Math.min(order.length - 1, idx + 1)], d)}`;
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
    ? 'Esta aba não cria o projeto: ele já foi criado em outra aba. Copie seus dados acima.'
    : !analysis.flat.length
    ? 'Falta pelo menos uma atividade: complete uma etapa para criar o projeto.'
    : issues.some((i) => i.severity === 'error')
      ? 'Corrija os pontos em vermelho acima para criar o projeto.'
      : analysis.invalidDecisions.length
        ? 'Corrija ou remova as decisões destacadas para criar o projeto.'
        : needsAck
          ? 'Confirme acima que deseja criar o projeto sem os itens que não serão salvos.'
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
      else toast('bad', 'Não conseguimos salvar neste navegador. Confira se o armazenamento do site está liberado e tente de novo.');
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
    if (!(await confirm({ title: 'Começar do zero?', body: 'As respostas até aqui serão apagadas deste aparelho.', confirm: 'Apagar e recomeçar', danger: true }))) return;
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
          <h1 className="text-xl font-semibold">Vamos mapear seu processo</h1>
          <Link to="/app/novo/formulario" className="inline-flex min-h-[32px] items-center text-xs font-semibold text-accent hover:underline">
            Prefere preencher tudo de uma vez?
          </Link>
        </div>
        <ol className="mt-3 flex gap-1" aria-label={`Etapa ${section + 1} de ${SECTIONS.length}: ${SECTIONS[section]}`}>
          {SECTIONS.map((s, i) => (
            <li key={s} className="flex-1" title={s}>
              <span className={clsx('block h-1.5 rounded-full', i < section ? 'bg-brand' : i === section ? 'bg-accentStrong' : 'bg-surface2')} />
            </li>
          ))}
        </ol>
        <p className="mt-1 flex justify-between text-xs text-muted">
          <span className="font-medium text-ink2">
            Etapa {section + 1} de {SECTIONS.length}: {SECTIONS[section]}
          </span>
          <span data-testid="draft-storage">{stale ? 'Esta aba não está salvando' : storage === 'memoria' ? 'Rascunho só nesta aba' : 'Rascunho salvo neste aparelho'}</span>
        </p>
      </div>

      {storage === 'memoria' && (
        <div className="mb-3">
          <Callout tone="warn" title="Este navegador bloqueou o armazenamento local">
            Você pode montar o projeto, mas ele ficará só nesta aba e some ao fechá-la. Depois de criar, baixe o arquivo do projeto para não perder nada.
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
            title={already.exists ? 'Seu último rascunho já virou um projeto.' : 'Seu último rascunho já tinha virado um projeto, que foi excluído depois.'}
            action={already.exists ? <Button size="sm" variant="ghost" onClick={() => nav(`/app/p/${already.workspaceId}/visao-geral`)}>Abrir o projeto</Button> : undefined}
          >
            Não vamos criá-lo de novo. Este é um rascunho novo.
          </Callout>
        </div>
      )}
      {restored && !stale && (
        <div className="mb-3">
          <Callout tone="info" title="Continuamos de onde você parou." action={<Button size="sm" variant="ghost" onClick={() => void discard()}>Começar do zero</Button>} />
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
          aria-label={canBack ? (d.returnToReview ? 'Voltar ao resumo' : 'Voltar à pergunta anterior') : 'Voltar para Meus projetos'}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
        </button>
        {ack && (
          <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-ok" data-testid="assistant-ack">
            <Check className="h-4 w-4 shrink-0" aria-hidden /> {ack}
          </p>
        )}
        {d.step === 'name' && (
          <TextStep
            q="Vamos começar. Como você chama esse processo?"
            help="Use o nome que a equipe usa no dia a dia. Dá para mudar depois."
            placeholder="Ex.: Análise de crédito"
            nextLabel={nextLabel}
            value={d.name}
            onChange={(v) => set({ name: v })}
            examples={['Aprovação de compras', 'Atendimento de solicitações internas', 'Processamento de pedidos']}
            onNext={() => next()}
            required
          />
        )}
        {d.step === 'trigger' && (
          <TextStep q="O que faz esse processo começar?" help="Pense no evento que dispara o trabalho." placeholder="Ex.: uma área pede a compra de um material" nextLabel={nextLabel} value={d.trigger ?? ''} onChange={(v) => set({ trigger: v })} onNext={() => next()} onSkip={() => next({ trigger: undefined })} />
        )}
        {d.step === 'outcome' && (
          <TextStep q="E como ele termina? O que é entregue no fim?" help="O resultado que fecha o ciclo." placeholder="Ex.: pedido de compra enviado ao fornecedor" nextLabel={nextLabel} value={d.outcome ?? ''} onChange={(v) => set({ outcome: v })} onNext={() => next()} onSkip={() => next({ outcome: undefined })} />
        )}
        {d.step === 'stages' && (
          <ListStep
            q="Quais são as grandes etapas, na ordem em que acontecem?"
            help="De 2 a 7 blocos costuma bastar. Ex.: Solicitação → Aprovação → Cotação → Compra."
            items={d.stages.map((s) => ({ key: s.key, label: s.name }))}
            onChange={(items) =>
              set({
                stages: items.map((it) => d.stages.find((s) => s.key === it.key) ?? { key: it.key, name: it.label, activities: [] }).map((s, i) => ({ ...s, name: items[i].label })),
              })
            }
            addLabel="Adicionar etapa"
            textPlaceholder={'Solicitação\nAprovação\nCotação\nCompra'}
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
                q={`O que acontece na etapa “${st.name}”?`}
                help="Liste as atividades em ordem, começando por um verbo. Se já souber quem faz e quanto tempo leva, escreva junto — “Aprovar compra por Gestor (15 min)” — e não perguntamos de novo."
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
                addLabel="Adicionar atividade"
                textPlaceholder={'Aprovar por Gestor (15 min)\nAnalisar orçamento por Comprador\nRegistrar pedido'}
                nextLabel={nextLabel}
                onNext={() => next()}
                onSkip={() => {
                  setStage(st.key, { skipped: true });
                  next();
                }}
                skipLabel="Ainda não sei — completo depois"
              />
            );
          })()}
        {d.step === 'details' && <DetailsStep d={d} owners={owners} setAct={setAct} set={set} nextLabel={nextLabel} onNext={() => next()} />}
        {d.step === 'decisions' && <DecisionsStep d={d} analysis={analysis} set={set} nextLabel={nextLabel} onNext={() => next({ decisionsAnswered: true })} />}
        {d.step === 'volume' && (
          <div className="space-y-4">
            <Bubble>Quantas vezes esse processo acontece?</Bubble>
            <p className="text-sm text-ink2">Com esse número, calculamos o esforço por mês e a capacidade da equipe. Sem ele, ainda mostramos o tempo de cada execução.</p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Execuções" className="w-40">
                {(f) => <NumberInput {...f} value={d.volume} onChange={(v) => set({ volume: v, volumeUnknown: false })} placeholder="Ex.: 300" />}
              </Field>
              <div>
                <p className="mb-1 text-sm font-medium">por</p>
                <Segmented<Period> label="Período do volume" value={d.period} onChange={(v) => set({ period: v })} options={(Object.keys(PERIOD_TXT) as Period[]).map((k) => ({ value: k, label: PERIOD_TXT[k] }))} />
              </div>
            </div>
            <Actions>
              <Button variant="secondary" onClick={() => next({ volume: undefined, volumeUnknown: true })}>
                Não sei ainda
              </Button>
              <Button data-primary onClick={() => next({ volumeUnknown: false })} disabled={d.volume === undefined}>
                {nextLabel} <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </Actions>
          </div>
        )}
        {d.step === 'cost' && (
          <div className="space-y-4">
            <Bubble>Quanto custa, em média, uma hora de quem executa?</Bubble>
            <p className="text-sm text-ink2">Some salário, encargos e benefícios e divida pelas horas trabalhadas. É opcional: sem esse dado, não mostramos valores em R$ — nunca estimamos por você.</p>
            <Field label="Custo-hora (R$)" className="w-48">
              {(f) => <NumberInput {...f} value={d.costPerHour} onChange={(v) => set({ costPerHour: v, costUnknown: false })} placeholder="Ex.: 55" />}
            </Field>
            <Actions>
              <Button variant="secondary" onClick={() => next({ costPerHour: undefined, costUnknown: true })}>
                Não sei / prefiro não informar
              </Button>
              <Button data-primary onClick={() => next({ costUnknown: false })} disabled={d.costPerHour === undefined}>
                {nextLabel} <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </Actions>
          </div>
        )}
        {d.step === 'review' && process && (
          <div className="space-y-4">
            <Bubble>Tudo pronto! Confira o resumo antes de criarmos o projeto.</Bubble>
            <dl className="divide-y divide-line/10 rounded-lg border border-line/15 text-sm" data-testid="assistant-review">
              <ReviewRow label="Processo" value={d.name} onEdit={() => go('name')} />
              <ReviewRow label="Início · fim" value={`${d.trigger || 'Início'} → ${d.outcome || 'Fim'}`} onEdit={() => go('trigger')} />
              <ReviewRow label="Etapas" value={analysis.stages.map((s) => `${s.name.trim()} (${s.activities.filter((a) => a.name.trim()).length})`).join(' → ') || '—'} onEdit={() => go('stages')} />
              <ReviewRow label="Detalhes" value={`${acts.filter((a) => a.duration !== undefined).length}/${acts.length} com tempo · ${acts.filter((a) => a.owner).length}/${acts.length} com responsável`} onEdit={() => set({ step: 'details', detailIndex: 0 })} />
              <ReviewRow label="Decisões" value={analysis.decisions.length ? analysis.decisions.map((x) => x.question.trim()).join('; ') : 'Nenhuma'} onEdit={() => go('decisions')} />
              <ReviewRow label="Volume" value={d.volumeUnknown || d.volume === undefined ? 'Não informado' : `${fmtNum(d.volume)} por ${PERIOD_TXT[d.period]}`} onEdit={() => go('volume')} />
              <ReviewRow label="Custo-hora" value={d.costUnknown || d.costPerHour === undefined ? 'Não informado' : `R$ ${fmtNum(d.costPerHour)}`} onEdit={() => go('cost')} />
            </dl>
            {analysis.invalidDecisions.length > 0 && (
              <Callout tone="bad" title={plural(analysis.invalidDecisions.length, 'decisão precisa de correção', 'decisões precisam de correção')} action={<Button size="sm" variant="secondary" onClick={() => go('decisions')}>Corrigir decisões</Button>}>
                <ul className="list-disc pl-4" data-testid="invalid-decisions">
                  {analysis.invalidDecisions.map((x) => (
                    <li key={x.decision.key}>
                      Decisão {x.n}
                      {x.decision.question.trim() ? ` “${x.decision.question.trim()}”` : ''}: {PROBLEM_TXT[x.problem]}
                    </li>
                  ))}
                </ul>
              </Callout>
            )}
            {analysis.droppedStages.length > 0 && (
              <Callout tone="warn" title="Não serão salvos no projeto">
                <ul className="space-y-2" data-testid="dropped-items">
                  {analysis.droppedStages.map((x) => (
                    <li key={x.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Etapa “{x.name || 'sem nome'}” — {DROP_TXT[x.reason]}
                        {x.activities.length ? ` (${plural(x.activities.length, 'atividade', 'atividades')}: ${x.activities.join('; ')})` : ''}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => (x.reason === 'sem_nome' ? go('stages') : setD((y) => ({ ...y, step: `acts:${x.key}`, returnToReview: true })))}>
                        Completar agora
                      </Button>
                    </li>
                  ))}
                </ul>
                <label className="mt-3 flex min-h-[44px] items-center gap-2 font-medium text-ink">
                  <input type="checkbox" className="h-5 w-5" checked={!needsAck} onChange={(e) => setAckDropped(e.target.checked ? droppedSig : '')} />
                  Entendi: criar o projeto sem esses itens
                </label>
              </Callout>
            )}
            {issues.length === 0 && !analysis.invalidDecisions.length && !analysis.droppedStages.length ? (
              <Callout tone="ok">Tudo certo por aqui. Você pode completar ou ajustar qualquer dado depois.</Callout>
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
                <Check className="h-4 w-4" aria-hidden /> Criar meu projeto
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
  const lines = [`Processo: ${d.name || '(sem nome)'}`];
  if (d.trigger) lines.push(`Começa quando: ${d.trigger}`);
  if (d.outcome) lines.push(`Termina com: ${d.outcome}`);
  for (const s of d.stages) {
    lines.push('', `Etapa: ${s.name || '(sem nome)'}${s.skipped ? ' (para completar depois)' : ''}`);
    for (const a of s.activities) lines.push(`- ${a.name}${a.owner ? ` · ${a.owner}` : ''}${a.duration !== undefined ? ` · ${fmtNum(a.duration)} ${UNIT_TXT[a.unit]}` : ''}`);
  }
  if (d.decisions.length) lines.push('', 'Decisões:', ...d.decisions.map((x) => `- ${x.question}`));
  if (d.volume !== undefined && !d.volumeUnknown) lines.push('', `Volume: ${fmtNum(d.volume)} por ${PERIOD_TXT[d.period]}`);
  if (d.costPerHour !== undefined && !d.costUnknown) lines.push(`Custo-hora: R$ ${fmtNum(d.costPerHour)}`);
  return lines.join('\n');
}

function summary(step: string, d: AssistantDraft): { q: string; a: string } {
  if (step === 'name') return { q: 'Como você chama esse processo?', a: d.name };
  if (step === 'trigger') return { q: 'O que faz esse processo começar?', a: d.trigger || 'Pulado — dá para completar depois' };
  if (step === 'outcome') return { q: 'Como ele termina?', a: d.outcome || 'Pulado — dá para completar depois' };
  if (step === 'stages') return { q: 'Quais são as grandes etapas?', a: d.stages.map((s) => s.name).join(' → ') };
  if (step.startsWith('acts:')) {
    const s = d.stages.find((x) => `acts:${x.key}` === step);
    if (!s) return { q: '', a: '' };
    return { q: `O que acontece em “${s.name}”?`, a: s.skipped ? 'Pulado — dá para completar depois' : s.activities.map((a) => a.name).join('; ') };
  }
  if (step === 'details') {
    const acts = allActivities(d);
    return { q: 'Detalhes das atividades', a: `${acts.filter((a) => a.duration !== undefined).length} de ${acts.length} com tempo informado` };
  }
  if (step === 'decisions') return { q: 'Há pontos de decisão?', a: d.decisions.length ? d.decisions.map((x) => x.question).join('; ') : 'Nenhum' };
  if (step === 'volume') return { q: 'Quantas vezes o processo acontece?', a: d.volumeUnknown || d.volume === undefined ? 'Não sei ainda' : `${fmtNum(d.volume)} por ${PERIOD_TXT[d.period]}` };
  if (step === 'cost') return { q: 'Custo-hora médio', a: d.costUnknown || d.costPerHour === undefined ? 'Não informado' : `R$ ${fmtNum(d.costPerHour)}` };
  return { q: '', a: '' };
}

const PROBLEM_TXT: Record<DecisionProblem, string> = {
  sem_pergunta: 'falta escrever a pergunta.',
  atividade_removida: 'a atividade escolhida em “Acontece depois de” foi removida ou está numa etapa que não entra no projeto.',
  destino_removido: 'a atividade escolhida em “Se a resposta for NÃO” foi removida ou está numa etapa que não entra no projeto.',
};
const DROP_TXT: Record<'pulada' | 'sem_atividades' | 'sem_nome', string> = {
  pulada: 'marcada para completar depois',
  sem_atividades: 'sem atividades',
  sem_nome: 'sem nome',
};

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
  return (
    <div className="flex items-start justify-end gap-2 pl-10">
      <p className="min-w-0 rounded-2xl rounded-tr-sm bg-brand/10 px-3 py-2 text-sm text-ink">{children}</p>
      <button type="button" onClick={onEdit} className="mt-1 inline-flex min-h-[32px] shrink-0 items-center gap-1 text-xs font-semibold text-accent hover:underline">
        <Pencil className="h-3 w-3" aria-hidden /> Corrigir
      </button>
    </div>
  );
}
function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-1">{children}</div>;
}
function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{value}</dd>
      <button type="button" onClick={onEdit} className="shrink-0 text-xs font-semibold text-accent hover:underline" aria-label={`Corrigir ${label}`}>
        Corrigir
      </button>
    </div>
  );
}

function TextStep({ q, help, placeholder, nextLabel, value, onChange, examples, onNext, onSkip, required }: { q: string; help: string; placeholder: string; nextLabel: string; value: string; onChange: (v: string) => void; examples?: string[]; onNext: () => void; onSkip?: () => void; required?: boolean }) {
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
        <div className="flex flex-wrap gap-2" aria-label="Sugestões de nome">
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
            Pular por agora
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
        label="Como informar"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setPreview(null);
        }}
        options={[
          { value: 'um', label: 'Uma por vez' },
          { value: 'texto', label: 'Escrever em texto' },
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
          <p className="text-sm font-medium">Entendemos assim — confira antes de adicionar:</p>
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
              <ListPlus className="h-4 w-4" aria-hidden /> Adicionar {preview.length} item(ns)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              Ajustar o texto
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea aria-label={`${q} (texto livre)`} value={text} onChange={(e) => setText(e.target.value)} placeholder={textPlaceholder} rows={5} />
          <p className="text-xs text-muted">Um item por linha, ou separados por “;”, “→” ou “depois”. Você confirma a interpretação antes de adicionar.</p>
          <Button size="sm" variant="secondary" disabled={!text.trim()} onClick={() => setPreview(parseList(text).map(toItem))}>
            Organizar em lista
          </Button>
        </div>
      )}
      {items.length > 0 && (
        <ol className="space-y-1.5" aria-label="Itens adicionados">
          {items.map((it, i) => (
            <li key={it.key} className="flex items-center gap-2 rounded-lg border border-line/15 bg-surface2/40 py-1 pl-3 pr-1">
              <span className="w-5 text-xs font-semibold text-muted">{i + 1}.</span>
              <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
                <input aria-label={`Item ${i + 1}`} value={it.label} onChange={(e) => onChange(items.map((x) => (x.key === it.key ? { ...x, label: e.target.value } : x)))} className="min-h-[36px] min-w-0 flex-1 bg-transparent text-sm text-ink outline-none focus-visible:outline-none" />
                {it.meta && <span className="-mt-1 pb-1 text-xs text-muted sm:mt-0 sm:shrink-0 sm:pb-0">{it.meta}</span>}
              </span>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-ink disabled:opacity-30" aria-label={`Mover ${it.label} para cima`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-ink disabled:opacity-30" aria-label={`Mover ${it.label} para baixo`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-bad" aria-label={`Remover ${it.label}`} onClick={() => onChange(items.filter((x) => x.key !== it.key))}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <Actions>
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            {skipLabel ?? 'Pular por agora'}
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
  const acts = allActivities(d);
  const i = Math.min(d.detailIndex, Math.max(0, acts.length - 1));
  const a = acts[i];
  if (!a)
    return (
      <div className="space-y-3">
        <Bubble>Ainda não há atividades para detalhar. Tudo bem, seguimos.</Bubble>
        <Actions>
          <Button data-primary onClick={onNext}>{nextLabel}</Button>
        </Actions>
      </div>
    );
  const known = a.reviewed;
  return (
    <div className="space-y-4">
      <Bubble>
        Vamos detalhar “{a.name}” <span className="font-normal text-muted">({a.stage})</span>
      </Bubble>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        Atividade {i + 1} de {acts.length} · tudo é opcional — “Não sei” também é resposta.
        {known && <Badge tone="ok">Tempo e responsável já informados no texto</Badge>}
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Quanto tempo de trabalho leva uma vez? (sem contar espera)</legend>
        <div className="flex flex-wrap items-center gap-2">
          <NumberInput aria-label="Tempo de trabalho" className="w-28" value={a.durationUnknown ? undefined : a.duration} onChange={(v) => setAct(a.key, { duration: v, durationUnknown: false })} placeholder="Ex.: 15" />
          <Segmented<DurationUnit> label="Unidade do tempo" value={a.unit} onChange={(u) => setAct(a.key, { unit: u })} options={[{ value: 'min', label: 'min' }, { value: 'h', label: 'horas' }, { value: 'd', label: 'dias' }]} />
          <button type="button" aria-pressed={!!a.durationUnknown} onClick={() => setAct(a.key, { durationUnknown: !a.durationUnknown, duration: undefined })} className={clsx('min-h-[40px] rounded-full border px-3 text-sm', a.durationUnknown ? 'border-brand bg-brand text-brandInk' : 'border-line/25 text-ink2')}>
            Ainda não medido
          </button>
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Quem faz isso na prática? Pode ser uma função ou uma área.</legend>
        {owners.length > 0 && <Chips label="Responsáveis já citados" value={a.owner} options={owners.map((o) => ({ value: o, label: o }))} onChange={(v) => setAct(a.key, { owner: v })} />}
        <Input aria-label="Quem faz" value={a.owner ?? ''} onChange={(e) => setAct(a.key, { owner: e.target.value || undefined })} placeholder="Ex.: Comprador" />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Quantas pessoas trabalham nela ao mesmo tempo?</legend>
        <Chips label="Pessoas" value={a.people !== undefined ? String(Math.min(a.people, 4)) as '1' : undefined} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4 ou mais' }]} onChange={(v) => setAct(a.key, { people: Number(v) })} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">O trabalho fica esperando antes desta atividade? (fila, aprovação, cliente)</legend>
        <Chips label="Espera" value={a.waitState} options={[{ value: 'nao_ha', label: 'Não há espera' }, { value: 'informada', label: 'Sim, informar' }, { value: 'nao_sei', label: 'Não sei' }]} onChange={(v) => setAct(a.key, { waitState: v })} />
        {a.waitState === 'informada' && (
          <div className="flex items-center gap-2 text-sm">
            <NumberInput aria-label="Tempo de espera" className="w-28" value={a.wait} onChange={(v) => setAct(a.key, { wait: v })} />
            <span className="text-ink2">{UNIT_TXT[a.unit]} (mesma unidade do tempo de trabalho)</span>
          </div>
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Esta atividade existe para refazer ou corrigir algo?</legend>
        <Chips label="Retrabalho" value={a.rework} options={[{ value: 'nao', label: 'Não' }, { value: 'sim', label: 'Sim, é retrabalho' }, { value: 'nao_sei', label: 'Não sei' }]} onChange={(v) => setAct(a.key, { rework: v })} />
        {a.rework === 'sim' && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink2">Acontece em</span>
            <NumberInput aria-label="Frequência do retrabalho (%)" className="w-24" value={a.reworkPct} onChange={(v) => setAct(a.key, { reworkPct: v !== undefined ? Math.min(100, v) : undefined })} />
            <span className="text-ink2">de cada 100 execuções (vazio = não sei)</span>
          </div>
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">O cliente pagaria por esta atividade? (opcional)</legend>
        <Chips<LeanClass | 'nao_sei'>
          label="Classificação Lean"
          value={a.lean}
          options={[
            { value: 'VA', label: 'Sim, agrega valor' },
            { value: 'NNVA', label: 'Não, mas é exigida' },
            { value: 'W', label: 'Não e poderia não existir' },
            { value: 'nao_sei', label: 'Não sei' },
          ]}
          onChange={(v) => setAct(a.key, { lean: v })}
        />
        <p className="text-xs text-muted">“Exigida” inclui controles, leis, segurança e restrições operacionais — não é desperdício.</p>
      </fieldset>
      <Actions>
        {i > 0 && (
          <Button variant="ghost" onClick={() => set({ detailIndex: i - 1 })}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
          </Button>
        )}
        <Button variant="secondary" onClick={onNext}>
          Pular detalhes restantes
        </Button>
        {i < acts.length - 1 ? (
          <Button
            data-primary
            onClick={() => {
              setAct(a.key, { reviewed: true });
              set({ detailIndex: i + 1 });
            }}
          >
            Próxima atividade <ChevronRight className="h-4 w-4" aria-hidden />
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
  // Só atividades que entram no projeto podem ser escolhidas (as de etapas puladas, não).
  const acts = analysis.flat.map(({ s, a }) => ({ key: a.key, name: a.name.trim(), stage: s.name.trim() }));
  const valid = new Set(acts.map((a) => a.key));
  const setDec = (key: string, patch: Partial<AssistantDraft['decisions'][number]>) => set({ decisions: d.decisions.map((x) => (x.key === key ? { ...x, ...patch } : x)) });
  const add = () => set({ decisions: [...d.decisions, { key: uid('dc'), question: '', afterKey: acts[0]?.key ?? '', noTarget: '__end' }] });
  const problems = new Map(analysis.invalidDecisions.map((x) => [x.decision.key, x.problem]));
  const blocked = problems.size > 0;
  return (
    <div className="space-y-4">
      <Bubble>Em algum momento o caminho depende de uma resposta sim ou não?</Bubble>
      <p className="text-sm text-ink2">Ex.: “Orçamento aprovado?”. Com “sim”, o fluxo segue; com “não”, volta para uma atividade (retrabalho) ou encerra. Pode haver mais de uma decisão depois da mesma atividade: elas ficam em sequência.</p>
      {d.decisions.map((x, n) => {
        const problem = problems.get(x.key);
        const afterOk = valid.has(x.afterKey);
        const noOk = x.noTarget === '__end' || valid.has(x.noTarget);
        return (
          <div key={x.key} className={clsx('space-y-3 rounded-lg border p-3', problem ? 'border-bad/50 bg-bad/5' : 'border-violet/30 bg-violet/5')} data-testid="assistant-decision">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Decisão {n + 1}</p>
              <Button size="sm" variant="ghost" aria-label={`Remover decisão ${n + 1}`} onClick={() => set({ decisions: d.decisions.filter((y) => y.key !== x.key) })}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            {problem && (
              <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-bad">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {problem === 'sem_pergunta' ? 'Escreva a pergunta desta decisão (ou remova a decisão).' : `${PROBLEM_TXT[problem].charAt(0).toUpperCase()}${PROBLEM_TXT[problem].slice(1)} Escolha outra atividade ou remova a decisão.`}
              </p>
            )}
            <Field label="Pergunta">{(f) => <Input {...f} value={x.question} onChange={(e) => setDec(x.key, { question: e.target.value })} placeholder="Ex.: Orçamento aprovado?" />}</Field>
            <Field label="Acontece depois de qual atividade?">
              {(f) => (
                <Select {...f} value={afterOk ? x.afterKey : ''} onChange={(e) => setDec(x.key, { afterKey: e.target.value })} aria-invalid={!afterOk || undefined}>
                  {!afterOk && (
                    <option value="" disabled>
                      Escolha a atividade…
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
            <Field label="Se a resposta for NÃO, vai para…">
              {(f) => (
                <Select {...f} value={noOk ? x.noTarget : ''} onChange={(e) => setDec(x.key, { noTarget: e.target.value })} aria-invalid={!noOk || undefined}>
                  {!noOk && (
                    <option value="" disabled>
                      Escolha para onde vai…
                    </option>
                  )}
                  <option value="__end">Encerrar o processo</option>
                  {acts.map((a) => (
                    <option key={a.key} value={a.key}>
                      Voltar/ir para: {a.stage} › {a.name}
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
          Para continuar, corrija ou remova as decisões destacadas.
        </p>
      )}
      <Actions>
        <Button variant="secondary" onClick={add} disabled={!acts.length}>
          <Plus className="h-4 w-4" aria-hidden /> {d.decisions.length ? 'Outra decisão' : 'Sim, adicionar decisão'}
        </Button>
        <Button data-primary onClick={onNext} disabled={blocked}>
          {d.decisions.length ? nextLabel : `Não há decisões — ${nextLabel.charAt(0).toLowerCase()}${nextLabel.slice(1)}`} <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </Actions>
    </div>
  );
}

/** "Aha!": o que acabou de ser mapeado, com números reais do processo criado. */
function Success({ w, durable, cleanupFailed, reused, warnings, onOpen }: { w: Workspace; durable: boolean; cleanupFailed: boolean; reused: boolean; warnings: number; onOpen: (path: string) => void }) {
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
    plural(tasks.length, 'atividade em ordem', 'atividades em ordem'),
    owners ? plural(owners, 'responsável identificado', 'responsáveis identificados') : null,
    decisions ? plural(decisions, 'ponto de decisão', 'pontos de decisão') : null,
    recs ? plural(recs, 'oportunidade de melhoria para avaliar', 'oportunidades de melhoria para avaliar') : null,
  ].filter(Boolean) as string[];
  const download = async () => {
    try {
      await shareProject(w);
    } catch {
      toast('bad', 'Não foi possível gerar o arquivo do projeto. Tente de novo.');
    }
  };
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-6 sm:pt-12" data-testid="assistant-success">
      <div className={clsx('np-fade-in rounded-2xl border bg-surface p-6 text-center shadow-card sm:p-8', durable ? 'border-ok/30' : 'border-amber/50')}>
        <span className={clsx('mx-auto flex h-14 w-14 items-center justify-center rounded-full', durable ? 'bg-ok/15 text-ok' : 'bg-amber/15 text-amber')} aria-hidden>
          {durable ? <Sparkles className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
        </span>
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-extrabold tracking-tight outline-none">
          {durable ? 'Excelente! ' : ''}Seu processo foi mapeado com {plural(p.stageOrder.length, 'etapa', 'etapas')}.
        </h1>
        {durable ? (
          <p className="mt-2 text-ink2" data-testid="success-storage">
            “{p.name}” foi criado e está salvo neste aparelho, com o mapa do processo pronto para ver.
          </p>
        ) : (
          <div className="mt-3 text-left" data-testid="success-storage">
            <Callout tone="warn" title="Ainda não está salvo neste aparelho" action={<Button size="sm" onClick={() => void download()}><Download className="h-4 w-4" aria-hidden /> Baixar arquivo do projeto</Button>}>
              O navegador bloqueou o armazenamento local: “{p.name}” existe só nesta aba e some ao fechá-la. Baixe o arquivo do projeto e importe-o depois em “Meus projetos → Importar projeto”.
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
                ? 'Diagnóstico ainda não calculado: falta a duração das atividades. Informe o tempo de cada atividade em “Dados”.'
                : timed < tasks.length
                  ? `Diagnóstico calculado com ${timed} de ${tasks.length} atividades com duração; complete as demais para um resultado completo.`
                  : 'Diagnóstico calculado com a duração de todas as atividades.'}
            </span>
          </li>
          {warnings > 0 && (
            <li className="flex items-start gap-2 text-ink2">
              <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden /> {plural(warnings, 'ponto para completar quando puder', 'pontos para completar quando puder')}
            </li>
          )}
        </ul>
        {reused && (
          <p className="mt-4 text-xs text-muted" data-testid="success-reused">
            Este rascunho já tinha virado este projeto; nada foi criado de novo.
          </p>
        )}
        {cleanupFailed && (
          <p className="mt-4 text-xs text-muted" data-testid="success-cleanup">
            O projeto foi criado. Não conseguimos apagar o rascunho antigo deste aparelho; ele não será reaberto nem criará outro projeto.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {diagReady ? (
            <Button size="lg" onClick={() => onOpen('plano')}>
              Ver meu Plano de Ação <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button size="lg" onClick={() => onOpen('dados')}>
              Informar as durações <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
          <Button size="lg" variant="secondary" onClick={() => onOpen(warnings ? 'validar' : 'mapa')}>
            <MapIcon className="h-4 w-4" aria-hidden /> {warnings ? 'Revisar os dados' : 'Ver o mapa'}
          </Button>
        </div>
      </div>
    </div>
  );
}
