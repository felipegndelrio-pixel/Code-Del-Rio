import { tr } from '../i18n';

// Marca e textos comerciais centralizados. "NexoProcess" é um codinome:
// troque aqui após a análise de marca registrada e domínio (ver docs/COMERCIALIZACAO.md).
export const BRAND = {
  name: 'NexoProcess',
  shortName: 'NexoProcess',
  get tagline() {
    return tr('d.brand.01');
  },
  colors: { navy: '#0d1c38', brand: '#00a8bc' },
  /** Versão exibida em relatórios e exportações. */
  version: '1.0.0',
} as const;

// CTA comercial configurável. Deixe `url` vazio para ocultar o botão.
// Não inclua preços, depoimentos ou números sem comprovação.
// O e-mail de suporte vem do build (VITE_SUPPORT_EMAIL); obrigatório no build de venda.
// `?.`: este arquivo também é lido pelo vite.config (Node), onde import.meta.env não existe.
export const COMMERCIAL = {
  get primaryCta() {
    return tr('d.brand.02');
  },
  secondaryCta: {
    get label() {
      return tr('d.brand.cta2');
    },
    url: '' as string,
  },
  contactEmail: (import.meta.env?.VITE_SUPPORT_EMAIL ?? '').trim(),
} as const;

// Identificação do controlador na Política de Privacidade. Vem do build:
// VITE_LEGAL_NAME (nome/razão social) e VITE_LEGAL_ID (CPF/CNPJ). Sem o CPF/CNPJ, o texto
// omite o número em vez de publicar um marcador. Vazio = texto genérico "o produtor".
export const LEGAL = {
  controller: (import.meta.env?.VITE_LEGAL_NAME ?? '').trim(),
  id: (import.meta.env?.VITE_LEGAL_ID ?? '').trim(),
} as const;

export const LANDING = {
  get heroTitle() {
    return tr('d.brand.03');
  },
  get heroSubtitle() {
    return BRAND.tagline;
  },
  steps: [
    {
      get title() {
    return tr('d.brand.04');
  },
      get text() {
    return tr('d.brand.13');
  },
    },
    {
      get title() {
    return tr('d.brand.05');
  },
      get text() {
    return tr('d.brand.14');
  },
    },
    {
      get title() {
    return tr('d.brand.06');
  },
      get text() {
    return tr('d.brand.15');
  },
    },
  ],
  features: [
    { get title() {
    return tr('d.brand.07');
  }, get text() {
    return tr('d.brand.16');
  } },
    { get title() {
    return tr('d.brand.08');
  }, get text() {
    return tr('d.brand.17');
  } },
    { get title() {
    return tr('d.brand.09');
  }, get text() {
    return tr('d.brand.18');
  } },
    { get title() {
    return tr('d.brand.10');
  }, get text() {
    return tr('d.brand.19');
  } },
    { get title() {
    return tr('d.brand.11');
  }, get text() {
    return tr('d.brand.20');
  } },
    { get title() {
    return tr('d.brand.12');
  }, get text() {
    return tr('d.brand.21');
  } },
  ],
} as const;
