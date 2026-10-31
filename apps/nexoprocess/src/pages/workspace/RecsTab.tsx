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

import { useI18n } from '../../i18n/I18nProvider';
import { lazyLabels } from '../../i18n';
const STATUS_LABEL: Record<RecStatus, string> = lazyLabels({
  pending: 'd.recstatus.pending',
  accepted: 'd.recstatus.accepted',
  rejected: 'd.recstatus.rejected',
  investigating: 'd.recstatus.investigating',
});
const GROUPS: RecGroup[] = ['resolver', 'investigar', 'automatizar', 'monitorar'];

export default function RecsTab() {
  const { t } = useI18n();
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
      { area: t('ws.recs.001'), message: `${STATUS_LABEL[s]}: ${r.title}` },
    );
    if (s === 'rejected') toast('info', t('ws.recs.002'));
  };
  const toAction = (r: Recommendation) => {
    if (w.actions.some((a) => a.origin?.ref === r.id)) {
      toast('info', t('ws.recs.003'));
      return;
    }
    update(
      (d) => {
        d.actions.push(actionFromRecommendation(r, w.recDecisions[r.id]?.editedAction));
      },
      { area: t('ws.recs.004'), message: t('ws.recs.005', { title: r.title }) },
    );
    toast('ok', t('ws.recs.006'));
  };

  const shown = recs.filter((r) => filter === 'todas' || status(r) === filter);
  const counts = (s: RecStatus) => recs.filter((r) => status(r) === s).length;

  return (
    <div className="space-y-4">
      <Callout tone="info" title={t('ws.recs.007')}>{t('ws.recs.008')}<strong>{t('ws.recs.009')}</strong>{t('ws.recs.010')}</Callout>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label={t('ws.recs.011')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'todas', label: t('ws.recs.012', { length: recs.length }) },
            { value: 'pending', label: t('ws.recs.013', { p0: counts('pending') }) },
            { value: 'accepted', label: t('ws.recs.014', { p0: counts('accepted') }) },
            { value: 'investigating', label: t('ws.recs.015', { p0: counts('investigating') }) },
            { value: 'rejected', label: t('ws.recs.016', { p0: counts('rejected') }) },
          ]}
        />
        {counts('accepted') > 0 && (
          <Link to={`/app/p/${w.id}/tobe`} className="text-sm font-semibold text-brand hover:underline">{t('ws.recs.017')}</Link>
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
                    <Badge tone={r.priority === 'alta' ? 'bad' : r.priority === 'media' ? 'amber' : 'muted'}>{t('ws.recs.018')}{r.priority === 'media' ? t('ws.recs.019') : r.priority}</Badge>
                    <Badge tone={st === 'accepted' ? 'ok' : st === 'rejected' ? 'muted' : st === 'investigating' ? 'violet' : 'accent'}>{STATUS_LABEL[st]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink2">{r.problem}</p>
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <p className="font-semibold text-ink">{t('ws.recs.020')}</p>
                      <ul className="mt-1 space-y-1">
                        {r.evidence.map((e, i) => (
                          <li key={i} className="flex gap-2">
                            <Badge tone={e.kind === 'fato' ? 'accent' : 'brand'}>{e.kind === 'fato' ? t('ws.recs.021') : t('ws.recs.022')}</Badge>
                            <span className="text-ink2">{e.text}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-muted">{r.rule}</p>
                    </div>
                    <div className="space-y-2">
                      <p>
                        <span className="font-semibold text-ink">{t('ws.recs.023')}</span> <BasisTag basis="a_validar" />
                        <br />
                        <span className="text-ink2">{r.hypothesis}</span>
                      </p>
                      <p>
                        <span className="font-semibold text-ink">{t('ws.recs.024')}</span> <span className="text-ink2">{dec?.editedAction ?? r.action}</span>
                      </p>
                      <p className="text-xs text-ink2">
                        <strong>{t('ws.recs.025')}</strong> {r.impact}
                      </p>
                      {r.caution && (
                        <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-ink2" role="note">
                          <strong className="text-amber">{t('ws.recs.026')}</strong> {r.caution}
                        </p>
                      )}
                      <p className="text-xs text-ink2">
                        <strong>{t('ws.recs.027')}</strong> {r.successIndicator}
                        {r.owner && (
                          <>
                            {' '}
                            · <strong>{t('ws.recs.028')}</strong> {r.owner}
                          </>
                        )}
                      </p>
                      {r.dependencies.length > 0 && (
                        <div className="text-xs text-ink2">
                          <strong>{t('ws.recs.029')}</strong>
                          <ul className="ml-4 list-disc">
                            {r.dependencies.map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-ink2">
                        <strong>{t('ws.recs.030')}</strong> {r.risks}
                      </p>
                      {r.missingInfo.length > 0 && (
                        <div className="text-xs text-ink2">
                          <strong className="text-amber">{t('ws.recs.031')}</strong>
                          <ul className="ml-4 list-disc">
                            {r.missingInfo.map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-ink2">
                        <strong>{t('ws.recs.032')}</strong> {r.nextStep}
                      </p>
                      {dec?.note && <p className="text-xs text-ink2">{t('ws.recs.033')}{dec.note}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-line/10 pt-3">
                    <Button size="sm" variant={st === 'accepted' ? 'primary' : 'secondary'} onClick={() => decide(r, 'accepted')} aria-pressed={st === 'accepted'}>
                      <Check className="h-4 w-4" />{t('ws.recs.034')}</Button>
                    <Button size="sm" variant="secondary" onClick={() => decide(r, 'investigating')} aria-pressed={st === 'investigating'}>
                      <Search className="h-4 w-4" />{t('ws.recs.035')}</Button>
                    <Button size="sm" variant="secondary" onClick={() => decide(r, 'rejected')} aria-pressed={st === 'rejected'}>
                      <X className="h-4 w-4" />{t('ws.recs.036')}</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(r);
                        setDraft({ action: dec?.editedAction ?? r.action, note: dec?.note ?? '' });
                      }}
                    >
                      <Pencil className="h-4 w-4" />{t('ws.recs.037')}</Button>
                    {st === 'accepted' && (
                      <Button size="sm" variant="ghost" onClick={() => toAction(r)}>
                        <ClipboardPlus className="h-4 w-4" />{t('ws.recs.038')}</Button>
                    )}
                  </div>
                </Card>
              );
            })}
            {list.length > 5 && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded((e) => ({ ...e, [g]: !e[g] }))} aria-expanded={!!expanded[g]}>
                {expanded[g] ? t('ws.recs.039') : t('ws.recs.040', { p0: list.length - 5, p1: GROUP_LABEL[g] })}
              </Button>
            )}
          </section>
        );
      })}
      {!shown.length && <Callout tone="info">{t('ws.recs.041')}</Callout>}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t('ws.recs.042')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('ws.recs.043')}</Button>
            <Button
              onClick={() => {
                const r = editing!;
                update(
                  (d) => {
                    d.recDecisions[r.id] = { status: d.recDecisions[r.id]?.status ?? 'pending', decidedAt: nowIso(), editedAction: draft.action.trim() || undefined, note: draft.note.trim() || undefined };
                  },
                  { area: t('ws.recs.001'), message: t('ws.recs.045', { title: r.title }) },
                );
                setEditing(null);
              }}
            >{t('ws.recs.046')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('ws.recs.047')}>{(f) => <Textarea {...f} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />}</Field>
          <Field label={t('ws.recs.048')}>{(f) => <Textarea {...f} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />}</Field>
          <p className="text-xs text-muted">{t('ws.recs.049')}</p>
        </div>
      </Modal>
    </div>
  );
}
