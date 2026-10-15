import { useMemo, useState, type ReactNode } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge, Button, ConfirmDialog, EmptyState, Field, Modal, STATUS_TONE, fmtDate, fmtMoney, inputCls, useToast } from './ui';
import { labelOf, type Option } from '../lib/constants';
import { deleteRow, insertRow, updateRow, type Table } from '../lib/api';
import { supabase } from '../lib/supabase';

export type FieldType = 'text' | 'textarea' | 'date' | 'number' | 'money' | 'int' | 'select' | 'bool';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  options?: Option[];
  required?: boolean;
  inTable?: boolean;
  hint?: string;
  min?: number;
  max?: number;
  full?: boolean;
  badge?: boolean;
  /** Somente exibição na tabela (campo calculado/sistema) — nunca vai ao formulário. */
  tableOnly?: boolean;
  render?: (row: any) => ReactNode;
}

export function displayValue(f: FieldDef, v: any): ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-slate-500">—</span>;
  switch (f.type) {
    case 'date':
      return fmtDate(v);
    case 'money':
      return fmtMoney(v);
    case 'bool':
      return v ? 'Sim' : 'Não';
    case 'select':
      return f.badge ? <Badge tone={STATUS_TONE[v]}>{labelOf(f.options ?? [], v)}</Badge> : labelOf(f.options ?? [], v);
    default:
      return String(v);
  }
}

function toFormValue(f: FieldDef, v: any): string {
  if (v === null || v === undefined) return '';
  if (f.type === 'bool') return v ? 'true' : 'false';
  return String(v);
}

function fromFormValue(f: FieldDef, s: string): any {
  if (s === '') return f.type === 'bool' ? false : null;
  switch (f.type) {
    case 'number':
    case 'money':
      return Number(s.replace(',', '.'));
    case 'int':
      return parseInt(s, 10);
    case 'bool':
      return s === 'true';
    default:
      return s;
  }
}

export function EntityForm({ fields, initial, onSubmit, onCancel, locked = [], submitLabel = 'Salvar' }: {
  fields: FieldDef[];
  initial: Record<string, any>;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  locked?: string[];
  submitLabel?: string;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, toFormValue(f, initial[f.name])])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    for (const f of fields) {
      const s = vals[f.name];
      if (f.required && !s) e[f.name] = 'Obrigatório';
      if (s && (f.type === 'number' || f.type === 'money' || f.type === 'int')) {
        const n = Number(s.replace(',', '.'));
        if (!Number.isFinite(n)) e[f.name] = 'Número inválido';
        else if (f.min !== undefined && n < f.min) e[f.name] = `Mínimo ${f.min}`;
        else if (f.max !== undefined && n > f.max) e[f.name] = `Máximo ${f.max}`;
        else if (f.type === 'int' && !Number.isInteger(n)) e[f.name] = 'Use número inteiro';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!validate()) return;
        setBusy(true);
        try {
          const out: Record<string, any> = {};
          for (const f of fields) {
            if (locked.includes(f.name)) continue;
            const next = fromFormValue(f, vals[f.name]);
            if (toFormValue(f, initial[f.name]) !== vals[f.name] || initial[f.name] === undefined) out[f.name] = next;
          }
          await onSubmit(out);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const disabled = locked.includes(f.name);
          const common = {
            value: vals[f.name],
            disabled,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setVals((v) => ({ ...v, [f.name]: e.target.value })),
          };
          return (
            <div key={f.name} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <Field label={f.label} required={f.required} error={errors[f.name]} hint={disabled ? 'Somente gerente/sponsor altera este campo' : f.hint}>
                {(id) =>
                  f.type === 'textarea' ? (
                    <textarea id={id} rows={3} className={inputCls} {...common} />
                  ) : f.type === 'select' || f.type === 'bool' ? (
                    <select id={id} className={inputCls} {...common}>
                      {f.type === 'bool' ? (
                        <>
                          <option value="false">Não</option>
                          <option value="true">Sim</option>
                        </>
                      ) : (
                        <>
                          <option value="">{f.required ? 'Selecione…' : '—'}</option>
                          {(f.options ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  ) : (
                    <input
                      id={id}
                      className={inputCls}
                      type={f.type === 'date' ? 'date' : 'text'}
                      inputMode={f.type === 'number' || f.type === 'money' ? 'decimal' : f.type === 'int' ? 'numeric' : undefined}
                      {...common}
                    />
                  )
                }
              </Field>
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-navy-700 bg-navy-900 px-4 pt-3 sm:static sm:mx-0 sm:border-0 sm:px-0">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function EntityManager({
  title,
  table,
  projectId,
  rows,
  fields,
  reload,
  canCreate,
  canEdit,
  canDelete,
  lockedFor,
  defaults = {},
  filter,
  extraActions,
  emptyHint,
}: {
  title: string;
  table: Table;
  projectId: string;
  rows: any[];
  fields: FieldDef[];
  reload: () => void;
  canCreate: boolean;
  canEdit: (row: any) => boolean;
  canDelete: (row: any) => boolean;
  lockedFor?: (row: any) => string[];
  defaults?: Record<string, any>;
  filter?: { name: string; label: string; options: Option[] };
  extraActions?: (row: any) => ReactNode;
  emptyHint?: string;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [fv, setFv] = useState('');
  const tableFields = fields.filter((f) => f.inTable);

  const visible = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!fv || String(r[filter!.name]) === fv) &&
        (!k || [r.code, ...fields.filter((f) => f.type === 'text' || f.type === 'textarea').map((f) => r[f.name])].some((v) => v && String(v).toLowerCase().includes(k))),
    );
  }, [rows, q, fv, fields, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-base font-bold text-white">
          {title} <span className="text-sm font-normal text-slate-400">({rows.length})</span>
        </h3>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <input className={inputCls + ' w-44 pl-8'} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </div>
        {filter && (
          <select className={inputCls + ' w-40'} value={fv} onChange={(e) => setFv(e.target.value)} aria-label={filter.label}>
            <option value="">{filter.label}: todos</option>
            {filter.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {canCreate && (
          <Button onClick={() => setEditing({ ...defaults })}>
            <Plus className="h-4 w-4" /> Novo
          </Button>
        )}
      </div>

      {!visible.length ? (
        <EmptyState title={rows.length ? 'Nenhum resultado para o filtro' : `Nenhum registro em ${title.toLowerCase()}`}>{!rows.length && emptyHint}</EmptyState>
      ) : (
        <>
          {/* Tabela (tablet/desktop) */}
          <div className="hidden overflow-x-auto rounded-xl border border-navy-700 md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-navy-800 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  {tableFields.map((f) => (
                    <th key={f.name} className="px-3 py-2">
                      {f.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-navy-800/60">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-teal-200">{r.code ?? '—'}</td>
                    {tableFields.map((f) => (
                      <td key={f.name} className="max-w-xs px-3 py-2 text-slate-200">
                        {f.render ? f.render(r) : displayValue(f, r[f.name])}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {extraActions?.(r)}
                      {canEdit(r) && (
                        <button className="rounded p-1.5 text-slate-300 hover:bg-navy-700 hover:text-white" onClick={() => setEditing(r)} aria-label={`Editar ${r.code ?? ''}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete(r) && (
                        <button className="rounded p-1.5 text-red-300 hover:bg-red-950" onClick={() => setDeleting(r)} aria-label={`Excluir ${r.code ?? ''}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Cartões (celular) */}
          <ul className="space-y-2 md:hidden">
            {visible.map((r) => (
              <li key={r.id} className="rounded-xl border border-navy-700 bg-navy-900/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs text-teal-200">{r.code ?? ''}</span>
                  <div className="flex">
                    {extraActions?.(r)}
                    {canEdit(r) && (
                      <button className="rounded p-2 text-slate-300" onClick={() => setEditing(r)} aria-label={`Editar ${r.code ?? ''}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {canDelete(r) && (
                      <button className="rounded p-2 text-red-300" onClick={() => setDeleting(r)} aria-label={`Excluir ${r.code ?? ''}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {tableFields.map((f) => (
                    <div key={f.name} className="min-w-0">
                      <dt className="text-[11px] text-slate-500">{f.label}</dt>
                      <dd className="truncate text-slate-200">{f.render ? f.render(r) : displayValue(f, r[f.name])}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal open={!!editing} title={editing?.id ? `Editar ${editing.code ?? title}` : `Novo — ${title}`} onClose={() => setEditing(null)} wide>
        {editing && (
          <EntityForm
            fields={fields.filter((f) => !f.tableOnly)}
            initial={editing}
            locked={editing.id && lockedFor ? lockedFor(editing) : []}
            onCancel={() => setEditing(null)}
            onSubmit={async (vals) => {
              try {
                if (editing.id) {
                  if (Object.keys(vals).length) await updateRow(supabase, table, editing.id, vals);
                } else {
                  await insertRow(supabase, table, { ...defaults, ...vals, project_id: projectId });
                }
                toast('ok', 'Registro salvo');
                setEditing(null);
                reload();
              } catch (e) {
                toast('error', (e as Error).message);
              }
            }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        danger
        busy={busy}
        title="Excluir registro"
        message={
          <>
            Excluir <strong>{deleting?.code ?? 'este registro'}</strong> permanentemente? Uma cópia completa ficará registrada na trilha de auditoria.
          </>
        }
        confirmLabel="Excluir"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await deleteRow(supabase, table, deleting.id);
            toast('ok', 'Registro excluído');
            setDeleting(null);
            reload();
          } catch (e) {
            toast('error', (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
