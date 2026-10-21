import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, BarChart3, FileSpreadsheet, GitBranch, Lightbulb, Lock, Scale, ScrollText, Wand2 } from 'lucide-react';
import { BRAND, COMMERCIAL, LANDING } from '../config/brand';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/AppShell';
import { Button, useToast } from '../components/ui';
import { openDemo } from '../state/actions';
import { LICENSE } from '../license/config';
import { startDemo } from '../license/demo';

const FEATURE_ICONS = [GitBranch, BarChart3, Lightbulb, Scale, ScrollText, Lock];

export default function Landing() {
  const nav = useNavigate();
  const toast = useToast();
  const demo = async () => {
    try {
      const w = await openDemo();
      nav(`/app/p/${w.id}/visao-geral`);
    } catch {
      toast('bad', 'Não conseguimos abrir o exemplo neste navegador. Tente recarregar a página.');
    }
  };
  const tryDemo = async () => {
    startDemo();
    try {
      const w = await openDemo();
      nav(`/app/p/${w.id}/visao-geral`);
    } catch {
      toast('bad', 'Não conseguimos abrir a demonstração neste navegador. Tente recarregar a página.');
    }
  };
  return (
    <div className="min-h-screen">
      <header className="safe-top safe-x mx-auto flex h-16 max-w-6xl items-center gap-3">
        <Link to="/" className="mr-auto flex items-center gap-2 font-bold" aria-label={BRAND.name}>
          <Logo className="h-8 w-8" />
          <span>{BRAND.name}</span>
        </Link>
        <Link to="/app/ajuda" className="hidden text-sm font-semibold text-ink2 hover:text-ink sm:inline">
          Como funciona
        </Link>
        <ThemeToggle />
        <Button size="sm" onClick={() => nav('/app')}>
          Abrir o app
        </Button>
      </header>

      <main id="conteudo" className="safe-x mx-auto max-w-6xl pb-16">
        <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.1fr_.9fr] lg:py-16">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">Processos · BPMN · Lean · Plano de melhoria</p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              <span className="headline">{LANDING.heroTitle}</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ink2">{LANDING.heroSubtitle}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => nav('/app')}>
                {COMMERCIAL.primaryCta} <ArrowRight className="h-5 w-5" aria-hidden />
              </Button>
              <SecondaryCta onDemo={demo} onTryDemo={tryDemo} />
              {COMMERCIAL.secondaryCta.url && (
                <a href={COMMERCIAL.secondaryCta.url} className="inline-flex min-h-[52px] items-center rounded-xl px-4 font-semibold text-brand underline-offset-4 hover:underline" rel="noopener">
                  {COMMERCIAL.secondaryCta.label}
                </a>
              )}
            </div>
            <p className="mt-3 text-sm text-muted">
              {LICENSE.required ? 'Acesso com o e-mail usado na compra.' : 'Sem cadastro.'} Suas planilhas são lidas no navegador e ficam salvas só neste aparelho.
            </p>
          </div>
          <HeroVisual />
        </section>

        <section aria-labelledby="como" className="py-8">
          <h2 id="como" className="text-2xl font-bold">
            Como funciona, em 3 passos
          </h2>
          <ol className="mt-5 grid gap-4 md:grid-cols-3">
            {LANDING.steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line/15 bg-surface p-5 shadow-card">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 font-bold text-brand">{i + 1}</span>
                <h3 className="mt-3 font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-ink2">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="rotas" className="grid gap-4 py-8 md:grid-cols-2">
          <h2 id="rotas" className="sr-only">
            Duas formas de começar
          </h2>
          <div className="rounded-2xl border border-line/15 bg-surface p-6 shadow-card">
            <Wand2 className="h-7 w-7 text-accent" aria-hidden />
            <h3 className="mt-3 text-lg font-bold">Sem planilha</h3>
            <p className="mt-1 text-sm text-ink2">Um assistente faz perguntas simples: quais as etapas, o que acontece em cada uma, quanto tempo leva.</p>
            <Button className="mt-4" variant="secondary" onClick={() => nav('/app/novo')}>
              Começar sem planilha
            </Button>
          </div>
          <div className="rounded-2xl border border-line/15 bg-surface p-6 shadow-card">
            <FileSpreadsheet className="h-7 w-7 text-ok" aria-hidden />
            <h3 className="mt-3 text-lg font-bold">Com a sua planilha</h3>
            <p className="mt-1 text-sm text-ink2">Importe XLSX ou CSV. Reconhecemos colunas comuns em português e inglês e você confirma o mapeamento.</p>
            <Button className="mt-4" variant="secondary" onClick={() => nav('/app/importar')}>
              Importar minha planilha
            </Button>
          </div>
        </section>

        <section aria-labelledby="rec" className="py-8">
          <h2 id="rec" className="text-2xl font-bold">
            O que você recebe
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING.features.map((f, i) => {
              const Icon = FEATURE_ICONS[i];
              return (
                <li key={f.title} className="rounded-2xl border border-line/15 bg-surface p-5 shadow-card">
                  <Icon className="h-6 w-6 text-brand" aria-hidden />
                  <h3 className="mt-2 font-bold">{f.title}</h3>
                  <p className="mt-1 text-sm text-ink2">{f.text}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-brand/30 bg-surface p-6 text-center ">
          <h2 className="text-2xl font-bold">Seu processo. Seu mapa. Seus gargalos.</h2>
          <p className="mx-auto mt-2 max-w-xl text-ink2">{LICENSE.required ? 'Entre com o e-mail da compra e traga o seu processo agora.' : 'Explore a demonstração fictícia ou traga o seu processo agora.'}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => nav('/app')}>
              Começar agora
            </Button>
            <SecondaryCta onDemo={demo} onTryDemo={tryDemo} />
          </div>
        </section>
      </main>
      <footer className="safe-x safe-bottom mx-auto max-w-6xl border-t border-line/15 py-6 text-xs text-muted">
        <p>
          {BRAND.name} · versão {BRAND.version}. Diagramas renderizados com bpmn-js (bpmn.io). Não é afiliado ao PMI® nem a fornecedores de ferramentas de processos.
          {COMMERCIAL.contactEmail && (
            <>
              {' '}
              · <a href={`mailto:${COMMERCIAL.contactEmail}`}>{COMMERCIAL.contactEmail}</a>
            </>
          )}
        </p>
      </footer>
    </div>
  );
}

/** Ilustração vetorial própria (não é captura de tela nem dado real). */
function HeroVisual() {
  return (
    <figure className="rounded-3xl border border-line/15 bg-surface p-4 shadow-card" aria-label="Ilustração: mapa de processo com etapas, decisão e um gargalo destacado">
      <svg viewBox="0 0 420 260" className="h-auto w-full" role="img" aria-hidden>
        <defs>
          <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="rgb(var(--ink-2))" />
          </marker>
        </defs>
        <rect x="0" y="0" width="420" height="260" rx="18" fill="rgb(var(--surface-2))" opacity=".5" />
        <circle cx="34" cy="90" r="12" fill="none" stroke="rgb(var(--ok))" strokeWidth="3" />
        <line x1="46" y1="90" x2="70" y2="90" stroke="rgb(var(--ink-2))" strokeWidth="2" markerEnd="url(#ar)" />
        <rect x="72" y="66" width="86" height="48" rx="10" fill="rgb(var(--surface))" stroke="rgb(var(--accent))" strokeWidth="2" />
        <text x="115" y="94" textAnchor="middle" fontSize="11" fill="rgb(var(--ink))">Recebimento</text>
        <line x1="158" y1="90" x2="182" y2="90" stroke="rgb(var(--ink-2))" strokeWidth="2" markerEnd="url(#ar)" />
        <path d="M206 68l22 22-22 22-22-22z" fill="rgb(var(--surface))" stroke="rgb(var(--violet))" strokeWidth="2" />
        <text x="206" y="94" textAnchor="middle" fontSize="13" fontWeight="700" fill="rgb(var(--violet))">?</text>
        <line x1="228" y1="90" x2="256" y2="90" stroke="rgb(var(--ink-2))" strokeWidth="2" markerEnd="url(#ar)" />
        <text x="236" y="82" fontSize="9" fill="rgb(var(--ink-2))">Sim</text>
        <rect x="258" y="66" width="86" height="48" rx="10" fill="rgb(var(--surface))" stroke="rgb(var(--bad))" strokeWidth="3" />
        <text x="301" y="94" textAnchor="middle" fontSize="11" fill="rgb(var(--ink))">Separação</text>
        <rect x="270" y="52" width="62" height="18" rx="9" fill="rgb(var(--bad))" />
        <text x="301" y="64" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">GARGALO</text>
        <line x1="344" y1="90" x2="372" y2="90" stroke="rgb(var(--ink-2))" strokeWidth="2" markerEnd="url(#ar)" />
        <circle cx="386" cy="90" r="12" fill="none" stroke="rgb(var(--bad))" strokeWidth="4" />
        <path d="M206 112v38h52" fill="none" stroke="rgb(var(--amber))" strokeWidth="2" strokeDasharray="6 4" markerEnd="url(#ar)" />
        <text x="212" y="134" fontSize="9" fill="rgb(var(--ink-2))">Não</text>
        <rect x="260" y="128" width="86" height="44" rx="10" fill="rgb(var(--surface))" stroke="rgb(var(--amber))" strokeWidth="2" strokeDasharray="6 3" />
        <text x="303" y="154" textAnchor="middle" fontSize="11" fill="rgb(var(--ink))">Retrabalho</text>
        <g transform="translate(24 192)">
          <rect width="372" height="14" rx="7" fill="rgb(var(--surface))" />
          <rect width="150" height="14" rx="7" fill="#199e70" />
          <rect x="152" width="140" height="14" fill="#c98500" />
          <rect x="294" width="78" height="14" rx="7" fill="#d03b3b" />
          <text y="34" fontSize="10" fill="rgb(var(--ink-2))">Agrega valor · Necessário · Desperdício (ilustrativo)</text>
        </g>
      </svg>
    </figure>
  );
}

/**
 * Build aberto: demonstração fictícia completa. Build de venda: link de compra e a
 * versão Demo (navega no exemplo, sem salvar nem exportar).
 */
function SecondaryCta({ onDemo, onTryDemo }: { onDemo: () => void; onTryDemo: () => void }) {
  if (!LICENSE.required)
    return (
      <Button size="lg" variant="secondary" onClick={onDemo}>
        Ver demonstração fictícia
      </Button>
    );
  return (
    <>
      {LICENSE.checkoutUrl && (
        <a href={LICENSE.checkoutUrl} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-[52px] items-center rounded-xl border border-line/20 bg-surface px-5 font-semibold text-ink hover:border-line/40">
          Comprar na Hotmart
        </a>
      )}
      <Button size="lg" variant="ghost" onClick={onTryDemo}>
        Experimentar a versão Demo
      </Button>
    </>
  );
}
