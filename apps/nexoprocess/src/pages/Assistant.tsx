// Assistente conversacional estruturado (V4): perguntas curtas + controles
// adequados ao toque. Funciona igual no desktop; é o fluxo principal no celular.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Bot, Check, ChevronLeft, ChevronRight, ListPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Badge, Button, Callout, Field, Input, NumberInput, Segmented, Select, Textarea, useConfirm, useToast } from '../components/ui';
import { allActivities, draftActivityFrom, draftToProcess, emptyDraft, parseList, type AssistantDraft, type DraftActivity, type DraftStage } from '../domain/assistant';
import type { DurationUnit, LeanClass, Period } from '../domain/types';
import { fmtNum, uid } from '../domain/units';
import { validateProcess } from '../domain/validation';
import { db } from '../storage/db';
import { createWorkspace } from '../state/actions';

const DRAFT = 'assistant';
const SECTIONS = ['Processo', 'Etapas', 'Atividades', 'Detalhes', 'Decisões', 'Volume e custo', 'Revisão'];
const UNIT_TXT: Record<DurationUnit, string> = { min: 'min', h: 'h', d: 'dias' };
const PERIOD_TXT: Record<Period, string> = { dia: 'dia', semana: 'semana', mes: 'mês', ano: 'ano' };

function stepOrder(d: AssistantDraft): string[] {
  return ['name', 'trigger', 'outcome', 'stages', ...d.stages.map((s) => `acts:${s.key}`), 'details', 'decisions', 'volume', 'cost', 'review'];
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
  const [d, setD] = useState<AssistantDraft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    db.getDraft<AssistantDraft>(DRAFT)
      .then((x) => {
        if (x && x.version === 1 && x.name) {
          setD(x);
          setRestored(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => void db.putDraft(DRAFT, d).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [d, loaded]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
    composerRef.current?.querySelector<HTMLElement>('input,textarea,button')?.focus({ preventScroll: true });
  }, [d.step]);

  const order = stepOrder(d);
  const idx = Math.max(0, order.indexOf(d.step));
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
  const setStage = (key: string, patch: Partial<DraftStage>) => setD((x) => ({ ...x, stages: x.stages.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const setAct = (key: string, patch: Partial<DraftActivity>) => setD((x) => ({ ...x, stages: x.stages.map((s) => ({ ...s, activities: s.activities.map((a) => (a.key === key ? { ...a, ...patch } : a)) })) }));

  const acts = allActivities(d);
  const owners = [...new Set(acts.map((a) => a.owner?.trim()).filter(Boolean) as string[])];
  const process = useMemo(() => (d.step === 'review' ? draftToProcess(d) : null), [d]);
  const issues = useMemo(() => (process ? validateProcess(process).filter((i) => i.severity !== 'info') : []), [process]);

  const finish = async () => {
    if (!process || issues.some((i) => i.severity === 'error')) return;
    setBusy(true);
    try {
      const w = await createWorkspace(process, { kind: 'wizard' });
      await db.deleteDraft(DRAFT).catch(() => {});
      toast('ok', 'Projeto criado e salvo neste dispositivo.');
      nav(`/app/p/${w.id}/${issues.length ? 'validar' : 'mapa'}`);
    } catch {
      toast('bad', 'Não foi possível salvar neste navegador. Verifique se o armazenamento do site não está bloqueado.');
    } finally {
      setBusy(false);
    }
  };
  const discard = async () => {
    if (!(await confirm({ title: 'Descartar rascunho?', body: 'As respostas dadas até agora serão apagadas deste aparelho.', confirm: 'Descartar', danger: true }))) return;
    await db.deleteDraft(DRAFT).catch(() => {});
    setD(emptyDraft());
    setRestored(false);
  };

  // Transcrição: perguntas já respondidas, com "Corrigir".
  const answered = order.slice(0, idx).map((step) => ({ step, ...summary(step, d) })).filter((x) => x.q);
  const section = sectionOf(d.step);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-6 pt-4 sm:pt-8">
      <div className="mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold">Novo projeto</h1>
          <Link to="/app/novo/formulario" className="text-xs font-semibold text-accent hover:underline">
            Prefere um formulário único?
          </Link>
        </div>
        <ol className="mt-3 flex gap-1" aria-label={`Seção ${section + 1} de ${SECTIONS.length}: ${SECTIONS[section]}`}>
          {SECTIONS.map((s, i) => (
            <li key={s} className="flex-1" title={s}>
              <span className={clsx('block h-1.5 rounded-full', i < section ? 'bg-brand' : i === section ? 'bg-accentStrong' : 'bg-surface2')} />
            </li>
          ))}
        </ol>
        <p className="mt-1 flex justify-between text-xs text-muted">
          <span>
            {SECTIONS[section]} · {section + 1} de {SECTIONS.length}
          </span>
          <span>Rascunho salvo neste dispositivo</span>
        </p>
      </div>

      {restored && (
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

      <div ref={composerRef} className="mt-4 rounded-2xl border border-line/15 bg-surface p-4 shadow-card sm:p-5" data-testid="assistant-step">
        {d.step === 'name' && (
          <TextStep
            q="Qual processo você deseja analisar?"
            help="Use o nome que a equipe usa no dia a dia."
            value={d.name}
            onChange={(v) => set({ name: v })}
            examples={['Aprovação de compras', 'Atendimento de solicitações internas', 'Processamento de pedidos']}
            onNext={() => next()}
            required
          />
        )}
        {d.step === 'trigger' && (
          <TextStep q="O que inicia esse processo?" help="O evento que dispara o trabalho. Ex.: “Uma área solicita a compra de um material ou serviço”." value={d.trigger ?? ''} onChange={(v) => set({ trigger: v })} onNext={() => next()} onSkip={() => next({ trigger: undefined })} />
        )}
        {d.step === 'outcome' && (
          <TextStep q="Como o processo termina?" help="O resultado entregue. Ex.: “Pedido de compra emitido ao fornecedor”." value={d.outcome ?? ''} onChange={(v) => set({ outcome: v })} onNext={() => next()} onSkip={() => next({ outcome: undefined })} />
        )}
        {d.step === 'stages' && (
          <ListStep
            q="Quais são as principais etapas?"
            help="Pense em 2 a 7 blocos, na ordem em que acontecem. Ex.: Solicitação → Aprovação → Cotação → Compra."
            items={d.stages.map((s) => ({ key: s.key, label: s.name }))}
            onChange={(items) =>
              set({
                stages: items.map((it) => d.stages.find((s) => s.key === it.key) ?? { key: it.key, name: it.label, activities: [] }).map((s, i) => ({ ...s, name: items[i].label })),
              })
            }
            addLabel="Adicionar etapa"
            textPlaceholder={'Solicitação\nAprovação\nCotação\nCompra'}
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
                help="Liste as atividades em ordem, com verbo. Se souber, inclua quem faz e o tempo: “Aprovar compra por Gestor (15 min)” — assim não perguntamos de novo."
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
                textPlaceholder={'Registrar solicitação por Solicitante (10 min)\nAnalisar orçamento por Gestor\nAprovar ou recusar'}
                onNext={() => next()}
                onSkip={() => {
                  setStage(st.key, { skipped: true });
                  next();
                }}
                skipLabel="Ainda não sei — pular etapa"
              />
            );
          })()}
        {d.step === 'details' && <DetailsStep d={d} owners={owners} setAct={setAct} set={set} onNext={() => next()} />}
        {d.step === 'decisions' && <DecisionsStep d={d} set={set} onNext={() => next({ decisionsAnswered: true })} />}
        {d.step === 'volume' && (
          <div className="space-y-4">
            <Bubble>Quantas vezes esse processo acontece?</Bubble>
            <p className="text-sm text-ink2">Com o volume, calculamos esforço por mês e capacidade. Sem ele, ainda mostramos tempos por execução.</p>
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
              <Button onClick={() => next({ volumeUnknown: false })} disabled={d.volume === undefined}>
                Continuar <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </Actions>
          </div>
        )}
        {d.step === 'cost' && (
          <div className="space-y-4">
            <Bubble>Qual o custo-hora médio de quem executa?</Bubble>
            <p className="text-sm text-ink2">Custo carregado: salário + encargos + benefícios ÷ horas trabalhadas. É opcional; sem ele não mostramos valores em R$ (nunca estimamos por você).</p>
            <Field label="Custo-hora (R$)" className="w-48">
              {(f) => <NumberInput {...f} value={d.costPerHour} onChange={(v) => set({ costPerHour: v, costUnknown: false })} placeholder="Ex.: 55" />}
            </Field>
            <Actions>
              <Button variant="secondary" onClick={() => next({ costPerHour: undefined, costUnknown: true })}>
                Não sei / prefiro não informar
              </Button>
              <Button onClick={() => next({ costUnknown: false })} disabled={d.costPerHour === undefined}>
                Continuar <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </Actions>
          </div>
        )}
        {d.step === 'review' && process && (
          <div className="space-y-4">
            <Bubble>Pronto. Confira o resumo antes de criar o projeto.</Bubble>
            <dl className="divide-y divide-line/10 rounded-lg border border-line/15 text-sm">
              <ReviewRow label="Processo" value={d.name} onEdit={() => go('name')} />
              <ReviewRow label="Início · fim" value={`${d.trigger || 'Início'} → ${d.outcome || 'Fim'}`} onEdit={() => go('trigger')} />
              <ReviewRow label="Etapas" value={d.stages.filter((s) => !s.skipped).map((s) => `${s.name} (${s.activities.length})`).join(' → ') || '—'} onEdit={() => go('stages')} />
              <ReviewRow label="Detalhes" value={`${acts.filter((a) => a.duration !== undefined).length}/${acts.length} com tempo · ${acts.filter((a) => a.owner).length}/${acts.length} com responsável`} onEdit={() => set({ step: 'details', detailIndex: 0 })} />
              <ReviewRow label="Decisões" value={d.decisions.length ? d.decisions.map((x) => x.question).join('; ') : 'Nenhuma'} onEdit={() => go('decisions')} />
              <ReviewRow label="Volume" value={d.volumeUnknown || d.volume === undefined ? 'Não informado' : `${fmtNum(d.volume)} por ${PERIOD_TXT[d.period]}`} onEdit={() => go('volume')} />
              <ReviewRow label="Custo-hora" value={d.costUnknown || d.costPerHour === undefined ? 'Não informado' : `R$ ${fmtNum(d.costPerHour)}`} onEdit={() => go('cost')} />
            </dl>
            {issues.length === 0 ? (
              <Callout tone="ok">Tudo certo para criar o projeto. Você poderá completar ou corrigir qualquer dado depois.</Callout>
            ) : (
              issues.slice(0, 6).map((i) => (
                <Callout key={i.id} tone={i.severity === 'error' ? 'bad' : 'warn'} title={i.message}>
                  {i.fix}
                </Callout>
              ))
            )}
            <Actions>
              <Button onClick={() => void finish()} loading={busy} disabled={issues.some((i) => i.severity === 'error') || !acts.length}>
                <Check className="h-4 w-4" aria-hidden /> Criar projeto
              </Button>
            </Actions>
          </div>
        )}
      </div>
      <div ref={endRef} />
      {idx > 0 && (
        <button type="button" className="mt-3 inline-flex min-h-[44px] items-center gap-1 self-start text-sm font-semibold text-ink2 hover:text-ink" onClick={() => go(order[idx - 1])}>
          <ChevronLeft className="h-4 w-4" aria-hidden /> Voltar à pergunta anterior
        </button>
      )}
    </div>
  );
}

function summary(step: string, d: AssistantDraft): { q: string; a: string } {
  if (step === 'name') return { q: 'Qual processo você deseja analisar?', a: d.name };
  if (step === 'trigger') return { q: 'O que inicia esse processo?', a: d.trigger || 'Pulado' };
  if (step === 'outcome') return { q: 'Como o processo termina?', a: d.outcome || 'Pulado' };
  if (step === 'stages') return { q: 'Quais são as principais etapas?', a: d.stages.map((s) => s.name).join(' → ') };
  if (step.startsWith('acts:')) {
    const s = d.stages.find((x) => `acts:${x.key}` === step);
    if (!s) return { q: '', a: '' };
    return { q: `O que acontece em “${s.name}”?`, a: s.skipped ? 'Pulado — completar depois' : s.activities.map((a) => a.name).join('; ') };
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

function TextStep({ q, help, value, onChange, examples, onNext, onSkip, required }: { q: string; help: string; value: string; onChange: (v: string) => void; examples?: string[]; onNext: () => void; onSkip?: () => void; required?: boolean }) {
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
      <Input aria-label={q} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Digite sua resposta" enterKeyHint="next" />
      {examples && (
        <div className="flex flex-wrap gap-2" aria-label="Sugestões">
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
            Pular
          </Button>
        )}
        <Button type="submit" disabled={required && !value.trim()}>
          Continuar <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </Actions>
    </form>
  );
}

type Item = { key: string; label: string; meta?: string; raw?: string };
function ListStep({ q, help, items, onChange, addLabel, textPlaceholder, onNext, onSkip, skipLabel, parse }: { q: string; help: string; items: Item[]; onChange: (items: Item[]) => void; addLabel: string; textPlaceholder: string; onNext: () => void; onSkip?: () => void; skipLabel?: string; parse?: (line: string) => Item }) {
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
            {skipLabel ?? 'Pular'}
          </Button>
        )}
        <Button onClick={onNext} disabled={!items.length || items.some((x) => !x.label.trim())}>
          Continuar <ChevronRight className="h-4 w-4" aria-hidden />
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

function DetailsStep({ d, owners, setAct, set, onNext }: { d: AssistantDraft; owners: string[]; setAct: (k: string, p: Partial<DraftActivity>) => void; set: (p: Partial<AssistantDraft>) => void; onNext: () => void }) {
  const acts = allActivities(d);
  const i = Math.min(d.detailIndex, Math.max(0, acts.length - 1));
  const a = acts[i];
  if (!a)
    return (
      <div className="space-y-3">
        <Bubble>Não há atividades para detalhar.</Bubble>
        <Actions>
          <Button onClick={onNext}>Continuar</Button>
        </Actions>
      </div>
    );
  const known = a.reviewed;
  return (
    <div className="space-y-4">
      <Bubble>
        Detalhes de “{a.name}” <span className="font-normal text-muted">({a.stage})</span>
      </Bubble>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        Atividade {i + 1} de {acts.length} · tudo é opcional — “Não sei” é uma resposta válida.
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
        <legend className="text-sm font-medium">Quem faz? (função ou área)</legend>
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
            onClick={() => {
              setAct(a.key, { reviewed: true });
              set({ detailIndex: i + 1 });
            }}
          >
            Próxima atividade <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button
            onClick={() => {
              setAct(a.key, { reviewed: true });
              onNext();
            }}
          >
            Continuar <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </Actions>
    </div>
  );
}

function DecisionsStep({ d, set, onNext }: { d: AssistantDraft; set: (p: Partial<AssistantDraft>) => void; onNext: () => void }) {
  const acts = allActivities(d);
  const setDec = (key: string, patch: Partial<AssistantDraft['decisions'][number]>) => set({ decisions: d.decisions.map((x) => (x.key === key ? { ...x, ...patch } : x)) });
  const add = () => set({ decisions: [...d.decisions, { key: uid('dc'), question: '', afterKey: acts[0]?.key ?? '', noTarget: '__end' }] });
  const incomplete = d.decisions.some((x) => !x.question.trim() || !x.afterKey);
  return (
    <div className="space-y-4">
      <Bubble>Existe algum ponto de decisão no caminho — uma pergunta com resposta sim ou não?</Bubble>
      <p className="text-sm text-ink2">Ex.: “Orçamento aprovado?”. Com “sim”, o fluxo segue; com “não”, volta para uma atividade (retrabalho) ou encerra.</p>
      {d.decisions.map((x, n) => (
        <div key={x.key} className="space-y-3 rounded-lg border border-violet/30 bg-violet/5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Decisão {n + 1}</p>
            <Button size="sm" variant="ghost" aria-label={`Remover decisão ${n + 1}`} onClick={() => set({ decisions: d.decisions.filter((y) => y.key !== x.key) })}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <Field label="Pergunta">{(f) => <Input {...f} value={x.question} onChange={(e) => setDec(x.key, { question: e.target.value })} placeholder="Ex.: Orçamento aprovado?" />}</Field>
          <Field label="Acontece depois de qual atividade?">
            {(f) => (
              <Select {...f} value={x.afterKey} onChange={(e) => setDec(x.key, { afterKey: e.target.value })}>
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
              <Select {...f} value={x.noTarget} onChange={(e) => setDec(x.key, { noTarget: e.target.value })}>
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
      ))}
      <Actions>
        <Button variant="secondary" onClick={add} disabled={!acts.length}>
          <Plus className="h-4 w-4" aria-hidden /> {d.decisions.length ? 'Outra decisão' : 'Sim, adicionar decisão'}
        </Button>
        <Button onClick={onNext} disabled={incomplete}>
          {d.decisions.length ? 'Continuar' : 'Não há decisões'} <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </Actions>
    </div>
  );
}
