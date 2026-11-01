import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui';
import { useI18n } from '../i18n/I18nProvider';

/** Avisa quando há nova versão do app (os dados locais não são afetados). */
export default function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const { t } = useI18n();
  if (!needRefresh) return null;
  return (
    <div role="status" className="no-print fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[55] lg:bottom-4 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-2xl border border-brand/40 bg-surface p-3 text-sm shadow-card">
      <RefreshCw className="h-5 w-5 shrink-0 text-brand" aria-hidden />
      <span className="flex-1 text-ink2">{t('pwa.new')}</span>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        {t('pwa.later')}
      </Button>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        {t('pwa.update')}
      </Button>
    </div>
  );
}
