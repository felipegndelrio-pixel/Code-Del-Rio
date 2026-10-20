import { useState } from 'react';
import clsx from 'clsx';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Drawer, Empty, Field, HowCalc, Input, NumberInput, Select, Table, td, Term, Textarea, th, useConfirm } from '../../components/ui';
import { fmeaPriority, riskLevel, riskScore, rpn } from '../../domain/advanced';
import type { Risk, RiskStatus } from '../../domain/types';
import { uid } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

const STATUS: Record<RiskStatus, string> = { aberto: 'Aberto', mitigando: 'Mitigando', fechado: 'Fechado' };
const clampInt = (v: number | undefined, max: number) => (v === undefined ? undefined : Math.min(max, Math.max(1, Math.round(v))));

export default function RisksTab() {
  const { w, update } = useWorkspace();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<Risk | null>(null);
  const tasks = w.asIs.activities.filter((a) => a.type === 'task' || a.type === 'decision');
  const critNoRisk = w.asIs.activities.filter((a) => a.critical && !w.risks.some((r) => r.activityId === a.id));

  const save = () => {
    if (!edit?.description.trim()) return;
    update(
      (d) => {
        const i = d.risks.findIndex((r) => r.id === edit.id);
        if (i >= 0) d.risks[i] = edit;
        else d.risks.push(edit);
      },
      { area: 'Riscos', message: `Risco salvo: ${edit.description}` },
    );
    setEdit(null);
  };
  const sorted = [...w.risks].sort((a, b) => (rpn(b) ?? -1) - (rpn(a) ?? -1) || (riskScore(b) ?? -1) - (riskScore(a) ?? -1));

  return (
    <div className="space-y-4">
      <Card
        title="Riscos do processo"
        subtitle="Opcional — não bloqueia a jornada"
        action={
          <Button size="sm" onClick={() => setEdit({ id: uid('r_'), description: '', status: 'aberto' })}>
            <Plus className="h-4 w-4" /> Novo risco
          </Button>
        }
      >
        {critNoRisk.length > 0 && (
          <p className="mb-3 text-sm text-ink2">
            Atividades críticas sem risco registrado:{' '}
            {critNoRisk.map((a) => (
              <button key={a.id} type="button" className="mr-2 font-semibold text-brand hover:underline" onClick={() => setEdit({ id: uid('r_'), description: `Falha em “${a.name}”`, activityId: a.id, status: 'aberto' })}>
                {a.name}
              </button>
            ))}
          </p>
        )}
        {!w.risks.length ? (
          <Empty title="Nenhum risco registrado ainda">Vamos pensar no que pode dar errado? Registre a probabilidade, o impacto e o controle de cada risco. Nenhuma pontuação é inventada: sem notas, não calculamos prioridade.</Empty>
        ) : (
          <Table caption="Riscos">
            <thead>
              <tr>
                {['Risco', 'Atividade', 'P × I', 'FMEA (RPN)', 'Controle/mitigação', 'Responsável', 'Situação', ''].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const sc = riskScore(r);
                const lvl = riskLevel(sc);
                const v = rpn(r);
                const fp = fmeaPriority(r);
                return (
                  <tr key={r.id}>
                    <td className={clsx(td, 'text-ink')}>{r.description}</td>
                    <td className={td}>{w.asIs.activities.find((a) => a.id === r.activityId)?.name ?? '—'}</td>
                    <td className={td}>{sc === null ? <span className="text-muted">sem notas</span> : <Badge tone={lvl === 'alto' ? 'bad' : lvl === 'médio' ? 'amber' : 'ok'}>{sc} · {lvl}</Badge>}</td>
                    <td className={td}>{v === null ? <span className="text-muted">—</span> : <Badge tone={fp === 'alta' ? 'bad' : 'muted'}>{v}{fp === 'alta' ? ' · prioridade alta' : ''}</Badge>}</td>
                    <td className={td}>{r.control ?? '—'}</td>
                    <td className={td}>{r.owner ?? '—'}</td>
                    <td className={td}>{STATUS[r.status]}</td>
                    <td className={clsx(td, 'whitespace-nowrap')}>
                      <Button size="sm" variant="ghost" aria-label="Editar risco" onClick={() => setEdit(structuredClone(r))}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Excluir risco" onClick={async () => (await confirm({ title: 'Excluir risco?', body: r.description, confirm: 'Excluir', danger: true })) && update((d) => void (d.risks = d.risks.filter((x) => x.id !== r.id)), { area: 'Riscos', message: `Excluído: ${r.description}` })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <HowCalc>
          <p>P × I = probabilidade (1–5) × impacto (1–5). Alto ≥ 15; médio 8–14; baixo &lt; 8.</p>
          <p>
            <Term k="fmea">FMEA</Term> simplificada (opcional): RPN = severidade × ocorrência × detecção (1–10 cada). Prioridade alta quando RPN ≥ 100 ou severidade ≥ 9. Só calculamos com as três notas informadas.
          </p>
        </HowCalc>
      </Card>

      <Drawer
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit && w.risks.some((r) => r.id === edit.id) ? 'Editar risco' : 'Novo risco'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!edit?.description.trim()}>
              Salvar
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <Field label="Descrição do risco" required>{(f) => <Textarea {...f} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
            <Field label="Atividade relacionada">
              {(f) => (
                <Select {...f} value={edit.activityId ?? ''} onChange={(e) => setEdit({ ...edit, activityId: e.target.value || undefined })}>
                  <option value="">— processo todo —</option>
                  {tasks.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Probabilidade (1–5)">{(f) => <NumberInput {...f} value={edit.probability} onChange={(v) => setEdit({ ...edit, probability: clampInt(v, 5) })} />}</Field>
              <Field label="Impacto (1–5)">{(f) => <NumberInput {...f} value={edit.impact} onChange={(v) => setEdit({ ...edit, impact: clampInt(v, 5) })} />}</Field>
            </div>
            <Field label="Controle / mitigação">{(f) => <Textarea {...f} value={edit.control ?? ''} onChange={(e) => setEdit({ ...edit, control: e.target.value || undefined })} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Responsável">{(f) => <Input {...f} value={edit.owner ?? ''} onChange={(e) => setEdit({ ...edit, owner: e.target.value || undefined })} />}</Field>
              <Field label="Situação">
                {(f) => (
                  <Select {...f} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as RiskStatus })}>
                    {Object.entries(STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <details className="rounded-xl border border-line/15 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink">FMEA simplificada (avançado)</summary>
              <div className="mt-3 space-y-3">
                <Field label="Modo de falha">{(f) => <Input {...f} value={edit.failureMode ?? ''} onChange={(e) => setEdit({ ...edit, failureMode: e.target.value || undefined })} />}</Field>
                <Field label="Efeito">{(f) => <Input {...f} value={edit.effect ?? ''} onChange={(e) => setEdit({ ...edit, effect: e.target.value || undefined })} />}</Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Severidade (1–10)">{(f) => <NumberInput {...f} value={edit.severity} onChange={(v) => setEdit({ ...edit, severity: clampInt(v, 10) })} />}</Field>
                  <Field label="Ocorrência (1–10)">{(f) => <NumberInput {...f} value={edit.occurrence} onChange={(v) => setEdit({ ...edit, occurrence: clampInt(v, 10) })} />}</Field>
                  <Field label="Detecção (1–10)" help="10 = difícil detectar">{(f) => <NumberInput {...f} value={edit.detection} onChange={(v) => setEdit({ ...edit, detection: clampInt(v, 10) })} />}</Field>
                </div>
              </div>
            </details>
          </div>
        )}
      </Drawer>
    </div>
  );
}
