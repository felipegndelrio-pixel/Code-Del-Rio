import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Wand2 } from 'lucide-react';
import { ActivityForm } from '../../components/ActivityForm';
import { Badge, Button, Callout, Card, Drawer, useConfirm, useToast } from '../../components/ui';
import { normalizeStages } from '../../domain/factory';
import { dataGaps } from '../../domain/metrics';
import type { Activity } from '../../domain/types';
import { fmtDateTime, nowIso } from '../../domain/units';
import type { Issue } from '../../domain/validation';
import { useWorkspace } from '../../state/workspace';

export default function ValidateTab() {
  const { w, update, issues, metrics } = useWorkspace();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Activity | null>(null);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');
  const gaps = dataGaps(w.asIs, metrics);

  const applyFix = async (i: Issue) => {
    if (!i.autofix) return;
    if (!(await confirm({ title: 'Aplicar correção sugerida?', body: <><p><strong>Problema:</strong> {i.message}</p><p><strong>Correção:</strong> {i.autofix.label}.</p><p>Você pode desfazer restaurando a cópia guardada na aba Dados.</p></>, confirm: 'Aplicar' }))) return;
    update(
      (d) => {
        d.snapshots = [...d.snapshots, { id: `snap_${Date.now()}`, at: nowIso(), label: `Antes de: ${i.autofix!.label}`, process: structuredClone(d.asIs) }].slice(-15);
        d.asIs = i.autofix!.apply(d.asIs);
      },
      { area: 'Validação', message: `Correção aplicada: ${i.autofix.label}` },
    );
    toast('ok', 'Correção aplicada.');
  };

  const accept = () => {
    update((d) => void (d.validationAcceptedAt = nowIso()), { area: 'Validação', message: `Continuar com ${warnings.length} alerta(s) aceito(s)` });
    nav(`/app/p/${w.id}/mapa`);
  };

  const row = (i: Issue) => (
    <li key={i.id} className="rounded-xl border border-line/15 bg-surface2/40 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <Badge tone={i.severity === 'error' ? 'bad' : i.severity === 'warning' ? 'amber' : 'accent'}>{i.severity === 'error' ? 'Impede a análise' : i.severity === 'warning' ? 'Alerta' : 'Informação'}</Badge>
        <p className="min-w-0 flex-1 font-medium text-ink">{i.message}</p>
      </div>
      <p className="mt-1 text-sm text-ink2">
        <strong>Por que importa:</strong> {i.why}
      </p>
      <p className="text-sm text-ink2">
        <strong>Como corrigir:</strong> {i.fix}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {i.activityId && w.asIs.activities.some((a) => a.id === i.activityId) && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(structuredClone(w.asIs.activities.find((a) => a.id === i.activityId)!))}>
            Corrigir dados
          </Button>
        )}
        {i.autofix && (
          <Button size="sm" variant="secondary" onClick={() => void applyFix(i)}>
            <Wand2 className="h-4 w-4" /> Sugestão: {i.autofix.label}
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile n={errors.length} label="Impedem a análise" tone="bad" />
        <Tile n={warnings.length} label="Alertas (não impedem)" tone="amber" />
        <Tile n={gaps.length} label="Dados que desbloqueiam análises" tone="accent" />
      </div>

      {errors.length === 0 ? (
        <Callout
          tone="ok"
          title={warnings.length ? 'Sem erros. Há alertas que limitam algumas conclusões.' : 'Dados validados.'}
          action={
            <Button onClick={accept}>
              <CheckCircle2 className="h-4 w-4" /> {warnings.length ? `Continuar com ${warnings.length} alerta(s)` : 'Continuar para o mapa'}
            </Button>
          }
        >
          {w.validationAcceptedAt ? `Você aceitou continuar em ${fmtDateTime(w.validationAcceptedAt)}.` : 'Você pode corrigir os alertas agora ou continuar e corrigir depois.'}
        </Callout>
      ) : (
        <Callout tone="bad" title={`${errors.length} problema(s) impedem uma análise confiável`}>
          Corrija os itens abaixo. Nada foi descartado: os dados ficam salvos enquanto você ajusta.
        </Callout>
      )}

      {errors.length > 0 && (
        <Card title="Corrigir primeiro" tone="bad">
          <ul className="space-y-2">{errors.map(row)}</ul>
        </Card>
      )}
      {warnings.length > 0 && (
        <Card title="Alertas">
          <ul className="space-y-2">{warnings.map(row)}</ul>
        </Card>
      )}
      {gaps.length > 0 && (
        <Card title="Dados que faltam (opcionais)" subtitle="O que cada um desbloqueia">
          <ul className="space-y-2 text-sm">
            {gaps.map((g) => (
              <li key={g.field} className="flex flex-wrap items-baseline gap-2">
                <Badge tone="accent">
                  {g.missing}/{g.total}
                </Badge>
                <span className="text-ink">{g.label}</span>
                <span className="text-ink2">→ habilita {g.unlocks}.</span>
              </li>
            ))}
          </ul>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => nav(`/app/p/${w.id}/dados`)}>
            Completar na aba Dados
          </Button>
        </Card>
      )}
      {infos.length > 0 && (
        <Card title="Informações">
          <ul className="space-y-2">{infos.map(row)}</ul>
        </Card>
      )}

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Corrigir ${editing?.id ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                update(
                  (d) => {
                    const i = d.asIs.activities.findIndex((a) => a.id === editing!.id);
                    d.asIs.activities[i] = editing!;
                    d.asIs = normalizeStages(d.asIs);
                  },
                  { area: 'Validação', message: `Corrigida “${editing!.name}”` },
                );
                setEditing(null);
              }}
            >
              Salvar correção
            </Button>
          </>
        }
      >
        {editing && <ActivityForm value={editing} onChange={setEditing} all={w.asIs.activities} stages={w.asIs.stageOrder} />}
      </Drawer>
    </div>
  );
}

function Tile({ n, label, tone }: { n: number; label: string; tone: 'bad' | 'amber' | 'accent' }) {
  return (
    <div className="rounded-xl border border-line/15 bg-surface p-3 shadow-card">
      <p className={`text-2xl font-bold ${n === 0 ? 'text-ok' : tone === 'bad' ? 'text-bad' : tone === 'amber' ? 'text-amber' : 'text-accent'}`}>{n}</p>
      <p className="text-xs text-ink2">{label}</p>
    </div>
  );
}
