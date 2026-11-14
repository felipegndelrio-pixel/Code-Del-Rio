// Entrada pela Paddle (EN), opcional: só é montada quando as variáveis VITE_PADDLE_* do build existem.
// Recebe o id da transação e o e-mail do retorno do checkout pelo FRAGMENTO da URL (#txn=…&email=…), que não
// vai ao servidor nem ao Referer; o fragmento é apagado da barra de endereços assim que é lido.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Field, Input } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { activatePaddle, activatePaddleWithRetry } from '../license/config';
import { looksLikeGumroadLicenseKey } from '../license/credential-kind';
import { endDemo } from '../license/demo';

/** Lê e remove o fragmento do retorno do checkout. Valores fora do formato são descartados. */
export function takeReturnParams(): { txn: string; email: string } {
  let txn = '';
  let email = '';
  try {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const t = (h.get('txn') ?? '').trim().toLowerCase();
    const e = (h.get('email') ?? '').trim();
    if (/^txn_[a-z0-9]{26}$/.test(t)) txn = t;
    if (e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) email = e;
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    /* sem acesso à URL */
  }
  return { txn, email };
}

export default function PaddleEntryEn({
  volta,
  prefill,
  onGumroadKey,
}: {
  volta: string;
  /** Vindo do formulário da Gumroad: e-mail e id da transação já digitados (um novo valor de `n` refaz o preenchimento e foca o bloco). */
  prefill?: { email: string; txn: string; n: number };
  /** Chamado (sem rede) quando o campo do id tem formato de license key da Gumroad. */
  onGumroadKey?: (email: string, key: string) => void;
}) {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [txn, setTxn] = useState('');
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);

  const run = async (e: string, id: string, retry: boolean) => {
    setError(null);
    setBusy(true);
    const body = { email: e, transactionId: id };
    const r = retry ? await activatePaddleWithRetry(body, locale, { onWait: () => setFinishing(true) }) : await activatePaddle(body, locale);
    setBusy(false);
    setFinishing(false);
    if (r.ok) {
      endDemo();
      nav(volta, { replace: true });
    } else setError(r.message);
  };

  useEffect(() => {
    // Retorno do checkout: e-mail e transação chegam preenchidos e a ativação começa sozinha (com espera pelo webhook).
    if (started.current) return;
    started.current = true;
    const r = takeReturnParams();
    if (r.txn) setTxn(r.txn);
    if (r.email) setEmail(r.email);
    if (r.txn && r.email) void run(r.email, r.txn, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) errRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.email) setEmail(prefill.email);
    setTxn(prefill.txn);
    setError(null);
    // Depois do foco do aviso do formulário da Gumroad (efeito do pai roda depois do deste filho): leva o leitor ao bloco da Paddle.
    const id = window.setTimeout(() => {
      sectionRef.current?.scrollIntoView?.({ block: 'center' });
      sectionRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [prefill?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    // License key da Gumroad no campo do id da transação: não chama a API; leva ao formulário da Gumroad.
    if (looksLikeGumroadLicenseKey(txn)) {
      setError(t('paddle.error.isGumroad'));
      onGumroadKey?.(email.trim(), txn.trim());
      return;
    }
    void run(email, txn, false);
  };

  return (
    <section ref={sectionRef} id="paddle-entry" tabIndex={-1} aria-labelledby="paddle-title" className="mt-6 rounded-2xl border border-line/15 bg-surface p-5 shadow-card outline-none">
      <h2 id="paddle-title" className="text-lg font-bold">
        {t('paddle.title')}
      </h2>
      <p className="mt-1 text-sm text-ink2">{t('paddle.intro')}</p>
      {finishing && (
        <div className="mt-3" role="status" aria-live="polite">
          <Callout tone="ok" title={t('paddle.finishing')}>
            {t('paddle.finishing.body')}
          </Callout>
        </div>
      )}
      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <Field label={t('login.email.label')} required>
          {(f) => <Input {...f} type="email" name="paddle_email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t('paddle.txn.label')} help={t('paddle.txn.hint')} required>
          {(f) => (
            <Input {...f} type="text" name="paddle_transaction_id" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={txn} onChange={(e) => setTxn(e.target.value)} />
          )}
        </Field>
        {error && (
          <div ref={errRef} tabIndex={-1} className="outline-none">
            <Callout tone="bad" title={error} />
          </div>
        )}
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={busy || !email.trim() || !txn.trim()}>
          {t('paddle.submit')}
        </Button>
      </form>
    </section>
  );
}
