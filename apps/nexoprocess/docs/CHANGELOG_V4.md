# NexoProcess — o que mudou na V4

A V4 evolui a V3 no mesmo código, sem remover funcionalidades. O formulário único da V3 continua em `/app/novo/formulario`.

## Experiência
- **Identidade visual própria:** base clara neutra, estrutura em azul-marinho (#173263), um acento ciano (#006474 em texto, #00A8BC em marcas), IBM Plex Sans/Mono servidas localmente (licença OFL), raios e sombras contidos, tema escuro grafite. Tokens centralizados em `src/styles/index.css` e `tailwind.config.js`.
- **Navegação por jornada:** barra lateral por fases (Projeto, Levantamento, Análise, Melhoria, Análises complementares, Saídas) com o estado real de cada etapa; no celular, barra inferior com 5 atalhos + “Etapas”.
- **Cabeçalho de etapa:** objetivo, dados obrigatórios/recomendados/opcionais com status real e próxima etapa recomendada.
- **Visão geral do projeto:** próxima ação, andamento, números com origem (informado/calculado/estimado), pendências de dados, resumo da melhoria e da execução.
- **Início que muda com o estado:** sem projetos → como começar; com projetos → lista com busca, filtro, andamento e “Continuar: próxima etapa”.
- **Desfazer** (botão e Ctrl/⌘+Z, até 30 passos) e indicador de salvamento com nova tentativa em caso de falha.
- **Assistente conversacional estruturado** (mobile-first): respostas rápidas, “Não sei” (nunca vira zero), texto livre → lista para confirmar, tempo e responsável extraídos do texto, correção pelo resumo, rascunho retomado.
- **Continuidade entre aparelhos sem sincronização:** “Gerar arquivo do projeto” (compartilhar ou baixar) e “Importar projeto”.
- **Offline honesto:** aviso “Offline — seus dados continuam disponíveis”.

## Decisão
- Motivo de atividades **necessárias** e painel de **revisão da classificação Lean** no diagnóstico.
- Recomendações com **impacto, dependências, informações ausentes** e alerta para atividades exigidas.
- **Casos conservador / base / otimista** com premissas editáveis; **responsabilidades alteradas** e carga por responsável.
- Plano de ação com **problema relacionado** e **registro de conclusão obrigatório** (resultado observado + data).
- **Demonstração coerente** até o plano: recomendações aceitas → mudanças do TO-BE ligadas a elas → 4 ações com responsável e prazo (todas fictícias e rotuladas).

## Qualidade
- E2E nas larguras 1440, 768, 390 (perfil iPhone em Chromium), 320 e Android (Pixel 7).
- axe-core com regras WCAG 2.0/2.1/2.2 A/AA em 19 telas, nos dois temas.
- Desempenho **medido** (`scripts/perf.mjs`, resultado em `docs/desempenho-medido.json`).
