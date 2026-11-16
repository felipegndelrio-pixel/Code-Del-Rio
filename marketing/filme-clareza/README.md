# NexoProcess — filme "Do caos à clareza" (v1.0)

Filme de marca de 33,6 s para Instagram, LinkedIn e YouTube. Pasta isolada de marketing: **nada em `apps/` foi alterado.**

## Entregáveis (`exports/`)
| Arquivo | O que é |
|---|---|
| `NexoProcess_Clareza_9x16.mp4` | Vídeo vertical 1080×1920 (Reels, Stories, Shorts) |
| `NexoProcess_Clareza_4x5.mp4` | Vídeo 1080×1350 (feed do LinkedIn e do Instagram) |
| `NexoProcess_Clareza_16x9.mp4` | Vídeo 1920×1080 (YouTube) |
| `NexoProcess_Clareza_trilha.wav` / `.m4a` | Trilha original, separada |
| `NexoProcess_Clareza_capa_{9x16,4x5,16x9}.png` | Capas |

Também: `STORYBOARD.md` (roteiro com timecodes) e `qa/` (folhas de contato, transições, forma de onda e espectro da trilha).

Especificação dos vídeos: H.264 High, yuv420p, 30 qps, 1008 quadros, AAC-LC 192 kbps 48 kHz estéreo, `faststart`.

## Controle de qualidade (medido nos arquivos finais, 16/11/2026)
| Item | 9:16 | 4:5 | 16:9 |
|---|---|---|---|
| Tamanho | 26,41 MB | 21,00 MB | 26,15 MB |
| Resolução | 1080×1920 | 1080×1350 | 1920×1080 |
| Duração / quadros | 33,6 s / 1008 | 33,6 s / 1008 | 33,6 s / 1008 |
| Vídeo | H.264 High, 30 qps | idem | idem |
| Áudio | AAC-LC 48 kHz estéreo | idem | idem |
| Volume integrado | −14,0 LUFS | −14,0 LUFS | −14,0 LUFS |
| Pico real | −4,1 dBFS | −4,1 dBFS | −4,1 dBFS |

- **Limite de 29,5 MB:** cumprido nos três, com folga de 3,1 MB ou mais.
- **Sincronia som × imagem (9:16):** maiores ataques do áudio em 9,62 · 12,62 · 15,60 · 19,22 · 21,61 · 24,02 · 25,84 s. Cortes e palavras na imagem em 9,6 · 12,6 · 15,6 · 19,2 · 21,6 · 24,0 · 25,8 s. Clarões na imagem com pico em 9,63 s e 25,83 s. Diferença máxima: 0,04 s (cerca de 1 quadro).
- **Quadros pretos:** nenhum trecho preto de 0,2 s ou mais (`blackdetect`). O filme abre e fecha com fusão.
- **Revisão visual:** folhas de contato dos três formatos (28 quadros cada) e tira de transições em `qa/`. Um defeito achado e corrigido: o selo de dados fictícios entrava 0,15 s antes do painel.
- **Trilha por seção:** tensão em torno de −17 LUFS, produto em −14, fechamento em −12 (curva crescente). Equilíbrio por faixa em `scripts/analisa_trilha.py`.

## Como reproduzir
Requisitos: Node com Playwright e Chromium, FFmpeg, Python 3 com numpy. Fontes IBM Plex vêm de `node_modules/@fontsource`.

```bash
cd marketing/filme-clareza
mkdir -p work exports qa

# 1. trilha (uns 10 s)
python3 -I scripts/clareza_sound.py work/trilha_raw.wav
python3 -I ../video/scripts/loudnorm2.py work/trilha_raw.wav exports/NexoProcess_Clareza_trilha.wav
ffmpeg -y -i exports/NexoProcess_Clareza_trilha.wav -c:a aac -b:a 256k exports/NexoProcess_Clareza_trilha.m4a

# 2. imagem, quadro a quadro (alguns minutos por formato)
node scripts/clareza.cjs 9x16
node scripts/clareza.cjs 4x5
node scripts/clareza.cjs 16x9

# 3. finais (imagem + trilha, com teto de tamanho)
bash scripts/finaliza.sh

# quadros de teste, sem renderizar tudo:  node scripts/clareza.cjs 9x16 1.4,9.4,22.6,31
# medir a trilha por seção e por faixa:   python3 -I scripts/analisa_trilha.py exports/NexoProcess_Clareza_trilha.wav
```

Os caminhos em `clareza.cjs` são absolutos (`/home/user/Code-Del-Rio`, Chromium em `/opt/pw-browsers/chromium`). Em outra máquina, ajuste as constantes `R` e `executablePath` no topo e no fim do arquivo.

### Conta do tamanho (limite: 29,5 MB)
- Teto de vídeo 6.500 kbps + áudio 192 kbps = 6.692 kbps.
- 6.692 kbps × 33,6 s ÷ 8 = **28,1 MB no pior caso**.
- O encoder usa qualidade constante (CRF 17) e só encosta no teto em cenas complexas.

## Arquivos de produção (`scripts/`)
| Arquivo | Função |
|---|---|
| `clareza.cjs` | Motor do filme: página HTML determinística (`window.render(t)`), capturada quadro a quadro e enviada ao FFmpeg |
| `clareza_sound.py` | Trilha original, sintetizada nota a nota com numpy |
| `analisa_trilha.py` | Mede a trilha por seção e por faixa de frequência |
| `finaliza.sh` | Junta imagem e trilha e gera os três finais |

## Origem do material e licenças
- **Telas do produto:** capturas reais do app em `marketing/video/assets/` (`telas-4k/`, `capturas-v2/`), demonstração com dados fictícios, identificada na tela. Nenhuma tela foi redesenhada.
- **Rede de luz, painéis e tipografia:** gerados por código neste projeto.
- **Fontes:** IBM Plex Sans (licença SIL OFL 1.1).
- **Trilha e efeitos:** obra original deste projeto, sintetizada por código. Não usa amostras, loops, bibliotecas de som ou IA de terceiros. Uso comercial livre.
- **Locução:** não há. Nenhuma voz em português com licença comercial está disponível neste ambiente, e o briefing pede não usar voz artificial sem qualidade premium.

## Textos na tela
"Todo processo tem uma lógica." · "Mas nem sempre é fácil enxergar o todo." · "É aqui que a clareza começa." · "Mapeamento visual." · "Diagnóstico." · "Plano de ação." · "Mapeie." · "Diagnostique." · "Transforme em ação." · "NexoProcess" · "Clareza para transformar processos em ação." · "Conheça o NexoProcess" · selo "Demonstração com dados fictícios".

## Limitações conhecidas
1. **O áudio foi validado por medição, não por escuta.** Este ambiente não reproduz som. Foram medidos volume, picos, equilíbrio por faixa de frequência e o instante de cada ataque. A qualidade musical precisa ser julgada por uma pessoa, em fone e no alto-falante do celular.
2. Os vídeos não foram testados nos aplicativos do Instagram, LinkedIn e YouTube, nem no Safari do iPhone.
3. "NexoProcess" é codinome, com validação no INPI pendente (ver `apps/nexoprocess/src/config/brand.ts`).
