// Marca e textos comerciais centralizados. "NexoProcess" é um codinome:
// troque aqui após a análise de marca registrada e domínio (ver docs/COMERCIALIZACAO.md).
export const BRAND = {
  name: 'NexoProcess',
  shortName: 'NexoProcess',
  tagline:
    'Transforme uma planilha simples em um mapa visual do processo, encontre gargalos e receba um plano prático de melhoria — sem precisar saber BPMN ou Lean.',
  colors: { navy: '#070d1c', brand: '#22d3ee' },
  /** Versão exibida em relatórios e exportações. */
  version: '0.3.0',
} as const;

// CTA comercial configurável. Deixe `url` vazio para ocultar o botão.
// Não inclua preços, depoimentos ou números sem comprovação.
export const COMMERCIAL = {
  primaryCta: 'Começar agora',
  secondaryCta: { label: 'Fale com a gente', url: '' as string },
  contactEmail: '' as string,
} as const;

export const LANDING = {
  heroTitle: 'Do processo na planilha ao plano de melhoria.',
  heroSubtitle: BRAND.tagline,
  steps: [
    {
      title: 'Descreva o processo',
      text: 'Responda perguntas simples ou importe sua planilha (XLSX ou CSV). Não é preciso saber BPMN.',
    },
    {
      title: 'Veja o mapa e o diagnóstico',
      text: 'O fluxo é desenhado automaticamente. Tempo, esforço, desperdício e gargalos aparecem com a regra de cálculo à vista.',
    },
    {
      title: 'Planeje e meça a melhoria',
      text: 'Monte o cenário futuro, compare com o atual, gere o plano de ação e registre os resultados reais.',
    },
  ],
  features: [
    { title: 'Mapa navegável', text: 'Visão macro por etapas; clique para abrir atividades, decisões e retrabalho.' },
    { title: 'Diagnóstico Lean transparente', text: 'Agrega valor, necessário e desperdício, com base de cálculo explícita.' },
    { title: 'Recomendações rastreáveis', text: 'Cada sugestão mostra a evidência, a regra e a hipótese a validar.' },
    { title: 'Atual × Futuro', text: 'Compare tempo, esforço, custo e capacidade. Estimativa nunca vira “economia realizada”.' },
    { title: 'Relatório executivo', text: 'PDF pela impressão do navegador, BPMN 2.0 XML, SVG/PNG, XLSX e CSV.' },
    { title: 'Seus dados ficam no aparelho', text: 'Planilhas são lidas no navegador. Nada é enviado a servidores por padrão.' },
  ],
} as const;
