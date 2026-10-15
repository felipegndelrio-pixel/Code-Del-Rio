import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';

/** Registra o service worker em qualquer página (inclusive login) e avisa sobre nova versão. */
export default function PwaUpdater() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[70] flex flex-wrap items-center justify-center gap-3 bg-cyan-900 px-4 py-2 text-sm text-cyan-50">
      Nova versão disponível.
      <Button variant="secondary" onClick={() => updateServiceWorker(true)}>
        Atualizar
      </Button>
    </div>
  );
}
