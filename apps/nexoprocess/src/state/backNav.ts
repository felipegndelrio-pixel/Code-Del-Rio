// "Voltar" do celular (botão físico ou gesto) volta uma etapa da tela em vez de
// sair dela — ou de fechar o PWA. Enquanto houver para onde voltar dentro da tela,
// mantemos uma entrada extra no histórico (mesma URL, state marcado); o "voltar"
// do sistema consome essa entrada e vira um passo para trás.
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

const MARK = 'nexoBack';

/**
 * @param id      identifica quem marcou a entrada (várias telas/painéis podem usar o gancho)
 * @param active  há um passo anterior dentro da tela
 * @param onBack  volta um passo (o mesmo que o botão "Voltar" da tela)
 * @param stepKey muda a cada passo, para remarcar o histórico depois de voltar
 */
export function useHardwareBack(id: string, active: boolean, onBack: () => void, stepKey = '') {
  const loc = useLocation();
  const nav = useNavigate();
  const type = useNavigationType();
  const armed = useRef(false);
  const awaiting = useRef(false);
  const cb = useRef(onBack);
  useEffect(() => {
    cb.current = onBack;
  });

  useEffect(() => {
    const marked = (loc.state as Record<string, unknown> | null)?.[MARK] === id;
    if (marked) {
      awaiting.current = false;
      if (active) armed.current = true;
      else {
        // Não há mais passo anterior (ex.: painel fechado pelo botão): remove a entrada extra.
        armed.current = false;
        nav(-1);
      }
      return;
    }
    if (awaiting.current) return; // a marcação ainda não chegou
    if (armed.current) {
      armed.current = false;
      if (type === 'POP') {
        cb.current();
        return;
      }
    }
    if (active) {
      armed.current = true;
      awaiting.current = true;
      nav({ pathname: loc.pathname, search: loc.search, hash: loc.hash }, { state: { ...((loc.state as object | null) ?? {}), [MARK]: id } });
    }
  }, [id, active, stepKey, loc, nav, type]);
}

/** Há uma página anterior do próprio app no histórico (React Router guarda o índice). */
export const hasAppHistory = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
