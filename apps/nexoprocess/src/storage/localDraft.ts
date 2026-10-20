// Cópia síncrona de rascunhos no localStorage. O IndexedDB grava com atraso
// (debounce); esta cópia é escrita a cada alteração e garante que um recarregamento
// no meio da digitação não perca nada. Fica só neste aparelho, como o resto.
const PREFIX = 'nexo.draft.';

export const localDraft = {
  read<T>(key: string): T | undefined {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  },
  write(key: string, value: unknown) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* cota cheia ou armazenamento bloqueado: o IndexedDB continua valendo */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* nada a remover */
    }
  },
};
