# Compatibilidade — desktop, iOS, Android e navegadores

## Versões mínimas

Definidas em `vite.config.ts` (`build.target`). Abaixo delas, `public/theme-init.js` mostra o aviso **"Atualize o navegador para usar o NexoProcess"** no lugar de uma tela branca (testado em `tests/e2e/compat.spec.ts`).

| Plataforma | Navegador | Mínimo | Instalação como app (PWA) |
|---|---|---|---|
| Windows / macOS / Linux | Chrome, Edge | 107 | Sim (ícone de instalar na barra de endereço ou botão **Instalar o app** em Meus projetos) |
| Windows / macOS / Linux | Firefox | 104 | Não instala como app; funciona no navegador |
| macOS | Safari | 16 | Safari 17+: Arquivo → Adicionar ao Dock |
| iPhone / iPad | Safari (e todos os navegadores do iOS, que usam o mesmo motor) | iOS 16 | Compartilhar → **Adicionar à Tela de Início** (o app mostra o passo a passo) |
| Android | Chrome, Edge, Samsung Internet | Chrome 107 | Menu → **Instalar app** (ou botão **Instalar o app**) |

Auditoria do código gerado (21/10/2026): nenhuma API fora desses mínimos (`requestIdleCallback`, `Object.groupBy`, regex lookbehind e similares não aparecem). O CSS leva prefixo `-webkit-` onde o Safari exige.

## O que é testado automaticamente (a cada release)

Motor **Chromium** (o único disponível no ambiente de testes), em: desktop 1366/1440/1024 px, tablet 768 px, iPhone 13 (390 px, emulado), Android Pixel 7 (emulado) e 320 px. Cobre jornada completa, assistente, voltar do sistema, auto-save, plano (PDF/CSV/importação), tour, modo demo, acesso pela compra, offline/PWA, acessibilidade (axe), CSP e ausência de rolagem horizontal.

> **Emulação não é o aparelho real.** O motor do Safari (WebKit) e o do Firefox (Gecko) **não foram executados**. Por isso a lista abaixo é obrigatória antes de vender.

## Ajustes específicos de plataforma já feitos

| Problema | Onde aparece | Correção |
|---|---|---|
| Zoom automático ao tocar em campos com fonte < 16px | Safari do iPhone/iPad | Campos com 16px em telas de toque (`@media (pointer: coarse)`); teste `mobile-compat.spec.ts` |
| Painel inferior cortado pelas barras do navegador | Safari/Chrome no celular | Altura em `dvh` com reserva em `vh` (`.np-sheet-h`, `.np-dialog-h`) |
| Safari apaga dados de sites pouco abertos (sem uso por 7 dias, se não instalado) | Safari iOS/macOS | Convite para **Adicionar à Tela de Início** no iPhone; pedido de armazenamento persistente ao criar o primeiro projeto; backup em Meus projetos |
| Botão/gesto Voltar fechava o app | Android (e iOS com gesto) | Voltar = uma etapa para trás no assistente, formulário, importação e painéis |
| Barra de status sobre o conteúdo | iPhone com app instalado | `viewport-fit=cover` + margens de área segura |

## Validação manual em aparelhos reais (TO VALIDATE — fazer antes de vender)

Use o endereço publicado do **build de venda**. Marque cada item em cada aparelho.

| # | Teste | iPhone (Safari) | iPhone (app na Tela de Início) | Android (Chrome) | Android (app instalado) | Windows (Chrome/Edge) | Windows/Mac (Firefox) | Mac (Safari) |
|---|---|---|---|---|---|---|---|---|
| 1 | `/app` leva para `/entrar`; entrar com e-mail de compra de teste | | | | | | | |
| 2 | "Experimentar a versão Demo": faixa de demonstração, tour no Plano, "Exportar PDF" mostra o aviso de compra | | | | | | | |
| 3 | Assistente completo; tocar nos campos **não** dá zoom | | | | | | | |
| 4 | Voltar do sistema (gesto/botão) volta uma pergunta | | | | | | | |
| 5 | Recarregar no meio do assistente mantém as respostas | | | | | | | |
| 6 | Plano → **Exportar PDF** abre a impressão e gera o PDF | | | | | | | |
| 7 | Plano → **Exportar planilha (CSV)** baixa/abre o arquivo no Excel ou Numbers | | | | | | | |
| 8 | Plano → **Importar planilha (CSV)** a partir de Arquivos/Drive | | | | | | | |
| 9 | Relatório executivo → imprimir/PDF | | | | | | | |
| 10 | Modo avião: abrir o app e um projeto já criado | | | | | | | |
| 11 | Instalação (Tela de Início / Instalar app) e abertura em tela cheia | | | | | | | |
| 12 | Aviso "Nova versão disponível → Atualizar" após um novo deploy | | | | | | | |

Pontos de maior risco, a observar com atenção:
- **iPhone, app instalado na Tela de Início:** impressão para PDF (itens 6 e 9) e download de arquivos (item 7). Em versões antigas do iOS esses recursos tinham limitações no modo "app instalado"; **não consigo confirmar o comportamento atual sem um aparelho**. Se falhar, a alternativa é abrir o mesmo endereço no Safari (os dados são os mesmos só se for o mesmo contexto — no iOS, o app instalado e o Safari guardam dados **separados**; use "Gerar arquivo do projeto" para levar de um para o outro).
- **Firefox:** ao criar o primeiro projeto, o Firefox pode perguntar se o site pode guardar dados de forma persistente — é o pedido de proteção dos dados; "Permitir" é o recomendado.
