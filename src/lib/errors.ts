// Tradução de erros do Supabase/PostgREST/rede para mensagens acionáveis.
export interface AppErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
  name?: string;
}

export function friendlyError(err: unknown): string {
  if (!err) return 'Erro desconhecido';
  const e = err as AppErrorLike;
  const msg = e.message ?? String(err);
  if (
    e.name === 'TypeError' ||
    /Failed to fetch|NetworkError|fetch failed|Load failed|ECONNREFUSED|network/i.test(msg) ||
    e.status === 503 ||
    e.status === 502 ||
    e.status === 0
  ) {
    return 'Serviço indisponível ou sem conexão. Verifique sua internet e tente novamente; nada foi gravado.';
  }
  switch (e.code) {
    case '42501':
      return `Sem permissão para esta operação. ${msg.includes('permission denied') || msg.includes('row-level security') ? '' : msg}`.trim();
    case '23505':
      return 'Registro duplicado: já existe um item com esse identificador.';
    case '23503':
      return 'Referência inválida: o item relacionado não existe ou não pode ser removido porque possui vínculos.';
    case '23514':
      return `Regra de validação não atendida. ${msg}`;
    case '23502':
      return 'Campo obrigatório não preenchido.';
    case '22P02':
    case '22007':
    case '22008':
      return 'Formato de dado inválido (verifique datas e números).';
    case 'PGRST301':
    case 'PGRST303':
      return 'Sessão expirada. Entre novamente.';
    case 'PGRST116':
      return 'Registro não encontrado ou sem acesso.';
  }
  if (/row-level security/i.test(msg)) return 'Sem permissão para esta operação.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.';
  if (/Email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  if (/User already registered/i.test(msg)) return 'Este e-mail já possui conta.';
  if (/Password should be/i.test(msg)) return 'Senha fraca: use ao menos 8 caracteres.';
  return msg;
}
