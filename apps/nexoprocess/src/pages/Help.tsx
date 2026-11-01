import { Link } from 'react-router-dom';
import { Card, Callout } from '../components/ui';
import { BRAND, COMMERCIAL } from '../config/brand';
import { GLOSSARY } from '../config/glossary';
import { fieldHelp, fieldLabel, FIELDS } from '../io/fields';
import { useI18n } from '../i18n/I18nProvider';
import { BackButton } from '../components/BackButton';
import { SupportLink } from '../components/SupportLink';
import { LICENSE } from '../license/config';

export default function Help() {
  const { t: tx } = useI18n();
  return (
    <div className="safe-x mx-auto max-w-4xl space-y-5 py-6">
      <div>
        <BackButton />
        <h1 className="text-2xl font-bold">{tx('hp.title')}</h1>
      </div>

      <Card title={tx('hp.how')} subtitle={tx('hp.how.sub')}>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink2">
          <li>{tx('hp.s1')}</li>
          <li>{tx('hp.s2')}</li>
          <li>{tx('hp.s3')}</li>
          <li>{tx('hp.s4')}</li>
          <li>{tx('hp.s5')}</li>
          <li>{tx('hp.s6')}</li>
          <li>{tx('hp.s7')}</li>
          <li>{tx('hp.s8')}</li>
        </ol>
      </Card>

      <Card title={tx('hp.gloss')} subtitle={tx('hp.gloss.sub')}>
        <dl className="grid gap-3 sm:grid-cols-2">
          {Object.values(GLOSSARY).map((g) => (
            <div key={g.term}>
              <dt className="font-semibold text-ink">{g.term}</dt>
              <dd className="text-sm text-ink2">{g.text}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={tx('hp.calc')} subtitle={tx('hp.calc.sub')}>
        <ul className="space-y-2 text-sm text-ink2">
          <li><strong className="text-ink">{tx('hp.f1.b')}</strong>{tx('hp.f1.r')}</li>
          <li><strong className="text-ink">{tx('hp.f2.b')}</strong>{tx('hp.f2.r')}</li>
          <li><strong className="text-ink">{tx('hp.f3.b')}</strong>{tx('hp.f3.r')}</li>
          <li><strong className="text-ink">{tx('hp.f4.b')}</strong>{tx('hp.f4.r')}</li>
          <li><strong className="text-ink">{tx('hp.f5.b')}</strong>{tx('hp.f5.r')}</li>
          <li><strong className="text-ink">{tx('hp.f6.b')}</strong>{tx('hp.f6.r')}</li>
          <li><strong className="text-ink">{tx('hp.f7.b1')}</strong> ≠ <strong className="text-ink">{tx('hp.f7.b2')}</strong>{tx('hp.f7.r')}</li>
          <li><strong className="text-ink">{tx('hp.f8.b')}</strong>{tx('hp.f8.r')}</li>
          <li><strong className="text-ink">{tx('hp.f9.b1')}</strong>{tx('hp.f9.r1')} <strong className="text-ink">{tx('hp.f9.b2')}</strong>{tx('hp.f9.r2')} <strong className="text-ink">{tx('hp.f9.b3')}</strong>{tx('hp.f9.r3')}</li>
          <li><strong className="text-ink">Payback</strong>{tx('hp.f10.r1')} <strong className="text-ink">ROI</strong>{tx('hp.f10.r2')}</li>
          <li><strong className="text-ink">{tx('hp.f11.b')}</strong>{tx('hp.f11.r')} &gt; 0.</li>
          <li><strong className="text-ink">{tx('hp.f12.b')}</strong>{tx('hp.f12.r')}</li>
        </ul>
        <p className="mt-3 text-xs text-muted">{tx('hp.calc.note')}</p>
      </Card>

      <Card title={tx('hp.fields')} subtitle={tx('hp.fields.sub')}>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {FIELDS.map((f) => (
            <li key={f.key}>
              <strong className="text-ink">{fieldLabel(f)}</strong> {f.minimal && <span className="text-xs text-brand">({tx('hp.min')})</span>}
              <br />
              <span className="text-ink2">{fieldHelp(f)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={tx('hp.priv')} subtitle={tx('hp.priv.sub')} id="privacidade">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
          <li>{tx('hp.p1')}</li>
          <li>{tx('hp.p2')}</li>
          <li>{tx('hp.p3')}</li>
          {LICENSE.required ? (
            <li>
              {tx('hp.access')}
            </li>
          ) : (
            <li>{tx('hp.nomember')}</li>
          )}
          <li>{tx('hp.notrack')}</li>
          <li>{tx('hp.clear')}</li>
          <li>{tx('hp.erase')}</li>
        </ul>
        <p className="mt-3 text-sm">
          {tx('hp.docs')}{' '}
          <Link to="/privacidade" className="font-semibold text-accent underline">
            {tx('hp.privacy')}
          </Link>{' '}
          ·{' '}
          <Link to="/termos" className="font-semibold text-accent underline">
            {tx('hp.terms')}
          </Link>
        </p>
      </Card>

      {COMMERCIAL.contactEmail && (
        <Card title={tx('hp.support')} subtitle={tx('hp.support.sub')} id="suporte">
          <p className="text-sm text-ink2">
            <SupportLink prefix={tx('hp.support.prefix')} />. {tx('hp.support.rest')}
          </p>
        </Card>
      )}

      <Card title={tx('hp.ai')} subtitle={tx('hp.ai.sub')}>
        <p className="text-sm text-ink2">
          {tx('hp.ai.a')}<strong>{tx('hp.ai.b')}</strong>{tx('hp.ai.c')}
        </p>
      </Card>

      <Callout tone="info">
        {tx('hp.disclaimer', { brand: BRAND.name })}{' '}
        <Link to="/app" className="font-semibold text-brand">
          {tx('hp.back')}
        </Link>
      </Callout>
    </div>
  );
}
