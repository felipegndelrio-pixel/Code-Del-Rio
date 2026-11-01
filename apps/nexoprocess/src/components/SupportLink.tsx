import { COMMERCIAL } from '../config/brand';
import { useI18n } from '../i18n/I18nProvider';

/** "Fale com o suporte: email" quando o build tem e-mail de suporte; senão, nada. */
export function SupportLink({ prefix }: { prefix?: string }) {
  const { t } = useI18n();
  if (!COMMERCIAL.contactEmail) return null;
  return (
    <>
      {prefix ?? t('support.default')}{' '}
      <a className="font-semibold text-brand underline" href={`mailto:${COMMERCIAL.contactEmail}`}>
        {COMMERCIAL.contactEmail}
      </a>
    </>
  );
}
