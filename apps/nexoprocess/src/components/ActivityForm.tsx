// Formulário de atividade com modo básico e campos avançados sob demanda.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { LEAN_REASON_LABEL, type Activity, type DurationUnit, type ElementType, type LeanClass, type LeanReason } from '../domain/types';
import { Field, Input, NumberInput, Select, Term, Textarea } from './ui';

export function ActivityForm({ value, onChange, all, stages, errors = {} }: { value: Activity; onChange: (a: Activity) => void; all: Activity[]; stages: string[]; errors?: Record<string, string> }) {
  const [adv, setAdv] = useState(false);
  const set = (patch: Partial<Activity>) => onChange({ ...value, ...patch });
  const others = all.filter((a) => a.id !== value.id).sort((a, b) => a.order - b.order);
  const isWork = value.type === 'task' || value.type === 'decision';
  const refSelect = (label: string, v: string | undefined, on: (x: string | undefined) => void, help?: string) => (
    <Field label={label} help={help}>
      {(p) => (
        <Select {...p} value={v ?? ''} onChange={(e) => on(e.target.value || undefined)}>
          <option value="">— nenhuma —</option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id} · {a.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" required error={errors.name} className="sm:col-span-2">
          {(p) => <Input {...p} value={value.name} onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <Field label="Etapa macro" help="Escolha uma existente ou digite uma nova.">
          {(p) => (
            <>
              <Input {...p} list="np-stages" value={value.stage} onChange={(e) => set({ stage: e.target.value })} />
              <datalist id="np-stages">
                {stages.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Tipo">
          {(p) => (
            <Select {...p} value={value.type} onChange={(e) => set({ type: e.target.value as ElementType })}>
              <option value="start">Início</option>
              <option value="task">Atividade</option>
              <option value="decision">Decisão</option>
              <option value="end">Fim</option>
            </Select>
          )}
        </Field>
        {isWork && (
          <>
            <div className="flex gap-2">
              <Field label={<>Duração <Term k="active" iconOnly /></>} help="Trabalho ativo de uma execução." className="flex-1">
                {(p) => <NumberInput {...p} value={value.duration} onChange={(v) => set({ duration: v })} />}
              </Field>
              <Field label="Unidade" className="w-28">
                {(p) => (
                  <Select {...p} value={value.unit} onChange={(e) => set({ unit: e.target.value as DurationUnit })}>
                    <option value="min">min</option>
                    <option value="h">horas</option>
                    <option value="d">dias</option>
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Tempo de espera antes" help="Na mesma unidade. Vazio = não informado.">
              {(p) => <NumberInput {...p} value={value.wait} onChange={(v) => set({ wait: v })} />}
            </Field>
            <Field label="Responsável (função)">{(p) => <Input {...p} value={value.owner ?? ''} onChange={(e) => set({ owner: e.target.value || undefined })} />}</Field>
            <Field label={<>Pessoas ao mesmo tempo <Term k="effort" iconOnly /></>}>
              {(p) => <NumberInput {...p} value={value.people} onChange={(v) => set({ people: v })} />}
            </Field>
            <Field label={<>Classificação Lean <Term k="lean" iconOnly /></>} className="sm:col-span-2">
              {(p) => (
                <Select
                  {...p}
                  value={value.lean ?? ''}
                  onChange={(e) => {
                    const lean = (e.target.value || undefined) as LeanClass | undefined;
                    set(lean === 'NNVA' ? { lean } : { lean, leanReason: undefined, leanReasonNote: undefined });
                  }}
                >
                  <option value="">Não classificado</option>
                  <option value="VA">Agrega valor — o cliente pagaria por isso</option>
                  <option value="NNVA">Necessário, mas não agrega valor</option>
                  <option value="W">Desperdício — poderia não existir</option>
                </Select>
              )}
            </Field>
            {value.lean === 'NNVA' && (
              <>
                <Field label="Por que é necessária?" help="Exigências legais, de controle ou de segurança não são desperdício: podem ser simplificadas, não eliminadas.">
                  {(p) => (
                    <Select {...p} value={value.leanReason ?? ''} onChange={(e) => set({ leanReason: (e.target.value || undefined) as LeanReason | undefined })}>
                      <option value="">Ainda não sei</option>
                      {Object.entries(LEAN_REASON_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Referência (opcional)" help="Ex.: norma, política interna, cláusula contratual.">
                  {(p) => <Input {...p} value={value.leanReasonNote ?? ''} onChange={(e) => set({ leanReasonNote: e.target.value || undefined })} />}
                </Field>
              </>
            )}
          </>
        )}
      </div>

      <fieldset className="space-y-3 rounded-xl border border-line/15 p-3">
        <legend className="px-1 text-sm font-semibold text-ink">Para onde o fluxo segue</legend>
        {value.type === 'decision' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {refSelect('Se SIM', value.nextYes, (x) => set({ nextYes: x }))}
            {refSelect('Se NÃO', value.nextNo, (x) => set({ nextNo: x }))}
          </div>
        ) : value.type === 'end' ? (
          <p className="text-sm text-muted">Eventos de fim não têm próxima atividade.</p>
        ) : (
          <>
            {refSelect('Próxima atividade', value.next[0], (x) => set({ next: [x, ...value.next.slice(1)].filter(Boolean) as string[], flowInferred: false }))}
            {value.next.length > 1 && <p className="text-xs text-muted">Também segue em paralelo para: {value.next.slice(1).join(', ')}</p>}
            {refSelect('Em paralelo, também para (opcional)', value.next[1], (x) => set({ next: [value.next[0], x].filter(Boolean) as string[], flowInferred: false }), 'Use quando duas atividades acontecem ao mesmo tempo.')}
          </>
        )}
        {value.flowInferred && <p className="text-xs text-amber">Ligação inferida pela ordem das linhas — confirme ou ajuste.</p>}
      </fieldset>

      {isWork && (
        <div>
          <button type="button" aria-expanded={adv} onClick={() => setAdv((a) => !a)} className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-brand">
            <ChevronDown className={`h-4 w-4 transition ${adv ? 'rotate-180' : ''}`} aria-hidden /> Campos avançados (opcionais)
          </button>
          {adv && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Ordem">{(p) => <NumberInput {...p} value={value.order} onChange={(v) => set({ order: v ?? value.order })} />}</Field>
              <Field label="Frequência (% das execuções)" help="Ex.: 20 = acontece em 1 de cada 5 execuções.">
                {(p) => <NumberInput {...p} value={value.frequencyPct} onChange={(v) => set({ frequencyPct: v })} />}
              </Field>
              <Field label="Duração mínima" help="Para simulação de prazo.">
                {(p) => <NumberInput {...p} value={value.minDuration} onChange={(v) => set({ minDuration: v })} />}
              </Field>
              <Field label="Duração máxima" help="Para simulação de prazo.">
                {(p) => <NumberInput {...p} value={value.maxDuration} onChange={(v) => set({ maxDuration: v })} />}
              </Field>
              <Field label="Custo-hora desta atividade (R$)" help="Sobrepõe o custo por função e o padrão.">
                {(p) => <NumberInput {...p} value={value.costPerHour} onChange={(v) => set({ costPerHour: v })} />}
              </Field>
              <Field label="Custo variável por execução (R$)">{(p) => <NumberInput {...p} value={value.variableCost} onChange={(v) => set({ variableCost: v })} />}</Field>
              <Field label="Volume próprio no período" help="Só se diferente do volume do processo.">
                {(p) => <NumberInput {...p} value={value.volume} onChange={(v) => set({ volume: v })} />}
              </Field>
              <div className="flex flex-col gap-2 pt-6">
                <label className="flex min-h-[32px] items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={!!value.rework} onChange={(e) => set({ rework: e.target.checked || undefined })} /> É retrabalho <Term k="rework" iconOnly />
                </label>
                <label className="flex min-h-[32px] items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={!!value.critical} onChange={(e) => set({ critical: e.target.checked || undefined })} /> Atividade crítica
                </label>
              </div>
              <Field label="Observações" className="sm:col-span-2">
                {(p) => <Textarea {...p} value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />}
              </Field>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
