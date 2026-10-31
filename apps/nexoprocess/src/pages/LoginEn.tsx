// Entrada em inglês: e-mail + license key da Gumroad. Só esses dois vão ao servidor,
// que confere a chave na Gumroad; os dados dos processos continuam neste aparelho.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlayCircle, ShieldCheck } from 'lucide-react';
import { BRAND } from '../config/brand';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/AppShell';
import { Button, Callout, Field, Input } from '../components/ui';
import { SupportLink } from '../components/SupportLink';
import { useI18n } from '../i18n/I18nProvider';
import { activateGumroad, LICENSE } from '../license/config';
import { endDemo } from '../license/demo';

const linkCls = 'font-semibold text-brand underline';

export default function LoginEn({ volta, motivo, onDemo }: { volta: string; motivo: string | null; onDemo: () => void | Promise<void> }) {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; buy: boolean } | null>(null);
  const errRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errRef.current?.focus();
  }, [error]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await activateGumroad({ email, licenseKey: key }, locale);
    setBusy(false);
    if (r.ok) {
      endDemo();
      nav(volta, { replace: true });
    } else setError({ message: r.message, buy: r.reason === 'nao_encontrado' });
  };

  const legal = [
    { href: LICENSE.legalEn.terms, label: t('login.legal.terms') },
    { href: LICENSE.legalEn.privacy, label: t('login.legal.privacy') },
    { href: LICENSE.legalEn.refund, label: t('login.legal.refund') },
  ].filter((l) => l.href);

  return (
    <div className="min-h-screen" lang="en">
      <header className="safe-top safe-x mx-auto flex h-16 max-w-6xl items-center gap-3">
        <Link to="/" className="mr-auto flex items-center gap-2 font-bold" aria-label={`${BRAND.name} — home`}>
          <Logo className="h-8 w-8" />
          <span>{BRAND.name}</span>
        </Link>
        <ThemeToggle />
      </header>
      <main id="conteudo" className="safe-x mx-auto max-w-md pb-16 pt-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('login.title', { brand: BRAND.name })}</h1>
        <p className="mt-2 text-ink2">{t('login.gumroad.intro')}</p>

        {motivo === 'saiu' && (
          <div className="mt-4">
            <Callout tone="ok" title={t('login.signedOut.title')}>
              {t('login.signedOut.body')}
            </Callout>
          </div>
        )}
        {motivo === 'revogado' && (
          <div className="mt-4">
            <Callout tone="warn" title={t('login.revoked.title')}>
              {t('login.revoked.body')}
            </Callout>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-line/15 bg-surface p-5 shadow-card" noValidate>
          <Field label={t('login.email.label')} required>
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
          <Field label={t('login.key.label')} help={t('login.key.hint')} required>
            {(f) => (
              <Input
                {...f}
                type="text"
                name="license_key"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            )}
          </Field>
          {error && (
            <div id="entrar-erro" ref={errRef} tabIndex={-1} className="outline-none">
              <Callout tone="bad" title={error.message}>
                {error.buy && LICENSE.gumroadCheckoutUrl && (
                  <p>
                    {t('login.buy.prompt')}{' '}
                    <a className={linkCls} href={LICENSE.gumroadCheckoutUrl} rel="noopener noreferrer" target="_blank">
                      {t('login.buy.gumroad')}
                    </a>
                  </p>
                )}
              </Callout>
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={busy || !email.trim() || !key.trim()}>
            {t('login.submit')}
          </Button>
        </form>

        <div className="mt-4 rounded-2xl border border-dashed border-line/30 p-4">
          <p className="text-sm font-semibold text-ink">{t('login.demo.title')}</p>
          <p className="mt-1 text-sm text-ink2">{t('login.demo.body')}</p>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => void onDemo()}>
            <PlayCircle className="h-4 w-4" aria-hidden /> {t('login.demo.button')}
          </Button>
        </div>

        <p className="mt-4 flex items-start gap-2 text-sm text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t('login.privacy.note')}</span>
        </p>
        <p className="mt-2 text-sm text-ink2">
          <SupportLink prefix={t('login.support.prefix')} />
        </p>
        {legal.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {t('login.legal.prefix')}{' '}
            {legal.map((l, i) => (
              <span key={l.href}>
                {i > 0 && ' · '}
                <a href={l.href} className="underline" rel="noopener noreferrer">
                  {l.label}
                </a>
              </span>
            ))}
          </p>
        )}
        {LICENSE.gumroadCheckoutUrl && (
          <p className="mt-2 text-sm">
            {t('login.noAccess.prompt')}{' '}
            <a className={linkCls} href={LICENSE.gumroadCheckoutUrl} rel="noopener noreferrer" target="_blank">
              {t('login.buy.gumroad')}
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
