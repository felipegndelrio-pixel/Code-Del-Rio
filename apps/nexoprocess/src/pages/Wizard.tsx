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
import { db } from '../storage/db';
import { createWorkspace } from '../state/actions';
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

export function wizardToProcess(s: WState): ProcessModel {
  const p = newProcess(s.name.trim() || 'Novo processo');
  p.description = s.description.trim() || undefined;
  p.area = s.area.trim() || undefined;
  p.volume = s.volume;
  p.volumePeriod = s.period;
  p.defaultCostPerHour = s.costPerHour;
  const stages = s.stages.filter((st) => st.name.trim() && st.items.some((i) => i.name.trim()));
  const flat = stages.flatMap((st) => st.items.filter((i) => i.name.trim()).map((i) => ({ st, i })));
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
  const [local] = useState(() => {
    const d = localDraft.read<WState>(DRAFT);
    return d && Array.isArray(d.stages) && (d.name || d.stages.some((st) => st.name)) ? d : undefined;
  });
  const [s, setS] = useState<WState>(() => local ?? initial());
  const [loaded, setLoaded] = useState(!!local);
  const [restored, setRestored] = useState(!!local);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (local) return;
    db.getDraft<WState>(DRAFT)
      .then((d) => {
        if (d && (d.name || d.stages.some((st) => st.name))) {
          setS(d);
          setRestored(true);
        }
      })
      .finally(() => setLoaded(true));
  }, [local]);
  useEffect(() => {
    if (!loaded) return;
    if (s.name || s.stages.some((st) => st.name)) localDraft.write(DRAFT, s);
    const t = setTimeout(() => void db.putDraft(DRAFT, s).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [s, loaded]);
  useEffect(() => headingRef.current?.focus(), [s.step]);

  const set = (patch: Partial<WState>) => setS((x) => ({ ...x, ...patch }));
  const setStage = (k: string, patch: Partial<WStage>) => setS((x) => ({ ...x, stages: x.stages.map((st) => (st.key === k ? { ...st, ...patch } : st)) }));
  const setItem = (sk: string, ik: string, patch: Partial<WItem>) =>
    setS((x) => ({ ...x, stages: x.stages.map((st) => (st.key === sk ? { ...st, items: st.items.map((i) => (i.key === ik ? { ...i, ...patch } : i)) } : st)) }));

  const process = useMemo(() => wizardToProcess(s), [s]);
  const issues = useMemo(() => (s.step === 4 ? validateProcess(process) : []), [s.step, process]);

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
      for (const st of s.stages) for (const i of st.items) if (i.isDecision && i.name.trim() && !i.noTarget) e[`no_${i.key}`] = 'Para onde o fluxo vai quando a resposta é “não”?';
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
    if (issues.some((i) => i.severity === 'error')) {
      toast('bad', 'Quase lá: falta ajustar os pontos destacados antes de criar o processo.');
      return;
    }
    if (demoBlocked('salvar')) return;
    setBusy(true);
    try {
      const w = await createWorkspace(process, { kind: 'wizard' });
      await db.deleteDraft(DRAFT);
      localDraft.remove(DRAFT);
      toast('ok', 'Pronto! Seu processo foi criado. Vamos conferir os dados?');
      nav(`/app/p/${w.id}/validar`);
    } catch {
      toast('bad', 'Não conseguimos salvar neste navegador. Confira se o armazenamento do site está liberado e tente de novo.');
    } finally {
      setBusy(false);
    }
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
            <span>Salvo neste aparelho</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label="Progresso do assistente" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {restored && (
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
            {issues.filter((i) => i.severity !== 'info').length === 0 ? (
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
          <Button className="w-full sm:w-auto" onClick={() => void finish()} loading={busy}>
            Criar processo e ver o mapa
          </Button>
        )}
      </div>
    </div>
  );
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
