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
| `editaveis/camadas/` | Camadas separadas por formato: `fundo` (globo e arcos), `produto` (tela do app, transparente), `textos` (transparente) |
| `LEGENDAS.md` | Legendas EN para Instagram e LinkedIn, versão PT opcional e texto alternativo |

## Como foi feito
- **Globo:** 3.356 pontos reais de terra (`marketing/filme/assets/dados.json`), projeção ortográfica centrada no Atlântico Sul. Os arcos saem do Brasil (onde o produto nasceu) para América do Norte, Europa e África e terminam em formas de processo: círculo, etapa e decisão.
- **Produto:** captura real da interface em inglês (`marketing/video/assets/telas-en/en_mapa_4k.png`, demonstração "Order processing (fictional sample)"), em moldura de vidro. A linha do fluxo sai do evento final do mapa ("Order dispatched") e vira a rede global.
- **Marca:** logotipo oficial em SVG, IBM Plex Sans, navy `#03060c`/`#173263`, teal `#00A8BC`/`#40C8D6`/`#6fdbe6`.
- **Sem geração por IA:** nenhuma ferramenta paga ou de IA de imagem foi usada. Tudo é desenhado por código.

## Reproduzir ou editar
```bash
node marketing/lancamento-global/gera_lancamento.cjs              # todas as peças, camadas e versões sem texto
node marketing/lancamento-global/gera_lancamento.cjs feed teste   # teste rápido em work/
```
Posições, tamanhos e textos de cada formato ficam no objeto `F`, no topo de `gera_lancamento.cjs`.
