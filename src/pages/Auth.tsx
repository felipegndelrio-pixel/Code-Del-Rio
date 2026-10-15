import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { useAuth } from '../hooks/useAuth';
import { Button, Field, inputCls } from '../components/ui';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.25em] text-teal-brand">Gestão executiva</p>
        <h1 className="mb-6 mt-1 text-center text-2xl font-extrabold text-white">{title}</h1>
        <div className="rounded-2xl border border-teal-brand/25 bg-navy-850/80 p-5 shadow-glow">{children}</div>
      </div>
    </div>
  );
}

function Msg({ kind, text }: { kind: 'error' | 'ok'; text: string }) {
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={kind === 'error' ? 'text-sm text-red-300' : 'text-sm text-teal-200'}>
      {text}
    </p>
  );
}

export function Login() {
  const { session } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to={loc.state?.from ?? '/'} replace />;
  return (
    <Shell title="Entrar">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          setBusy(false);
          if (error) setErr(friendlyError(error));
          else nav(loc.state?.from ?? '/', { replace: true });
        }}
      >
        <Field label="E-mail" required>
          {(id) => <input id={id} type="email" autoComplete="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Senha" required>
          {(id) => (
            <input id={id} type="password" autoComplete="current-password" required className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        {err && <Msg kind="error" text={err} />}
        <Button type="submit" className="w-full" loading={busy}>
          Entrar
        </Button>
        <div className="flex justify-between text-xs">
          <Link to="/recuperar-senha" className="text-teal-200 hover:underline">
            Esqueci a senha
          </Link>
          <Link to="/cadastro" className="text-teal-200 hover:underline">
            Criar conta
          </Link>
        </div>
      </form>
    </Shell>
  );
}

export function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  return (
    <Shell title="Criar conta">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return setMsg({ kind: 'error', text: 'A senha deve ter ao menos 8 caracteres.' });
          setBusy(true);
          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/` },
          });
          setBusy(false);
          if (error) return setMsg({ kind: 'error', text: friendlyError(error) });
          if (data.session) nav('/', { replace: true });
          else setMsg({ kind: 'ok', text: 'Conta criada. Confirme o e-mail recebido para entrar. O acesso a projetos é concedido por um gerente ou administrador.' });
        }}
      >
        <Field label="Nome completo" required>
          {(id) => <input id={id} required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
        </Field>
        <Field label="E-mail" required>
          {(id) => <input id={id} type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />}
        </Field>
        <Field label="Senha" required hint="Mínimo de 8 caracteres.">
          {(id) => (
            <input id={id} type="password" required minLength={8} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          )}
        </Field>
        {msg && <Msg {...msg} />}
        <Button type="submit" className="w-full" loading={busy}>
          Criar conta
        </Button>
        <p className="text-center text-xs">
          <Link to="/entrar" className="text-teal-200 hover:underline">
            Já tenho conta
          </Link>
        </p>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Shell title="Recuperar acesso">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` });
          setBusy(false);
          // Mensagem neutra: não revela se o e-mail existe.
          setMsg(error ? { kind: 'error', text: friendlyError(error) } : { kind: 'ok', text: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.' });
        }}
      >
        <Field label="E-mail" required>
          {(id) => <input id={id} type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        {msg && <Msg {...msg} />}
        <Button type="submit" className="w-full" loading={busy}>
          Enviar link
        </Button>
        <p className="text-center text-xs">
          <Link to="/entrar" className="text-teal-200 hover:underline">
            Voltar
          </Link>
        </p>
      </form>
    </Shell>
  );
}

export function ResetPassword() {
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { signOut } = useAuth();
  const nav = useNavigate();
  if (!session)
    return (
      <Shell title="Redefinir senha">
        <p className="text-sm text-slate-300">Abra esta página pelo link recebido por e-mail. Links expiram após algum tempo.</p>
        <Link to="/recuperar-senha" className="mt-3 block text-sm text-teal-200 hover:underline">
          Solicitar novo link
        </Link>
      </Shell>
    );
  return (
    <Shell title="Nova senha">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return setMsg({ kind: 'error', text: 'Mínimo de 8 caracteres.' });
          setBusy(true);
          const { error } = await supabase.auth.updateUser({ password });
          setBusy(false);
          if (error) return setMsg({ kind: 'error', text: friendlyError(error) });
          await signOut();
          nav('/entrar', { replace: true });
        }}
      >
        <Field label="Nova senha" required>
          {(id) => <input id={id} type="password" minLength={8} required className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
        </Field>
        {msg && <Msg {...msg} />}
        <Button type="submit" className="w-full" loading={busy}>
          Salvar nova senha
        </Button>
      </form>
    </Shell>
  );
}
