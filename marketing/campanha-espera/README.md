# NexoProcess · Campanha "A espera invisível" (v1.0)

Estratégia completa em [`CAMPANHA.md`](CAMPANHA.md): diagnóstico, benchmark, distribuição, 3 conceitos, matriz, storyboard, copy, medição e red team.

## Entregáveis (`exports/`)
| Arquivo | O que é |
|---|---|
| `NexoProcess_Espera_Reel_A.mp4` | Reel 9:16, 25,2 s, gancho com números ("Este pedido ficou 11 h parado.") |
| `NexoProcess_Espera_Reel_B.mp4` | Mesmo Reel, gancho com pergunta ("Quanto do seu processo é espera?") |
| `NexoProcess_Espera_capa_A.png` / `_B.png` | Capas 1080×1920, seguras para o recorte 3:4 da grade |
| `stories/story_1…4.png` | 4 Stories de apoio (áreas livres para figurinhas nativas) |
| `NexoProcess_Espera_trilha.wav` | Trilha original separada |
| `por_plataforma/` | Um arquivo por rede: Instagram (9:16), YouTube Shorts (9:16, botão "link no canal"), LinkedIn (4:5, botão "Conheça o NexoProcess") e as capas |

Especificação dos vídeos: 1080×1920, H.264 High, 30 qps, 756 quadros, AAC-LC 192 kbps 48 kHz, −14,2 LUFS, pico −4,1 dBFS, 17,96 MB cada.

## Reproduzir
```bash
cd marketing/campanha-espera && mkdir -p work exports/stories qa
python3 -I scripts/espera_sound.py work/trilha_raw.wav
python3 -I ../video/scripts/loudnorm2.py work/trilha_raw.wav exports/NexoProcess_Espera_trilha.wav
node scripts/espera.cjs A && node scripts/espera.cjs B      # ~6 min cada (Instagram)
CTA=yt node scripts/espera.cjs A && CTA=li node scripts/espera.cjs A 4x5   # YouTube Shorts e LinkedIn 4:5
bash scripts/finaliza.sh
node scripts/pecas.cjs                                       # capas e Stories
# quadros de teste: node scripts/espera.cjs A 0,9.9,14.6
```
Caminhos absolutos no topo dos scripts (`/home/user/Code-Del-Rio`, Chromium em `/opt/pw-browsers/chromium`).

## Origem e licenças
- **Telas:** capturas reais do app (exemplo fictício "Processamento de pedido"), em `marketing/video/assets/`. Os números exibidos (2 h 15 min de trabalho, 11 h de espera por execução, espera de 8 h na análise manual) são os da própria tela, marcados "Calculado".
- **Trilha e efeitos:** sintetizados por código neste projeto, sem amostras de terceiros. Uso comercial livre.
- **Fonte:** IBM Plex Sans (SIL OFL 1.1).
- **Sem locução:** não há voz em português com licença comercial disponível aqui. Roteiro para o fundador gravar em `CAMPANHA.md`, seção 7.

## QA (medido nos arquivos finais)
Sem quadros pretos (`blackdetect`). Impactos do som em 7,20 · 11,40 · 15,00 · 20,45 s, nos cortes da imagem (clarões medidos em 7,20 e 20,43 s). Folhas de contato e abertura da versão B em `qa/`.
**Não verificado:** escuta humana da trilha e reprodução no app do Instagram.
