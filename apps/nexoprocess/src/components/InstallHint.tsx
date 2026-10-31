// Convite para instalar o app: no iPhone, protege os dados da limpeza automática do
// Safari; no Android e no desktop, abre o app em janela própria e funciona offline.
import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { isIos, isStandalone, useInstall } from '../state/install';
import { isDemo } from '../license/demo';
import { Button } from './ui';
import { useI18n } from '../i18n/I18nProvider';

const KEY = 'nexo.dica.instalar';

export default function InstallHint() {
  const { t } = useI18n();
  const { canPrompt, prompt } = useInstall();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || isStandalone() || isDemo()) return null;
  const ios = isIos();
  if (!ios && !canPrompt) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ok */
    }
    setHidden(true);
  };
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm" data-testid="install-hint">
      {ios ? <Share className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden /> : <Download className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />}
      <div className="min-w-0 flex-1 space-y-2 text-ink2">
        {ios ? (
          <>
            <p>
              <strong className="text-ink">{t('install.ios.lead')}</strong>
              {t('install.ios.a')}
              <em>{t('install.ios.share')}</em>
              {t('install.ios.arrow')}
              <em>{t('install.ios.add')}</em>
              {t('install.ios.b')}
            </p>
            <p className="text-xs">{t('install.ios.note')}</p>
          </>
        ) : (
          <>
            <p>
              <strong className="text-ink">{t('install.other.lead')}</strong>
              {t('install.other.rest')}
            </p>
            <Button size="sm" onClick={() => void prompt()}>
              <Download className="h-4 w-4" aria-hidden /> {t('install.button')}
            </Button>
          </>
        )}
      </div>
      <button type="button" aria-label={t('install.dismiss')} onClick={close} className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:text-ink">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
