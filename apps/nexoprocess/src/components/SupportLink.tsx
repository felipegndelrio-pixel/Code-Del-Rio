import { COMMERCIAL } from '../config/brand';

/** "Fale com o suporte: email" quando o build tem e-mail de suporte; senão, nada. */
export function SupportLink({ prefix = 'Precisa de ajuda? Escreva para' }: { prefix?: string }) {
  if (!COMMERCIAL.contactEmail) return null;
  return (
    <>
      {prefix}{' '}
      <a className="font-semibold text-brand underline" href={`mailto:${COMMERCIAL.contactEmail}`}>
        {COMMERCIAL.contactEmail}
      </a>
    </>
  );
}
