// Variáveis de build do NexoProcess (Vite expõe só as com prefixo VITE_).
interface ImportMetaEnv {
  readonly VITE_ROUTER?: string;
  readonly VITE_BASE?: string;
  /** "true" exige o e-mail da compra para usar /app (build de venda). */
  readonly VITE_LICENSE_REQUIRED?: string;
  /** Chave pública (JWK) que verifica o token de licença. */
  readonly VITE_LICENSE_PUBLIC_JWK?: string;
  /** Link de compra na Hotmart, mostrado na entrada e na landing. */
  readonly VITE_HOTMART_CHECKOUT_URL?: string;
}
