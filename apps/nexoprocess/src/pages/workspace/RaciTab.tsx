import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Wand2 } from 'lucide-react';
import { Badge, Button, Callout, Card, Input, Table, td, Term, th } from '../../components/ui';

// Nome da atividade e selects alinhados ao centro da linha (td padrão é align-top).
const cell = td.replace('align-top', 'align-middle');
import { raciIssues, suggestRaci } from '../../domain/advanced';
import type { RaciRole } from '../../domain/types';
import { useWorkspace } from '../../state/workspace';

import { useI18n } from '../../i18n/I18nProvider';
const ROLES: (RaciRole | '')[] = ['', 'R', 'A', 'C', 'I'];

export default function RaciTab() {
  const { t } = useI18n();
  const { w, update } = useWorkspace();
  const [newRole, setNewRole] = useState('');
  const r = w.raci;
  const acts = w.asIs.activities.filter((a) => a.type === 'task' || a.type === 'decision').sort((a, b) => a.order - b.order);
  const issues = raciIssues(w.asIs, r);
  const pendingSuggestions = Object.values(r.suggested).reduce((s, x) => s + Object.values(x).filter(Boolean).length, 0);

  const setCell = (aid: string, role: string, v: RaciRole | '') =>
    update((d) => {
      d.raci.cells[aid] ??= {};
      if (v) d.raci.cells[aid][role] = v;
      else delete d.raci.cells[aid][role];
      if (d.raci.suggested[aid]) delete d.raci.suggested[aid][role];
    });

  return (
    <div className="space-y-4">
      <Card title={<>{t('ws.raci.001')}<Term k="raci" iconOnly /></>} subtitle={t('ws.raci.002')}>
        <p className="text-sm text-ink2">
          <strong>R</strong>{t('ws.raci.004')}<strong>A</strong>{t('ws.raci.006')}<strong>C</strong>{t('ws.raci.008')}<strong>I</strong>{t('ws.raci.010')}<strong>R</strong>{t('ws.raci.012')}<strong>A</strong>{t('ws.raci.014')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => update((d) => void (d.raci = suggestRaci(d.asIs, d.raci)), { area: 'RACI', message: t('ws.raci.015') })}>
            <Wand2 className="h-4 w-4" />{t('ws.raci.016')}</Button>
          {pendingSuggestions > 0 && (
            <Button size="sm" variant="ghost" onClick={() => update((d) => void (d.raci.suggested = {}), { area: 'RACI', message: t('ws.raci.017', { pendingSuggestions }) })}>{t('ws.raci.018')}{pendingSuggestions}{t('ws.raci.019')}</Button>
          )}
          <div className="flex gap-2">
            <Input aria-label={t('ws.raci.020')} placeholder={t('ws.raci.021')} value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-56" />
            <Button
              size="sm"
              variant="secondary"
              disabled={!newRole.trim() || r.roles.includes(newRole.trim())}
              onClick={() => {
                update((d) => void d.raci.roles.push(newRole.trim()), { area: 'RACI', message: t('ws.raci.022', { p0: newRole.trim() }) });
                setNewRole('');
              }}
            >
              <Plus className="h-4 w-4" />{t('ws.raci.023')}</Button>
          </div>
        </div>
        {r.roles.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t('ws.raci.024')}</p>
        ) : (
          <div className="mt-4">
            <Table caption={t('ws.raci.025')} minWidth={240 + r.roles.length * 112}>
              <thead>
                <tr>
                  {/* Coluna da atividade fixa ao rolar os papéis no celular. */}
                  <th className={clsx(th, 'left-0 z-20 min-w-[13rem]')}>{t('ws.raci.026')}</th>
                  {r.roles.map((role) => (
                    <th key={role} className={th}>
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {acts.map((a) => (
                  <tr key={a.id}>
                    <td className={clsx(cell, 'sticky left-0 z-10 bg-surface font-medium text-ink')}>{a.name}</td>
                    {r.roles.map((role) => {
                      const v = r.cells[a.id]?.[role] ?? '';
                      const sug = r.suggested[a.id]?.[role];
                      return (
                        <td key={role} className={cell}>
                          <select
                            aria-label={t('ws.raci.027', { name: a.name, role })}
                            value={v}
                            onChange={(e) => setCell(a.id, role, e.target.value as RaciRole | '')}
                            className={clsx('np-select min-h-[36px] w-16 appearance-none rounded-lg border bg-surface2/70 pl-2 pr-6 text-center text-sm font-bold', sug ? 'border-dashed border-amber text-amber' : 'border-line/25 text-ink')}
                            title={sug ? t('ws.raci.030') : undefined}
                          >
                            {ROLES.map((x) => (
                              <option key={x} value={x}>
                                {x || '·'}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Table>
            {pendingSuggestions > 0 && (
              <p className="mt-2 text-xs text-amber">
                <Badge tone="amber">{t('ws.raci.031')}</Badge>{t('ws.raci.032')}</p>
            )}
          </div>
        )}
      </Card>
      {r.roles.length > 0 && issues.length > 0 && (
        <Callout tone="warn" title={t('ws.raci.033', { length: issues.length })}>
          <ul className="list-disc pl-4">
            {issues.slice(0, 12).map((i, n) => (
              <li key={n}>
                {i.name}: {i.issue}
              </li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}
