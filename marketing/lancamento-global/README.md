# NexoProcess Goes Global — peças de lançamento internacional (v1.0)

Campanha "IT’S TODAY. NEXOPROCESS GOES GLOBAL." para o lançamento da versão em inglês na Gumroad.

## Entregáveis
| Pasta / arquivo | O que é |
|---|---|
| `exports/*.jpg` | Para publicar: Instagram Feed 1080×1350, Instagram Stories 1080×1920, LinkedIn 1200×627 |
| `exports/*@2x.png` | Alta resolução (2160×2700, 2160×3840, 2400×1254) |
| `exports/sem_texto/` | Os três formatos sem textos nem logotipo (JPG e PNG @2x) |
| `exports/PREVIA_tres_formatos.png` | Prévia das três aplicações lado a lado |
| `editaveis/*.html` | Composições editáveis: abra no navegador; os textos estão no próprio HTML |
| `editaveis/camadas/` | Camadas separadas por formato: `fundo` (globo, arcos e feixe), `produto` (mockup com sombra, transparente), `textos` (transparente) |
| `mockup/mockup_en.png` | O mockup MacBook + iPhone com as telas em inglês, transparente (2110×1339), para reutilizar |
| `LEGENDAS.md` | Legendas EN para Instagram e LinkedIn, versão PT opcional e texto alternativo |

## Como foi feito
- **Globo:** 3.356 pontos reais de terra (`marketing/filme/assets/dados.json`), projeção ortográfica centrada no Atlântico Sul. Os arcos saem do Brasil (onde o produto nasceu) para América do Norte, Europa e África e terminam em formas de processo: círculo, etapa e decisão.
- **Produto (v1.1):** mockup MacBook + iPhone, recortado da foto de dispositivos já usada no projeto (`marketing/filme/assets/mockup_recorte.png`), com telas REAIS da interface em inglês: no notebook, o *AS-IS map* (1444×896 @2x); no iPhone, o *Diagnosis* (390×763 @3x). A demonstração é a "Order processing (fictional sample)". Montagem em `mockup/monta_mockup.py`. Barra de status, Dynamic Island e indicador de início do iPhone são desenhados (convenção de mockup); o conteúdo do app não foi alterado. Um feixe de luz sai de trás do notebook e chega ao Brasil no globo.
- **Marca:** logotipo oficial em SVG, IBM Plex Sans, navy `#03060c`/`#173263`, teal `#00A8BC`/`#40C8D6`/`#6fdbe6`.
- **Sem geração por IA:** nenhuma ferramenta paga ou de IA de imagem foi usada. Tudo é desenhado por código.

## Reproduzir ou editar
```bash
python3 -I marketing/lancamento-global/mockup/monta_mockup.py      # remonta o mockup (telas em marketing/video/assets/telas-en/)
node marketing/lancamento-global/gera_lancamento.cjs              # todas as peças, camadas e versões sem texto
node marketing/lancamento-global/gera_lancamento.cjs feed teste   # teste rápido em work/
```
Posições, tamanhos e textos de cada formato ficam no objeto `F`, no topo de `gera_lancamento.cjs`.
