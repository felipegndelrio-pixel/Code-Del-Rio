# Fase 1.5 — Diagnóstico (antes de qualquer correção)

Medido em 2026-10-19 sobre o código da Fase 1 (`d0f9598`), build de produção servido localmente, Chromium do Playwright. Nenhum código de produção alterado. Dados brutos: [`evidencias/fase-1.5/diagnostico-medicoes.json`](evidencias/fase-1.5/diagnostico-medicoes.json).

## 1. Mapa em branco no celular — causa raiz

O `kne()` do bundle é `fitReadable()` em `src/bpmn/BpmnCanvas.tsx`. Quando "ajustar à tela" exigiria zoom < 60%, ela fixa o zoom em 60% e **centraliza o diagrama na vertical** dentro do quadro (`y = inner.y + inner.height/2 − h/2`). O quadro tem `height: min(68vh, 640px)`.

| Medida (tema claro, após load + 500 ms) | 390×844 | 360×800 | 1366×900 |
|---|---|---|---|
| Primeira dobra (altura − barra inferior de 57 px) | 787 | 743 | 900 |
| Topo do quadro (y na página) | 572 | 572 | 450 |
| Altura do quadro | 574 | 544 | 612 |
| Zoom aplicado | 0,6 (limite) | 0,6 (limite) | 0,924 (ajuste normal) |
| Topo do diagrama dentro do quadro | **+224 px** | **+209 px** | +209 px |
| Topo do diagrama na página | **796** | **781** | 659 |
| Diagrama visível na primeira dobra? | **não** (9 px abaixo) | **não** (38 px abaixo) | sim |

**Conclusão:** a causa principal é a **(a)**. A centralização vertical, com zoom travado em 60%, coloca um diagrama de 126 px no meio de um quadro de 574 px. A **(b)**, os 572 px de interface acima do quadro, contribui mas não decide.

- **Experimento (a)**, sem mudar código: alinhei o diagrama ao topo do quadro (16 px), mantendo zoom e CSS. Resultado: diagrama em y 588 → 714, **inteiro na primeira dobra** em 390 e 360 px. Capturas: `experimento-a-*.png` e `comparacao-antes-experimento.png`.
- **Só (b) bastaria?** Mantendo a centralização, o quadro teria de ter ≤ 304 px em 390×844, apertado demais para o detalhe das etapas. Reduzir a interface acima do quadro é mudança de UX maior, fora do escopo.
- **Desktop não regride:** a correção mexe só no ramo do zoom travado, que roda quando a escala < 0,6. Em 1366 px a escala é 0,924 e o ramo não é executado.

**Correção proposta (um commit, hipótese a):** no ramo de zoom travado, alinhar ao topo em vez de centralizar. Ponto de escolha (ver P1): com margem de 16 px, os botões de zoom ficam sobre o canto superior direito do diagrama. Com margem abaixo dos botões (~56 px), o diagrama fica inteiro em 390 px, mas em 360 px os últimos 11 px de rótulos ficam abaixo da dobra (o topo continua visível).

## 2. Contraste dos selos — pares medidos

O 2,66:1 denunciado é do **texto dentro do selo**, não do selo sobre o fundo do diagrama. Há uma segunda falha, **ainda não reportada**: o selo "gargalo" no tema escuro.

| Token / selo | Tema | Texto | Fundo do selo | Texto × selo | Selo × fundo atrás | Selo × `surface` | Selo × `surface-2` |
|---|---|---|---|---|---|---|---|
| `np-badge-amber` (retrabalho) | claro | `#111` | `--amber` `#92400e` | **2,66 ✗** | 6,61 ✓ | 7,09 ✓ | 6,26 ✓ |
| `np-badge-bad` (gargalo) | claro | `#fff` | `--bad` `#b01a1a` | 6,98 ✓ | 6,50 ✓ | 6,98 ✓ | 6,16 ✓ |
| `np-badge-amber` | escuro | `#111` | `--amber` `#f5be46` | 11,09 ✓ | 11,10 ✓ | 10,24 ✓ | 9,25 ✓ |
| `np-badge-bad` | escuro | `#fff` | `--bad` `#f87878` | **2,64 ✗** | 7,15 ✓ | 6,60 ✓ | 5,96 ✓ |
| `np-badge-info` | ambos | `--ink` | `--surface-2` | 15,97 / 13,28 ✓ | — | — | — |

`np-badge-info` está no CSS, mas nenhum ponto do código o produz hoje. Mesmo assim ele entra no teste.

**Correção proposta:** os fundos `--bad` e `--amber` são compartilhados com mensagens de erro, alertas e bordas do mapa, e passam contra todos os fundos de contexto. O que falha é a **cor do texto fixa** (`#111`/`#fff`) para os dois temas. Proposta: tokens de **texto sobre o selo** por tema, `--on-bad` e `--on-amber` (ver P2). Resultado: claro âmbar `#fff` → **7,09**; escuro gargalo `#111` → **7,15**. Teste Vitest lê os tokens do `index.css` nos dois temas e falha se qualquer par (texto × selo, selo × fundo atrás, selo × `surface`, selo × `surface-2`) ficar < 4,5:1.

## 3. axe no mapa — com e sem a exclusão de `.djs-container`

| Tema · largura | Com exclusão (atual) | Sem exclusão |
|---|---|---|
| claro · 1366 | 0 | **1 regra**: `color-contrast` (serious, 2 nós: selos âmbar) |
| escuro · 1366 | 0 | **1 regra**: `color-contrast` (serious, 2 nós: selos gargalo) |
| claro · 390 | 1: `link-name` (serious, 2 nós) | **2**: `color-contrast` (1 nó) + `link-name` (2 nós) |
| escuro · 390 | 1: `link-name` (serious, 2 nós) | **2**: `color-contrast` (1 nó) + `link-name` (2 nós) |

- **O bpmn-js não gera nenhuma violação própria:** nenhum `svg-img-alt`, `role` ou `<title>` faltando. O quadro já tem `role="region"` com `aria-label`. Logo, **zero falsos positivos e zero overrides**: basta remover a exclusão. `aria-hidden` no SVG não é necessário e esconderia os selos de leitores de tela.
- `link-name` é o achado **D2** do baseline: os links "Meus projetos" e "Ajuda" do cabeçalho ficam sem nome no celular. **Não faz parte dos três itens da Fase 1.5** (ver P3).

## 4. Lighthouse móvel do mapa — o que leva a 95

Auditorias de acessibilidade reprovadas hoje: `color-contrast` (peso 7) e `link-name` (peso 7). Simulação com os pesos reais do relatório:

| Correção | Pontuação |
|---|---|
| nenhuma (atual) | 91,72 |
| só contraste (itens 2 e 3) | **95,86** |
| contraste + `link-name` | 100 |

O desempenho do mapa já está em 89 (meta ≥ 80) desde a Fase 1.

## Perguntas para sua revisão

- **P1 — Margem do alinhamento:** 16 px (diagrama inteiro na dobra nas duas larguras, botões de zoom sobre o canto do diagrama) ou ~56 px (abaixo dos botões; em 360 px os últimos 11 px ficam abaixo da dobra)? Recomendo **16 px**: os botões são sobrepostos ao quadro também no desktop, e o diagrama inteiro visível é o critério de aceite.
- **P2 — Nome dos tokens:** você sugeriu `--bad-on-diagram` / `--amber-on-diagram`, mas a falha é do texto sobre o selo, não do selo sobre o diagrama. Proponho `--on-bad` / `--on-amber` (cor do texto sobre aquele fundo), sem tocar em `--bad`/`--amber`. Posso seguir com esse nome?
- **P3 — `link-name` (D2):** sem ele, o mapa chega a 95,86 (folga de 0,86 ponto) e o axe em 390 px continua com 1 violação *serious*. A correção são 2 `aria-label` no cabeçalho. Incluo na Fase 1.5 ou deixo para a Fase 7?
- **Base dos PRs:** os PRs 1 e 2 estão **abertos, sem merge**. A branch `fase-1.5` saiu de `fase-1-build`. Quer fazer o merge dos dois antes, ou mantenho o PR da Fase 1.5 empilhado sobre o da Fase 1?
- **Safari iOS:** não há aparelho nem simulador neste ambiente. O teste manual em iOS fica com você.
