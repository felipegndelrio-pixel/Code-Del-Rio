import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { DatabaseBackup } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAll, loadDataset, updateRow } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import type { Profile } from '../lib/types';
import { Button, Card, ErrorBox, Spinner, fmtDate, inputCls, useToast } from '../components/ui';
import { buildWorkbook, workbookToBuffer } from '../lib/sheets/export';

export default function Admin() {
  const { profile, session, refreshProfile } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const { data, error, loading, reload } = useAsync(() => fetchAll<Profile>(supabase, 'profiles', { order: 'email' }), []);
  if (!profile?.is_platform_admin) return <Navigate to="/" replace />;
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const list = (data ?? []).filter((p) => `${p.email} ${p.full_name ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  const toggle = async (p: Profile, field: 'is_platform_admin' | 'can_create_projects' | 'active') => {
    try {
      await updateRow(supabase, 'profiles', p.id, { [field]: !p[field] });
      toast('ok', 'Permissão atualizada');
      reload();
      if (p.id === session?.user.id) refreshProfile();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const backup = async (kind: 'json' | 'xlsx') => {
    setBusy(kind);
    try {
      const d = await loadDataset(supabase, { auditLimit: 100000 });
      const name = `backup-gestao-${new Date().toISOString().slice(0, 10)}`;
      const blob =
        kind === 'json'
          ? new Blob([JSON.stringify({ format: 'gestao-projetos-backup', version: 1, generated_at: new Date().toISOString(), generated_by: session?.user.email, data: d }, null, 1)], {
              type: 'application/json',
            })
          : new Blob([await workbookToBuffer(buildWorkbook(d, { generatedBy: session?.user.email ?? '', filters: 'Backup completo (administrador)' }))]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.${kind}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('ok', 'Backup gerado. Guarde-o fora do Supabase (ex.: drive corporativo).');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="headline text-2xl font-extrabold">Administração</h1>
      <Card subtitle="Backup" title="Exportação de backup independente">
        <p className="mb-3 text-sm text-slate-400">
          O plano gratuito do Supabase pode não oferecer backups automáticos. Gere periodicamente um backup e guarde-o em local diferente do banco. O backup completo do banco
          (inclui usuários) deve ser feito com <code>pg_dump</code> — ver docs/BACKUP.md.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy === 'json'} onClick={() => backup('json')}>
            <DatabaseBackup className="h-4 w-4" /> Backup JSON (dados da aplicação)
          </Button>
          <Button variant="secondary" loading={busy === 'xlsx'} onClick={() => backup('xlsx')}>
            Backup XLSX
          </Button>
        </div>
      </Card>
      <Card subtitle="Acesso" title="Usuários da plataforma">
        <p className="mb-3 text-sm text-slate-400">
          Novos usuários se cadastram pela tela de login e não enxergam nada até serem incluídos em um projeto. Aqui você concede administração e permissão para criar projetos, ou
          desativa contas (bloqueia o acesso a todos os projetos).
        </p>
        <input className={inputCls + ' mb-3 max-w-sm'} placeholder="Buscar usuário…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar usuário" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Usuário</th>
                <th>Cadastro</th>
                <th className="text-center">Admin</th>
                <th className="text-center">Cria projetos</th>
                <th className="text-center">Ativo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="py-2">
                    <p className="text-white">{p.full_name || '—'}</p>
                    <p className="text-xs text-slate-500">{p.email}</p>
                  </td>
                  <td className="text-xs text-slate-400">{fmtDate(p.created_at)}</td>
                  {(['is_platform_admin', 'can_create_projects', 'active'] as const).map((f) => (
                    <td key={f} className="text-center">
                      <input type="checkbox" className="h-5 w-5 accent-teal-400" checked={p[f]} onChange={() => toggle(p, f)} aria-label={`${f} — ${p.email}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
