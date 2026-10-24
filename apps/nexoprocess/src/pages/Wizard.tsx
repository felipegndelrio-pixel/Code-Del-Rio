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

const STEPS = ['Processo', 'Etapas', 'Atividades', 'Volume e custos', 'Revisão'];
/** Título de cada passo, em tom de conversa; STEPS fica para o progresso ("Etapa 2 de 5: Etapas"). */
const TITLES = ['Vamos começar pelo processo', 'Quais são as grandes etapas?', 'O que acontece em cada etapa?', 'Volume e custos (opcional)', 'Revisão final'];
/** Destino do botão de avançar: "Avançar para as etapas". */
const TARGET = ['o processo', 'as etapas', 'as atividades', 'volume e custos', 'a revisão'];
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
  const p = newProcess(s.name.trim() || 'Novo processo');
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
  acts.push(newActivity({ id: 'INICIO', stage: first.st.name.trim(), name: 'Início', type: 'start', order: ++order, next: [idOf.get(first.i.key)!] }));
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
  acts.push(newActivity({ id: 'FIM', stage: last.st.name.trim(), name: 'Fim', type: 'end', order: ++order }));
  if (needsNoEnd) acts.push(newActivity({ id: 'FIM_NAO', stage: last.st.name.trim(), name: 'Encerrado (resposta não)', type: 'end', order: ++order }));
  // Atividades que recebem o "não" de uma decisão anterior a elas mesmas = retrabalho? Não presumimos: o usuário marca depois.
  p.activities = acts;
  p.stageOrder = stages.map((st) => st.name.trim());
  return normalizeStages(p);
}

export default function Wizard() {
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
    ? 'Esta aba não cria o processo: ele já foi criado em outra aba. Copie seus dados acima.'
    : analysis.invalidDecisions.length
    ? 'Corrija o caminho do “não” nas decisões destacadas para criar o processo.'
    : issues.some((i) => i.severity === 'error')
      ? 'Corrija os pontos em vermelho acima para criar o processo.'
      : needsAck
        ? 'Confirme acima que deseja criar o processo sem os itens que não serão salvos.'
        : null;

  const check = (step: number): boolean => {
    const e: Record<string, string> = {};
    if (step === 0 && !s.name.trim()) e.name = 'Faltou só o nome. Como a equipe chama esse processo? (ex.: Análise de crédito)';
    if (step === 1) {
      const named = s.stages.filter((st) => st.name.trim());
      if (!named.length) e.stages = 'Faltou pelo menos uma etapa. Pode ser só uma, para começar.';
      const names = named.map((st) => st.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) e.stages = 'Duas etapas estão com o mesmo nome. Que tal diferenciar?';
    }
    if (step === 2) {
      const any = s.stages.some((st) => st.name.trim() && st.items.some((i) => i.name.trim()));
      if (!any) e.items = 'Faltou só uma coisinha: descreva pelo menos uma atividade.';
      const namedKeys = new Set(s.stages.flatMap((st) => st.items.filter((i) => i.name.trim()).map((i) => i.key)));
      for (const st of s.stages)
        for (const i of st.items) {
          if (i.isDecision && i.name.trim() && !i.noTarget) e[`no_${i.key}`] = 'Para onde o fluxo vai quando a resposta é “não”?';
          else if (i.isDecision && i.name.trim() && i.noTarget !== '__end' && !namedKeys.has(i.noTarget!)) e[`no_${i.key}`] = 'A atividade escolhida para o “não” foi removida. Escolha outra ou “Encerrar o processo”.';
        }
    }
    setErrors(e);
    return !Object.keys(e).length;
  };
  const go = (d: number) => {
    if (d > 0 && !check(s.step)) return;
    set({ step: Math.max(0, Math.min(STEPS.length - 1, s.step + d)) });
    window.scrollTo({ top: 0 });
  };

  useHardwareBack('formulario', s.step > 0, () => go(-1), String(s.step));

  const finish = async () => {
    if (!check(0) || !check(1) || !check(2)) return;
    if (blockReason) {
      toast('bad', `Quase lá: ${blockReason.charAt(0).toLowerCase()}${blockReason.slice(1)}`);
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
      toast('bad', 'Não conseguimos salvar neste navegador. Confira se o armazenamento do site está liberado e tente de novo.');
      return;
    }
    setBusy(false);
    // Criado. A limpeza do rascunho é separada: se falhar, não é erro de criação.
    if (r.reused) toast('info', 'Este rascunho já tinha virado este processo; nada foi criado de novo.');
    if (!r.durable) toast('bad', 'Processo criado só nesta aba: o navegador bloqueou o armazenamento local. Gere o arquivo do projeto na Visão geral antes de fechar.');
    else toast('ok', 'Pronto! Seu processo foi criado e salvo neste aparelho. Vamos conferir os dados?');
    if (r.cleanup === 'falhou') toast('info', 'Não conseguimos apagar o rascunho antigo deste aparelho; ele não será reaberto nem criará outro processo.');
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
    if (!(await confirm({ title: 'Começar do zero?', body: 'As respostas até aqui serão apagadas deste aparelho.', confirm: 'Apagar e recomeçar', danger: true }))) return;
    await db.deleteDraft(DRAFT);
    localDraft.remove(DRAFT);
    setS(initial());
    setRestored(false);
  };

  const allItems = s.stages.flatMap((st) => st.items.filter((i) => i.name.trim()).map((i) => ({ ...i, stage: st.name })));
  const pct = Math.round(((s.step + 1) / STEPS.length) * 100);

  return (
    <div className="safe-x mx-auto max-w-3xl space-y-5 py-6">
      <div>
        <p className="text-sm font-semibold text-brand">Formulário completo</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
          {TITLES[s.step]}
        </h1>
        <div className="mt-3" aria-label={`Etapa ${s.step + 1} de ${STEPS.length}: ${STEPS[s.step]}`}>
          <div className="flex justify-between text-xs text-muted">
            <span className="font-medium text-ink2">
              Etapa {s.step + 1} de {STEPS.length}: {STEPS[s.step]}
            </span>
            <span data-testid="draft-storage">{stale ? 'Esta aba não está salvando' : storage === 'memoria' ? 'Rascunho só nesta aba' : 'Salvo neste aparelho'}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label="Progresso do assistente" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {storage === 'memoria' && (
        <Callout tone="warn" title="Este navegador bloqueou o armazenamento local">
          Você pode preencher o formulário, mas o processo ficará só nesta aba e some ao fechá-la. Depois de criar, gere o arquivo do projeto na Visão geral.
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
          title={already.exists ? 'Seu último rascunho já virou um processo.' : 'Seu último rascunho já tinha virado um processo, que foi excluído depois.'}
          action={already.exists ? <Button size="sm" variant="ghost" onClick={() => nav(`/app/p/${already.workspaceId}/visao-geral`)}>Abrir o processo</Button> : undefined}
        >
          Não vamos criá-lo de novo. Este é um rascunho novo.
        </Callout>
      )}
      {restored && !stale && (
        <Callout tone="info" title="Continuamos de onde você parou." action={<Button size="sm" variant="ghost" onClick={() => void discard()}>Começar do zero</Button>}>
          Suas respostas ficaram salvas neste aparelho.
        </Callout>
      )}

      {s.step === 0 && (
        <Card>
          <div className="space-y-4">
            <Field label="Como você chama esse processo?" required help="Use o nome que a equipe usa no dia a dia. Dá para mudar depois." error={errors.name}>
              {(p) => <Input {...p} value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Análise de crédito" autoFocus />}
            </Field>
            <Field label="Em uma frase, para que ele serve?" help="Opcional. Ex.: do pedido do cliente até a entrega.">
              {(p) => <Textarea {...p} value={s.description} onChange={(e) => set({ description: e.target.value })} />}
            </Field>
            <Field label="Área responsável" help="Opcional.">
              {(p) => <Input {...p} value={s.area} onChange={(e) => set({ area: e.target.value })} placeholder="Ex.: Operações" />}
            </Field>
          </div>
        </Card>
      )}

      {s.step === 1 && (
        <Card title="Na ordem em que acontecem" subtitle="Visão macro">
          <p className="mb-3 text-sm text-ink2">Pense em 3 a 7 blocos, na ordem em que acontecem. Ex.: Recebimento → Análise → Execução → Entrega.</p>
          {errors.stages && <p className="mb-2 text-sm font-medium text-bad" role="alert">{errors.stages}</p>}
          <ol className="space-y-2">
            {s.stages.map((st, i) => (
              <li key={st.key} className="flex items-center gap-2">
                <span className="w-6 text-right text-sm font-bold text-muted">{i + 1}.</span>
                <Input aria-label={`Nome da etapa ${i + 1}`} value={st.name} onChange={(e) => setStage(st.key, { name: e.target.value })} placeholder={['Ex.: Recebimento', 'Ex.: Análise', 'Ex.: Execução', 'Ex.: Entrega'][i] ?? 'Nome da etapa'} />
                <Button size="sm" variant="ghost" aria-label="Mover para cima" disabled={i === 0} onClick={() => set({ stages: move(s.stages, i, -1) })}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Mover para baixo" disabled={i === s.stages.length - 1} onClick={() => set({ stages: move(s.stages, i, 1) })}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Remover etapa ${i + 1}`} disabled={s.stages.length === 1} onClick={() => set({ stages: s.stages.filter((x) => x.key !== st.key) })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => set({ stages: [...s.stages, { key: uid('s'), name: '', items: [blankItem()] }] })}>
            <Plus className="h-4 w-4" /> Adicionar etapa
          </Button>
        </Card>
      )}

      {s.step === 2 && (
        <div className="space-y-4">
          <Callout tone="info">
            Para cada etapa, liste o que acontece, na ordem. Só o nome é obrigatório; tempo e pessoas liberam mais análises. Quando o caminho muda conforme uma resposta (ex.: “Documentos completos?”), marque “É uma pergunta/decisão?”.
          </Callout>
          {errors.items && <p className="text-sm font-medium text-bad" role="alert">{errors.items}</p>}
          {s.stages
            .filter((st) => st.name.trim())
            .map((st, si) => (
              <Card key={st.key} title={st.name} subtitle={`Etapa ${si + 1}`}>
                <ol className="space-y-3">
                  {st.items.map((it, ii) => (
                    <li key={it.key} className={clsx('rounded-xl border p-3', it.isDecision ? 'border-violet/40 bg-violet/5' : 'border-line/15 bg-surface2/40')}>
                      <div className="flex items-start gap-2">
                        <span className="mt-3 w-5 text-right text-xs font-bold text-muted">{ii + 1}.</span>
                        <div className="grid flex-1 gap-3 sm:grid-cols-2">
                          <Field label={it.isDecision ? 'Pergunta da decisão' : 'O que acontece?'} className="sm:col-span-2">
                            {(p) => <Input {...p} value={it.name} onChange={(e) => setItem(st.key, it.key, { name: e.target.value })} placeholder={it.isDecision ? 'Ex.: Documentos completos?' : 'Ex.: Conferir documentos do cliente'} />}
                          </Field>
                          {!it.isDecision && (
                            <>
                              <div className="flex gap-2">
                                <Field label="Tempo de trabalho" help="Uma execução, sem espera." className="flex-1">
                                  {(p) => <NumberInput {...p} value={it.duration} onChange={(v) => setItem(st.key, it.key, { duration: v })} placeholder="Ex.: 15" />}
                                </Field>
                                <Field label="Unidade" className="w-28">
                                  {(p) => (
                                    <Select {...p} value={it.unit} onChange={(e) => setItem(st.key, it.key, { unit: e.target.value as DurationUnit })}>
                                      <option value="min">minutos</option>
                                      <option value="h">horas</option>
                                      <option value="d">dias</option>
                                    </Select>
                                  )}
                                </Field>
                              </div>
                              <Field label="Quem faz?" help="Função ou área (opcional).">
                                {(p) => <Input {...p} value={it.owner ?? ''} onChange={(e) => setItem(st.key, it.key, { owner: e.target.value })} placeholder="Ex.: Atendente" list="wiz-owners" />}
                              </Field>
                              <Field label="Quantas pessoas ao mesmo tempo?" help="Opcional. Habilita o esforço em pessoa-hora.">
                                {(p) => <NumberInput {...p} value={it.people} onChange={(v) => setItem(st.key, it.key, { people: v })} placeholder="Ex.: 1" />}
                              </Field>
                              <Field label={<>Isso agrega valor? <Term k="lean" iconOnly /></>} help="Opcional — pode classificar depois.">
                                {(p) => (
                                  <Select {...p} value={it.lean ?? ''} onChange={(e) => setItem(st.key, it.key, { lean: e.target.value as LeanClass | '' })}>
                                    <option value="">Não sei ainda</option>
                                    <option value="VA">Agrega valor (o cliente pagaria por isso)</option>
                                    <option value="NNVA">Necessário, mas não agrega valor</option>
                                    <option value="W">Desperdício (poderia não existir)</option>
                                  </Select>
                                )}
                              </Field>
                            </>
                          )}
                          {it.isDecision && (
                            <>
                              <p className="text-sm text-ink2 sm:col-span-2">
                                <Badge tone="ok">Sim</Badge> segue para a próxima atividade da lista.
                              </p>
                              <Field label="Se a resposta for NÃO, vai para…" className="sm:col-span-2" error={errors[`no_${it.key}`]}>
                                {(p) => (
                                  <Select {...p} value={it.noTarget ?? ''} onChange={(e) => setItem(st.key, it.key, { noTarget: e.target.value })}>
                                    <option value="">Escolha…</option>
                                    <option value="__end">Encerrar o processo</option>
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
                            <GitBranch className="h-4 w-4 text-violet" aria-hidden /> É uma pergunta/decisão?
                          </label>
                        </div>
                        <div className="flex flex-col">
                          <Button size="sm" variant="ghost" aria-label="Mover para cima" disabled={ii === 0} onClick={() => setStage(st.key, { items: move(st.items, ii, -1) })}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label="Mover para baixo" disabled={ii === st.items.length - 1} onClick={() => setStage(st.key, { items: move(st.items, ii, 1) })}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label="Remover atividade" disabled={st.items.length === 1} onClick={() => setStage(st.key, { items: st.items.filter((x) => x.key !== it.key) })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                <Button className="mt-3" size="sm" variant="secondary" onClick={() => setStage(st.key, { items: [...st.items, blankItem()] })}>
                  <Plus className="h-4 w-4" /> Adicionar atividade em {st.name}
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
        <Card title="Volume e custos" subtitle="Opcional">
          <p className="mb-4 text-sm text-ink2">Sem estes números você já vê o mapa, os tempos e os desperdícios. Com eles, calculamos o esforço por mês e o custo estimado. Não sabe agora? Pode pular e preencher depois.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantas vezes o processo acontece?" help="Ex.: 1.200 pedidos.">
              {(p) => <NumberInput {...p} value={s.volume} onChange={(v) => set({ volume: v })} placeholder="Ex.: 1200" />}
            </Field>
            <Field label="Por…">
              {(p) => (
                <Select {...p} value={s.period} onChange={(e) => set({ period: e.target.value as Period })}>
                  <option value="dia">dia</option>
                  <option value="semana">semana</option>
                  <option value="mes">mês</option>
                  <option value="ano">ano</option>
                </Select>
              )}
            </Field>
            <Field label="Custo-hora carregado (R$)" help="Salário + encargos + benefícios ÷ horas trabalhadas. Pode ajustar por função depois." className="sm:col-span-2">
              {(p) => <NumberInput {...p} value={s.costPerHour} onChange={(v) => set({ costPerHour: v })} placeholder="Ex.: 55" />}
            </Field>
          </div>
        </Card>
      )}

      {s.step === 4 && (
        <Card title="Confira antes de criarmos" subtitle={s.name}>
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
              <Callout tone="bad" title="Decisões com o caminho do “não” perdido" action={<Button size="sm" variant="secondary" onClick={() => set({ step: 2 })}>Corrigir nas atividades</Button>}>
                <ul className="list-disc pl-4" data-testid="wizard-invalid-decisions">
                  {analysis.invalidDecisions.map((x) => (
                    <li key={x.key}>
                      “{x.name}” ({x.stage}): a atividade escolhida para o “não” foi removida ou não entra no processo.
                    </li>
                  ))}
                </ul>
              </Callout>
            )}
            {analysis.dropped.length > 0 && (
              <Callout tone="warn" title="Não serão salvos no processo">
                <ul className="space-y-2" data-testid="wizard-dropped-items">
                  {analysis.dropped.map((x) => (
                    <li key={x.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {x.reason === 'sem_nome' ? `Etapa sem nome com ${x.activities.length === 1 ? '1 atividade' : `${x.activities.length} atividades`}: ${x.activities.join('; ')}` : `Etapa “${x.name}” — sem atividades`}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => set({ step: x.reason === 'sem_nome' ? 1 : 2 })}>
                        {x.reason === 'sem_nome' ? 'Dar nome à etapa' : 'Adicionar atividades'}
                      </Button>
                    </li>
                  ))}
                </ul>
                <label className="mt-3 flex min-h-[44px] items-center gap-2 font-medium text-ink">
                  <input type="checkbox" className="h-5 w-5" checked={!needsAck} onChange={(e) => setAckDropped(e.target.checked ? droppedSig : '')} />
                  Entendi: criar o processo sem esses itens
                </label>
              </Callout>
            )}
            {issues.filter((i) => i.severity !== 'info').length === 0 && !analysis.dropped.length && !analysis.invalidDecisions.length ? (
              <Callout tone="ok">Tudo certo por aqui. Vamos criar o processo?</Callout>
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
            'Sair'
          ) : (
            <>
              <span className="sm:hidden">Voltar</span>
              <span className="hidden sm:inline">Voltar para {TARGET[s.step - 1]}</span>
            </>
          )}
        </Button>
        {s.step < STEPS.length - 1 ? (
          <div className="flex w-full gap-2 sm:w-auto">
            {s.step === 3 && (
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => go(1)}>
                Pular por agora
              </Button>
            )}
            <Button className="flex-1 sm:flex-none" onClick={() => go(1)}>
              Avançar para {TARGET[s.step + 1]} <ArrowRight className="h-4 w-4" aria-hidden />
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
              Criar processo e ver o mapa
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Texto simples do formulário, para a pessoa copiar quando esta aba fica desatualizada. */
function wizardText(s: WState): string {
  const lines = [`Processo: ${s.name || '(sem nome)'}`];
  if (s.description) lines.push(`Para que serve: ${s.description}`);
  if (s.area) lines.push(`Área: ${s.area}`);
  for (const st of s.stages) {
    if (!st.name && !st.items.some((i) => i.name)) continue;
    lines.push('', `Etapa: ${st.name || '(sem nome)'}`);
    for (const i of st.items.filter((x) => x.name)) lines.push(`- ${i.isDecision ? 'Decisão: ' : ''}${i.name}${i.owner ? ` · ${i.owner}` : ''}${i.duration !== undefined && !i.isDecision ? ` · ${i.duration} ${i.unit}` : ''}`);
  }
  if (s.volume !== undefined) lines.push('', `Volume: ${s.volume} por ${s.period}`);
  if (s.costPerHour !== undefined) lines.push(`Custo-hora: R$ ${s.costPerHour}`);
  return lines.join('\n');
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
