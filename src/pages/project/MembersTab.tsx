import { useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { useProject } from '../ProjectDetail';
import { supabase } from '../../lib/supabase';
import { addMember } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { MEMBER_ROLES, ROLE_LABEL } from '../../lib/constants';
import type { MemberRole } from '../../lib/types';
import { Button, ConfirmDialog, Field, inputCls, useToast } from '../../components/ui';

export default function MembersTab() {
  const { project, members, profiles, canManage, isAdmin, me, reload } = useProject();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('responsavel');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-navy-700 bg-navy-900/60 p-3 text-xs text-slate-300">
        <p className="mb-1 font-semibold text-slate-100">Permissões por papel (aplicadas no banco de dados)</p>
        <ul className="list-inside list-disc space-y-0.5">
          <li><b>Sponsor / Gerente</b>: editam o projeto e todos os registros, gerenciam membros, aprovam decisões e mudanças.</li>
          <li><b>Responsável</b>: atualiza status, avanço, bloqueios, evidências e próximo passo das próprias ações; registra problemas, comentários, lições e anexos.</li>
          <li><b>Observador</b>: somente leitura.</li>
          <li><b>Administrador da plataforma</b>: acesso total e gestão de usuários.</li>
        </ul>
      </div>
      {canManage && (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_220px_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await addMember(supabase, project.id, email.trim(), role);
              toast('ok', 'Membro incluído');
              setEmail('');
              reload();
            } catch (err) {
              toast('error', (err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="E-mail do usuário (precisa ter conta)" required>
            {(id) => <input id={id} type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Field label="Papel">
            {(id) => (
              <select id={id} className={inputCls} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
                {MEMBER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Button type="submit" loading={busy}>
            <UserPlus className="h-4 w-4" /> Incluir
          </Button>
        </form>
      )}
      <ul className="divide-y divide-navy-700 rounded-xl border border-navy-700">
        {members.map((m) => {
          const p = byId.get(m.user_id);
          const self = m.user_id === me;
          return (
            <li key={m.user_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-white">{p?.full_name || p?.email || m.user_id}</p>
                <p className="truncate text-xs text-slate-500">{p?.email}</p>
              </div>
              {canManage && (!self || isAdmin) ? (
                <select
                  className={inputCls + ' w-48'}
                  value={m.role}
                  aria-label={`Papel de ${p?.email}`}
                  onChange={async (e) => {
                    const { error } = await supabase.from('project_members').update({ role: e.target.value }).eq('project_id', project.id).eq('user_id', m.user_id);
                    if (error) toast('error', friendlyError(error));
                    else toast('ok', 'Papel atualizado');
                    reload();
                  }}
                >
                  {MEMBER_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-teal-200">{ROLE_LABEL[m.role]}</span>
              )}
              {canManage && (!self || isAdmin) && (
                <button className="rounded p-2 text-red-300 hover:bg-red-950" aria-label={`Remover ${p?.email}`} onClick={() => setRemoving(m.user_id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!removing}
        danger
        title="Remover membro"
        message="O usuário perderá o acesso ao projeto imediatamente. Ações atribuídas a ele permanecem e devem ser reatribuídas."
        confirmLabel="Remover"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const { error } = await supabase.from('project_members').delete().eq('project_id', project.id).eq('user_id', removing!);
          if (error) toast('error', friendlyError(error));
          else toast('ok', 'Membro removido');
          setRemoving(null);
          reload();
        }}
      />
    </div>
  );
}
