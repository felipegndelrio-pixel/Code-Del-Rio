// Variáveis de build do NexoProcess (Vite expõe só as com prefixo VITE_).
interface ImportMetaEnv {
  readonly VITE_ROUTER?: string;
  readonly VITE_BASE?: string;
  /** Git commit SHA injected by the sale build script and exposed in index.html. */
  readonly VITE_BUILD_ID?: string;
  /** "true" exige o e-mail da compra para usar /app (build de venda). */
  readonly VITE_LICENSE_REQUIRED?: string;
  /** Chave pública (JWK) que verifica o token de licença. */
  readonly VITE_LICENSE_PUBLIC_JWK?: string;
  /** Link de compra na Hotmart, mostrado na entrada e na landing. */
  readonly VITE_HOTMART_CHECKOUT_URL?: string;
  /** E-mail de suporte exibido ao comprador (entrada, ajuda, erros, rodapé). */
  readonly VITE_SUPPORT_EMAIL?: string;
  /** Link de compra na Gumroad (entrada EN). */
  readonly VITE_GUMROAD_CHECKOUT_URL?: string;
  /** Páginas legais EN (landing EN). Vazio = link não aparece. */
  readonly VITE_EN_TERMS_URL?: string;
  readonly VITE_EN_PRIVACY_URL?: string;
  readonly VITE_EN_REFUND_URL?: string;
}
