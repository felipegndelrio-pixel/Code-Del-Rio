// Instalação como app (PWA) e proteção dos dados locais.
// - Android/desktop (Chrome, Edge, Samsung Internet): o navegador oferece o evento
//   beforeinstallprompt; guardamos para um botão "Instalar o app".
// - iPhone/iPad: não há evento; a instalação é Compartilhar → Adicionar à Tela de Início.
//   Instalado, o app fica fora da limpeza automática do Safari para sites pouco abertos.
import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // nós mostramos o botão no lugar certo
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const isIos = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isStandalone = () => typeof window !== 'undefined' && ((navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true);

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return {
    canPrompt: !!deferred,
    prompt: async () => {
      const e = deferred;
      if (!e) return;
      deferred = null;
      await e.prompt();
      listeners.forEach((l) => l());
    },
  };
}

/**
 * Pede ao navegador para não apagar os dados do app sozinho (armazenamento persistente).
 * Chamado quando a pessoa cria um projeto — momento em que um eventual pedido de
 * permissão (Firefox) faz sentido. Sem suporte, não faz nada.
 */
export function askPersistentStorage() {
  try {
    const s = navigator.storage;
    if (!s?.persist || !s.persisted) return;
    void s
      .persisted()
      .then((already) => (already ? true : s.persist()))
      .catch(() => {});
  } catch {
    /* navegador sem a Storage API */
  }
}
