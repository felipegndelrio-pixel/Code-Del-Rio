import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Wand2 } from 'lucide-react';
import { Badge, Button, Callout, Card, Input, Table, td, Term, th } from '../../components/ui';
import { raciIssues, suggestRaci } from '../../domain/advanced';
import type { RaciRole } from '../../domain/types';
import { useWorkspace } from '../../state/workspace';

const ROLES: (RaciRole | '')[] = ['', 'R', 'A', 'C', 'I'];

export default function RaciTab() {
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
      <Card title={<>Matriz de responsabilidades <Term k="raci" iconOnly /></>} subtitle="RACI — opcional">
        <p className="text-sm text-ink2">
          <strong>R</strong> executa · <strong>A</strong> presta contas (só um por atividade) · <strong>C</strong> é consultado · <strong>I</strong> é informado. Sugerimos apenas o <strong>R</strong> a partir do responsável informado; o <strong>A</strong> é sempre decisão sua.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => update((d) => void (d.raci = suggestRaci(d.asIs, d.raci)), { area: 'RACI', message: 'Sugestões de R a partir dos responsáveis' })}>
            <Wand2 className="h-4 w-4" /> Sugerir “R” a partir dos dados
          </Button>
          {pendingSuggestions > 0 && (
            <Button size="sm" variant="ghost" onClick={() => update((d) => void (d.raci.suggested = {}), { area: 'RACI', message: `${pendingSuggestions} sugestão(ões) confirmadas` })}>
              Confirmar {pendingSuggestions} sugestão(ões)
            </Button>
          )}
          <div className="flex gap-2">
            <Input aria-label="Novo papel" placeholder="Novo papel (ex.: Gerente)" value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-56" />
            <Button
              size="sm"
              variant="secondary"
              disabled={!newRole.trim() || r.roles.includes(newRole.trim())}
              onClick={() => {
                update((d) => void d.raci.roles.push(newRole.trim()), { area: 'RACI', message: `Papel adicionado: ${newRole.trim()}` });
                setNewRole('');
              }}
            >
              <Plus className="h-4 w-4" /> Papel
            </Button>
          </div>
        </div>
        {r.roles.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Adicione papéis ou use a sugestão a partir dos responsáveis.</p>
        ) : (
          <div className="mt-4">
            <Table caption="Matriz RACI">
              <thead>
                <tr>
                  <th className={th}>Atividade</th>
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
                    <td className={clsx(td, 'text-ink')}>{a.name}</td>
                    {r.roles.map((role) => {
                      const v = r.cells[a.id]?.[role] ?? '';
                      const sug = r.suggested[a.id]?.[role];
                      return (
                        <td key={role} className={td}>
                          <select
                            aria-label={`${a.name} — ${role}`}
                            value={v}
                            onChange={(e) => setCell(a.id, role, e.target.value as RaciRole | '')}
                            className={clsx('min-h-[36px] w-16 rounded-lg border bg-surface2/70 px-1 text-center text-sm font-bold', sug ? 'border-dashed border-amber text-amber' : 'border-line/25 text-ink')}
                            title={sug ? 'Sugerido a partir dos dados — confirme' : undefined}
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
                <Badge tone="amber">tracejado</Badge> = sugerido a partir dos dados, ainda não confirmado.
              </p>
            )}
          </div>
        )}
      </Card>
      {r.roles.length > 0 && issues.length > 0 && (
        <Callout tone="warn" title={`${issues.length} ponto(s) de atenção na matriz`}>
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
