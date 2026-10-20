// Entrada com o e-mail usado na compra (Hotmart). Só o e-mail vai ao servidor;
// os dados dos processos continuam neste aparelho.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { BRAND } from '../config/brand';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/AppShell';
import { Button, Callout, Field, Input } from '../components/ui';
import { activate, currentLicense, LICENSE } from '../license/config';

/** Só volta para rotas internas do app (evita redirecionamento aberto). */
const safeReturn = (v: string | null) => (v && /^\/app(\/|$|\?)/.test(v) && !v.startsWith('//') ? v : '/app');

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const volta = safeReturn(params.get('volta'));
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; buy: boolean } | null>(null);
  const errRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Já tem acesso válido neste aparelho: segue direto.
    void currentLicense().then((lic) => lic && nav(volta, { replace: true }));
  }, [nav, volta]);

  useEffect(() => {
    if (error) errRef.current?.focus();
  }, [error]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await activate({ email });
    setBusy(false);
    if (r.ok) nav(volta, { replace: true });
    else setError({ message: r.message, buy: r.reason === 'nao_encontrado' });
  };

  return (
    <div className="min-h-screen">
      <header className="safe-top safe-x mx-auto flex h-16 max-w-6xl items-center gap-3">
        <Link to="/" className="mr-auto flex items-center gap-2 font-bold" aria-label={`${BRAND.name} — página inicial`}>
          <Logo className="h-8 w-8" />
          <span>{BRAND.name}</span>
        </Link>
        <ThemeToggle />
      </header>
      <main id="conteudo" className="safe-x mx-auto max-w-md pb-16 pt-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Entrar no {BRAND.name}</h1>
        <p className="mt-2 text-ink2">Use o e-mail com que você comprou na Hotmart. Na primeira vez é preciso estar conectado; depois o app funciona offline.</p>

        {params.get('motivo') === 'revogado' && (
          <div className="mt-4">
            <Callout tone="warn" title="Acesso encerrado neste aparelho">
              A compra deste e-mail não está mais ativa (por exemplo, após reembolso). Se for um engano, fale com o suporte.
            </Callout>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-line/15 bg-surface p-5 shadow-card" noValidate>
          <Field label="E-mail da compra" required>
            {(f) => (
              <Input
                {...f}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'entrar-erro' : f['aria-describedby']}
              />
            )}
          </Field>
          {error && (
            <div id="entrar-erro" ref={errRef} tabIndex={-1} className="outline-none">
              <Callout tone="bad" title={error.message}>
                {error.buy && LICENSE.checkoutUrl && (
                  <p>
                    Ainda não comprou?{' '}
                    <a className="font-semibold text-brand underline" href={LICENSE.checkoutUrl} rel="noopener noreferrer" target="_blank">
                      Comprar na Hotmart
                    </a>
                    .
                  </p>
                )}
              </Callout>
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={busy || !email.trim()}>
            Entrar
          </Button>
        </form>

        <p className="mt-4 flex items-start gap-2 text-sm text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Só o e-mail é conferido no servidor. Suas planilhas e processos ficam salvos apenas neste aparelho.
        </p>
        {LICENSE.checkoutUrl && (
          <p className="mt-2 text-sm">
            Ainda não tem acesso?{' '}
            <a className="font-semibold text-brand underline" href={LICENSE.checkoutUrl} rel="noopener noreferrer" target="_blank">
              Comprar na Hotmart
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
