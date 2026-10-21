import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Check, ClipboardPlus, Pencil, Search, X } from 'lucide-react';
import { Badge, BasisTag, Button, Callout, Card, Field, Modal, Segmented, Textarea, useToast } from '../../components/ui';
import { GROUP_LABEL, type Recommendation, type RecGroup } from '../../domain/recommendations';
import type { RecStatus } from '../../domain/types';
import { nowIso } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';
import { actionFromRecommendation } from '../../domain/plan';

const STATUS_LABEL: Record<RecStatus, string> = { pending: 'Pendente', accepted: 'Aceita', rejected: 'Rejeitada', investigating: 'Investigando' };
const GROUPS: RecGroup[] = ['resolver', 'investigar', 'automatizar', 'monitorar'];

export default function RecsTab() {
  const { w, update, recs } = useWorkspace();
  const toast = useToast();
  const [filter, setFilter] = useState<'todas' | RecStatus>('todas');
  const [editing, setEditing] = useState<Recommendation | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState({ action: '', note: '' });
  useEffect(() => {
    if (!w.visited.recommendations) update((d) => void (d.visited.recommendations = nowIso()));
  }, [w.visited.recommendations, update]);

  const status = (r: Recommendation): RecStatus => w.recDecisions[r.id]?.status ?? 'pending';
  const decide = (r: Recommendation, s: RecStatus) => {
    update(
      (d) => {
        d.recDecisions[r.id] = { ...d.recDecisions[r.id], status: s, decidedAt: nowIso() };
      },
      { area: 'Recomendações', message: `${STATUS_LABEL[s]}: ${r.title}` },
    );
    if (s === 'rejected') toast('info', 'Recomendação rejeitada. Nenhum dado do processo foi alterado.');
  };
  const toAction = (r: Recommendation) => {
    if (w.actions.some((a) => a.origin?.ref === r.id)) {
      toast('info', 'Já existe uma ação para esta recomendação no plano.');
      return;
    }
    update(
      (d) => {
        d.actions.push(actionFromRecommendation(r, w.recDecisions[r.id]?.editedAction));
      },
      { area: 'Plano de ação', message: `Ação criada a partir de “${r.title}”` },
    );
    toast('ok', 'Boa! Ação adicionada ao plano. Responsável e prazo ficam pendentes até você definir.');
  };

  const shown = recs.filter((r) => filter === 'todas' || status(r) === filter);
  const counts = (s: RecStatus) => recs.filter((r) => status(r) === s).length;

  return (
    <div className="space-y-4">
      <Callout tone="info" title="O que melhorar agora?">
        Análise automática baseada nos dados e em regras explícitas — <strong>não há IA generativa conectada</strong>. Cada sugestão mostra a evidência, a regra que a gerou e a hipótese a validar. Rejeitar não altera o processo.
      </Callout>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Filtrar por situação"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'todas', label: `Todas (${recs.length})` },
            { value: 'pending', label: `Pendentes (${counts('pending')})` },
            { value: 'accepted', label: `Aceitas (${counts('accepted')})` },
            { value: 'investigating', label: `Investigando (${counts('investigating')})` },
            { value: 'rejected', label: `Rejeitadas (${counts('rejected')})` },
          ]}
        />
        {counts('accepted') > 0 && (
          <Link to={`/app/p/${w.id}/tobe`} className="text-sm font-semibold text-brand hover:underline">
            Aplicar aceitas no TO-BE →
          </Link>
        )}
      </div>
      {GROUPS.map((g) => {
        const list = shown.filter((r) => r.group === g);
        if (!list.length) return null;
        return (
          <section key={g} aria-labelledby={`g-${g}`} className="space-y-3">
            <h2 id={`g-${g}`} className="text-lg font-bold">
              {GROUP_LABEL[g]} <span className="text-sm font-normal text-muted">({list.length})</span>
            </h2>
            {list.slice(0, expanded[g] ? undefined : 5).map((r) => {
              const st = status(r);
              const dec = w.recDecisions[r.id];
              return (
                <Card key={r.id} className={clsx(st === 'rejected' && 'opacity-70')}>
                  <div className="flex flex-wrap items-start gap-2" data-testid={`rec-${r.id}`}>
                    <h3 className="min-w-0 flex-1 font-bold text-ink">{r.title}</h3>
                    <Badge tone={r.priority === 'alta' ? 'bad' : r.priority === 'media' ? 'amber' : 'muted'}>Prioridade {r.priority === 'media' ? 'média' : r.priority}</Badge>
                    <Badge tone={st === 'accepted' ? 'ok' : st === 'rejected' ? 'muted' : st === 'investigating' ? 'violet' : 'accent'}>{STATUS_LABEL[st]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink2">{r.problem}</p>
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <p className="font-semibold text-ink">Evidência</p>
                      <ul className="mt-1 space-y-1">
                        {r.evidence.map((e, i) => (
                          <li key={i} className="flex gap-2">
                            <Badge tone={e.kind === 'fato' ? 'accent' : 'brand'}>{e.kind === 'fato' ? 'Fato' : 'Inferência'}</Badge>
                            <span className="text-ink2">{e.text}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-muted">{r.rule}</p>
                    </div>
                    <div className="space-y-2">
                      <p>
                        <span className="font-semibold text-ink">Hipótese</span> <BasisTag basis="a_validar" />
                        <br />
                        <span className="text-ink2">{r.hypothesis}</span>
                      </p>
                      <p>
                        <span className="font-semibold text-ink">Intervenção sugerida:</span> <span className="text-ink2">{dec?.editedAction ?? r.action}</span>
                      </p>
                      <p className="text-xs text-ink2">
                        <strong>Impacto:</strong> {r.impact}
                      </p>
                      {r.caution && (
                        <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-ink2" role="note">
                          <strong className="text-amber">Atenção:</strong> {r.caution}
                        </p>
                      )}
                      <p className="text-xs text-ink2">
                        <strong>Indicador de sucesso:</strong> {r.successIndicator}
                        {r.owner && (
                          <>
                            {' '}
                            · <strong>Responsável nos dados:</strong> {r.owner}
                          </>
                        )}
                      </p>
                      {r.dependencies.length > 0 && (
                        <div className="text-xs text-ink2">
                          <strong>Dependências:</strong>
                          <ul className="ml-4 list-disc">
                            {r.dependencies.map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-ink2">
                        <strong>Riscos/efeitos colaterais:</strong> {r.risks}
                      </p>
                      {r.missingInfo.length > 0 && (
                        <div className="text-xs text-ink2">
                          <strong className="text-amber">Informações ausentes:</strong>
                          <ul className="ml-4 list-disc">
                            {r.missingInfo.map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-ink2">
                        <strong>Próximo passo:</strong> {r.nextStep}
                      </p>
                      {dec?.note && <p className="text-xs text-ink2">Nota: {dec.note}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-line/10 pt-3">
                    <Button size="sm" variant={st === 'accepted' ? 'primary' : 'secondary'} onClick={() => decide(r, 'accepted')} aria-pressed={st === 'accepted'}>
                      <Check className="h-4 w-4" /> Aceitar
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => decide(r, 'investigating')} aria-pressed={st === 'investigating'}>
                      <Search className="h-4 w-4" /> Investigar
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => decide(r, 'rejected')} aria-pressed={st === 'rejected'}>
                      <X className="h-4 w-4" /> Rejeitar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(r);
                        setDraft({ action: dec?.editedAction ?? r.action, note: dec?.note ?? '' });
                      }}
                    >
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    {st === 'accepted' && (
                      <Button size="sm" variant="ghost" onClick={() => toAction(r)}>
                        <ClipboardPlus className="h-4 w-4" /> Criar ação no plano
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
            {list.length > 5 && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded((e) => ({ ...e, [g]: !e[g] }))} aria-expanded={!!expanded[g]}>
                {expanded[g] ? 'Mostrar menos' : `Ver mais ${list.length - 5} em “${GROUP_LABEL[g]}”`}
              </Button>
            )}
          </section>
        );
      })}
      {!shown.length && <Callout tone="info">Nenhuma recomendação neste filtro.</Callout>}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar recomendação"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const r = editing!;
                update(
                  (d) => {
                    d.recDecisions[r.id] = { status: d.recDecisions[r.id]?.status ?? 'pending', decidedAt: nowIso(), editedAction: draft.action.trim() || undefined, note: draft.note.trim() || undefined };
                  },
                  { area: 'Recomendações', message: `Editada: ${r.title}` },
                );
                setEditing(null);
              }}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Ação">{(f) => <Textarea {...f} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />}</Field>
          <Field label="Nota (contexto, decisão, fonte)">{(f) => <Textarea {...f} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />}</Field>
          <p className="text-xs text-muted">A evidência e a regra originais são preservadas.</p>
        </div>
      </Modal>
    </div>
  );
}
