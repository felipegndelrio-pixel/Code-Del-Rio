// Oportunidades de automação e IA: avaliação por critérios explícitos,
// checklist de prontidão e acompanhamento por etapas. A ferramenta sugere;
// uma pessoa valida.
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Badge, Callout, Card, Field, Input, Select, Textarea } from '../../components/ui';
import { AI_STAGES, automationScore, automationVerdict, CHECKLIST, CRITERIA } from '../../domain/advanced';
import { LEAN_LABEL, PERIOD_LABEL, type AiStage, type AutomationAssessment } from '../../domain/types';
import { fmtHours, fmtNum, fmtPct } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

const blank = (activityId: string): AutomationAssessment => ({ activityId, answers: {}, checklist: {}, stage: 'descoberta' });

export default function AutomationTab() {
  const { w, update, metrics } = useWorkspace();
  const per = PERIOD_LABEL[w.asIs.volumePeriod];
  // Candidatas ordenadas por evidência observável: esforço no período (ou por execução).
  const candidates = useMemo(
    () =>
      metrics.workItems
        .filter((a) => a.type === 'task')
        .map((a) => ({ a, m: metrics.per.get(a.id)! }))
        .sort((x, y) => (y.m.effortPeriodH ?? y.m.effortH ?? 0) - (x.m.effortPeriodH ?? x.m.effortH ?? 0)),
    [metrics],
  );
  const [sel, setSel] = useState<string>(Object.keys(w.automation)[0] ?? candidates[0]?.a.id ?? '');
  const cur = w.automation[sel] ?? blank(sel);
  const act = candidates.find((c) => c.a.id === sel);
  const score = automationScore(cur);
  const set = (patch: Partial<AutomationAssessment>, msg?: string) =>
    update(
      (d) => {
        d.automation[sel] = { ...(d.automation[sel] ?? blank(sel)), ...patch };
      },
      msg ? { area: 'Automação e IA', message: msg } : undefined,
    );
  const totalEffort = metrics.effortPeriodH.value;

  return (
    <div className="space-y-4">
      <Callout tone="info" title="A ferramenta sugere; uma pessoa valida">
        A avaliação usa critérios explícitos que você responde. Nada é enviado a serviços de IA. As etapas de acompanhamento seguem boas práticas gerais de ciclo de vida de iniciativas de IA — não reproduzem nenhum padrão oficial.
      </Callout>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card title="Candidatas" subtitle="Ordenadas por esforço observado">
          <ul className="max-h-[520px] space-y-1 overflow-y-auto">
            {candidates.map(({ a, m }) => {
              const s = w.automation[a.id] ? automationScore(w.automation[a.id]).score : null;
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => setSel(a.id)} aria-pressed={sel === a.id} className={clsx('w-full rounded-xl border px-3 py-2 text-left text-sm', sel === a.id ? 'border-brand bg-brand/10' : 'border-line/15 hover:border-brand/40')}>
                    <span className="block font-medium text-ink">{a.name}</span>
                    <span className="text-xs text-muted">
                      {m.effortPeriodH !== null ? `${fmtNum(m.effortPeriodH)} pessoa-h/${per}` : m.effortH !== null ? `${fmtNum(m.effortH)} pessoa-h/ocorrência` : 'sem esforço calculável'} · {LEAN_LABEL[a.lean ?? 'U']}
                      {s !== null && ` · aptidão ${fmtNum(s, 0)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {act ? (
          <div className="space-y-4">
            <Card title={act.a.name} subtitle="Evidências dos dados">
              <ul className="grid gap-2 text-sm text-ink2 sm:grid-cols-2">
                <li>Duração ativa: {fmtHours(act.m.activeH)} por ocorrência</li>
                <li>Pessoas: {act.a.people ?? 'não informado'}</li>
                <li>Ocorrências no período: {act.m.execPerPeriod !== null ? `${fmtNum(act.m.execPerPeriod)}/${per}` : 'volume não informado'}</li>
                <li>
                  Esforço no período: {act.m.effortPeriodH !== null ? `${fmtNum(act.m.effortPeriodH)} pessoa-h` : '—'}
                  {act.m.effortPeriodH !== null && totalEffort ? ` (${fmtPct((act.m.effortPeriodH / totalEffort) * 100)} do processo)` : ''}
                </li>
                <li>Classificação Lean: {LEAN_LABEL[act.a.lean ?? 'U']}</li>
                <li>{act.a.rework ? 'Marcada como retrabalho' : 'Não é retrabalho'}{act.a.critical ? ' · crítica' : ''}</li>
              </ul>
              <p className="mt-3 text-sm text-ink2">
                <strong className="text-ink">Benefício potencial:</strong>{' '}
                {act.m.effortPeriodH !== null ? `até ${fmtNum(act.m.effortPeriodH)} pessoa-h/${per} seria o teto teórico se nenhum trabalho humano restasse — o que raramente acontece. Informe no TO-BE o tempo que continuará necessário (supervisão, exceções).` : 'informe volume, duração e pessoas para dimensionar.'}
              </p>
            </Card>

            <Card title="Critérios de aptidão" subtitle="Notas de 1 a 5 (você responde)">
              <div className="grid gap-3 sm:grid-cols-2">
                {CRITERIA.map((c) => (
                  <Field key={c.key} label={c.label} help={c.help}>
                    {(f) => (
                      <Select {...f} value={cur.answers[c.key] ?? ''} onChange={(e) => set({ answers: { ...cur.answers, [c.key]: e.target.value ? Number(e.target.value) : undefined } })}>
                        <option value="">Não sei</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-line/15 bg-surface2/50 p-3 text-sm">
                <p>
                  <strong className="text-ink">Índice de aptidão:</strong> {score.score === null ? `— (${score.answered}/6 respondidos; mínimo 4)` : `${fmtNum(score.score, 0)} de 100`}
                </p>
                <p className="text-ink2">{automationVerdict(score.score, cur.answers.julgamento)}</p>
                <p className="mt-1 text-xs text-muted">Fórmula: média das notas (critérios desfavoráveis invertidos: 6 − nota), reescalada de 1–5 para 0–100.</p>
              </div>
            </Card>

            <Card title="Prontidão e governança" subtitle="Checklist">
              <ul className="space-y-1">
                {CHECKLIST.map((c) => (
                  <li key={c.key}>
                    <label className="flex min-h-[36px] items-center gap-2 text-sm text-ink2">
                      <input type="checkbox" className="h-4 w-4" checked={!!cur.checklist[c.key]} onChange={(e) => set({ checklist: { ...cur.checklist, [c.key]: e.target.checked } })} />
                      {c.label}
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                {Object.values(cur.checklist).filter(Boolean).length}/{CHECKLIST.length} itens confirmados.
              </p>
            </Card>

            <Card title="Acompanhamento da iniciativa" subtitle="Etapas">
              <ol className="flex flex-wrap gap-2">
                {AI_STAGES.map((s) => (
                  <li key={s.key}>
                    <button type="button" aria-pressed={cur.stage === s.key} onClick={() => set({ stage: s.key as AiStage }, `${act.a.name}: etapa ${s.label}`)} className={clsx('min-h-[40px] rounded-xl border px-3 text-sm font-semibold', cur.stage === s.key ? 'border-brand bg-brand/15 text-ink' : 'border-line/15 text-ink2')}>
                      {s.label}
                    </button>
                  </li>
                ))}
              </ol>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Próximo teste recomendado" help="Ex.: piloto com 50 casos e checagem humana de 100%.">
                  {(f) => <Input {...f} value={cur.nextTest ?? ''} onChange={(e) => set({ nextTest: e.target.value || undefined })} />}
                </Field>
                <Field label="Pré-requisitos, riscos e notas">{(f) => <Textarea {...f} value={cur.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />}</Field>
              </div>
              {cur.stage === 'descontinuada' && <Badge tone="muted">Iniciativa descontinuada — mantenha o registro do motivo nas notas.</Badge>}
            </Card>
          </div>
        ) : (
          <Callout tone="info">Cadastre atividades com duração para avaliar oportunidades.</Callout>
        )}
      </div>
    </div>
  );
}
