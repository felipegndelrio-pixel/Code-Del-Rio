import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { updateRow } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { useAuth } from '../hooks/useAuth';
import { Button, Card, Field, inputCls, useToast } from '../components/ui';

export default function Profile() {
  const { profile, refreshProfile, session } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [area, setArea] = useState(profile?.area ?? '');
  const [pwd, setPwd] = useState('');
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="headline text-2xl font-extrabold">Meu perfil</h1>
      <Card title="Dados">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await updateRow(supabase, 'profiles', session!.user.id, { full_name: name.trim(), area: area.trim() || null });
              await refreshProfile();
              toast('ok', 'Perfil atualizado');
            } catch (err) {
              toast('error', (err as Error).message);
            }
          }}
        >
          <p className="text-sm text-slate-400">{profile?.email}</p>
          <Field label="Nome completo" required>
            {(id) => <input id={id} className={inputCls} value={name} required onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Área">{(id) => <input id={id} className={inputCls} value={area} onChange={(e) => setArea(e.target.value)} />}</Field>
          <Button type="submit">Salvar</Button>
        </form>
      </Card>
      <Card title="Alterar senha">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pwd.length < 8) return toast('error', 'Mínimo de 8 caracteres.');
            const { error } = await supabase.auth.updateUser({ password: pwd });
            if (error) return toast('error', friendlyError(error));
            setPwd('');
            toast('ok', 'Senha alterada');
          }}
        >
          <Field label="Nova senha">
            {(id) => <input id={id} type="password" minLength={8} className={inputCls} value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />}
          </Field>
          <Button type="submit" variant="secondary">
            Alterar senha
          </Button>
        </form>
      </Card>
    </div>
  );
}
