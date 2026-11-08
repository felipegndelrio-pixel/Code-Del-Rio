# Campanha "O que é o NexoProcess?": relatório de QA

Data: 08/11/2026 · Pasta: `output/NexoProcess_Campanha_Google/` (dentro do repositório; `/output` na raiz do sistema não é acessível a você pelo app).

## 1. Arquivos produzidos (FATO, medidos)
| Arquivo | Formato | Dimensões | Duração | Codec | Tamanho |
|---|---|---|---|---|---|
| `01_Instagram_Feed.png` | Imagem 4:5 | 1080×1350 | — | PNG | 1,2 MB |
| `02_LinkedIn_Feed.png` | Imagem 1:1 | 1200×1200 | — | PNG | 1,2 MB |
| `03_Instagram_Reels_Stories.mp4` | Vídeo 9:16 | 1080×1920 | **30,000 s** (900 quadros) | H.264 High 30 fps · AAC LC 48 kHz estéreo | 12 MB |
| `04_LinkedIn_Video.mp4` | Vídeo 4:5 | 1080×1350 | **30,000 s** (900 quadros) | idem | 11 MB |
| `05_Thumbnail_Video.png` | Capa do Reels | 1080×1920 | — | PNG | 1,0 MB |
| `07_Alternativa_ProvaReal_4x5.png` | Extra: versão autoral | 1080×1350 | — | PNG | — |
| `qa/` | Folhas de contato e comparação | — | — | PNG | — |

Áudio dos vídeos: -14,5 LUFS integrado, pico -1,2 dBFS, nenhum silêncio acima de 0,5 s, nenhum quadro preto (`blackdetect`).

## 2. Autenticidade da pesquisa do Google (regra absoluta)
| Verificação | Resultado |
|---|---|
| Fonte | **Só a gravação original** `ScreenRecording_11-07-2026_19-26-31_1.mp4` (1320×2868, HEVC). Não tentei uma captura ao vivo: o acesso a `www.google.com` é bloqueado neste ambiente (proxy recusou a conexão). |
| Reconstrução por HTML/CSS/IA | **Nenhuma.** As telas mostram quadros e trechos da própria gravação. |
| Textos, ordem, ícones, destaques | Preservados. Comparação pixel a pixel da tela do iPhone com o quadro original: **SSIM 0,976 / 0,974** (9:16, quadros 0,5 s e 2,93 s). No 4:5, SSIM 0,80 por causa do recorte de medição (cantos arredondados, 1–3 px de alinhamento). A inspeção lado a lado é idêntica (`qa/comparacao_tela_4x5_vs_original.png`). |
| Tempo da gravação | Toda a pesquisa aparece, em ordem: 0,5 s (topo) → rolagem original → 2,93 s → rolagem → fontes e carrossel até 6,53 s, **em velocidade natural**. Para chegar a 30 s usei **pausas em quadros originais**, como o briefing permite. |
| Excluído | Só os 0,65 s finais da gravação (6,55 s em diante), que mostram a **Central de Controle do iOS** encerrando a gravação. Não é conteúdo da pesquisa. |
| MacBook | Recorte da **seção real** da resposta (parágrafo inicial + 2 primeiras funcionalidades), na proporção original, centralizado com o próprio fundo escuro da página (#1E1F23) nas laterais. Sem esticar e sem recriar layout de desktop. |
| iPhone | Quadro e vídeo originais ajustados por inteiro à tela (sem corte), com cantos arredondados. A "ilha" com ponto vermelho é a da gravação original (indicador de gravação do iOS). |
| Destaques do vídeo | Ficam **fora** da tela do iPhone, com o **mesmo texto** dos tópicos do Google, e aparecem quando o item está visível: 3 sobre o quadro 0,5 s (8,2–12,4 s) e 2 sobre o quadro 2,93 s (14,3–17,4 s). O alinhamento vertical com cada item foi conferido nas folhas de contato. |

## 3. Dispositivos e composição
- **Foto original** `f8fafa0e-image.png` (1122×1402): MacBook e iPhone mantidos, sem mudar proporção nem perspectiva (vista frontal, encaixe retangular).
- O iPhone continua **na frente** do laptop: o corpo do aparelho foi recopiado da própria foto sobre a tela do laptop.
- No 9:16, o fundo de estúdio foi **estendido** acima e abaixo com faixas desfocadas da própria foto (nada inventado).
- **Véu de foco** durante o zoom: escurece só a área à esquerda do iPhone (o laptop), para os destaques ficarem limpos. A tela do iPhone fica intocada.

## 4. Red team
| Pergunta | Resposta |
|---|---|
| A pesquisa corresponde à gravação? | Sim (§2) |
| Algo artificial ou inventado? | Não. Os textos externos são do briefing ou nomes literais da resposta do Google. |
| Legível no celular? | Vídeo: tela do iPhone a ~1300 px de altura no 9:16 e ~1180 px no 4:5 durante a leitura. Imagens: texto do MacBook legível; o do iPhone é pequeno na vista geral (limite da foto). Por isso existe a alternativa 07, em close. |
| Hierarquia / CTA | Título → dispositivos (pesquisa) → complemento → CTA. Um CTA por peça. |
| Excesso de informação? | 3 linhas de texto nas imagens. No vídeo, 1 mensagem por cena. |
| Áreas seguras do Instagram (9:16) | Textos entre y 262 e 1290 de 1920 |

## 5. Limitações
1. **Arquivos C** (`NexoProcess_Anuncio_4K…png`) **e D** (`05 - [EN] Nexoprocess Prompt…txt`) **não foram anexados** nesta conversa. Usei a identidade do repositório (logo SVG oficial, IBM Plex, navy `#0d1c38`, teal `#00a8bc`).
2. **Resolução da foto:** 1122×1402. No zoom do vídeo a foto foi ampliada 2,7×, então as bordas dos aparelhos ficam um pouco suaves. O conteúdo do Google continua nítido, porque vem da gravação em 1320×2868.
3. **Trilha:** original, sintetizada por código (`marketing/video/scripts/music_v2.py`), sem amostras de terceiros, de uso comercial livre. **Não consigo ouvi-la**: valide no celular.
4. **CTA no vídeo do LinkedIn:** adaptado para "Conheça pelo link no post." (o LinkedIn não tem "link da bio").
5. **"Transforme processos em resultados"** é texto do briefing. É uma promessa genérica; recomendo manter assim, sem números.
6. Não abri o link da Hotmart nem conferi a página de destino.

## 6. Copys sugeridas
**Instagram (feed/Reels):**
```
O que é o NexoProcess? Perguntamos ao Google. 🔎

A resposta: um assistente digital para mapear, analisar e melhorar processos — sem precisar dominar BPMN ou Lean.

✔ Assistente guiado
✔ Mapeamento visual (BPMN)
✔ Diagnóstico de gargalos
✔ Comparação Antes × Depois
✔ Plano de ação

Mapeie. Analise. Melhore. Gere valor.
Conheça pelo link da bio.

#GestaoDeProcessos #MelhoriaContinua #BPM #Lean #MapeamentoDeProcessos #PME
```
**LinkedIn:**
```
O que é o NexoProcess? Fizemos a pergunta ao Google — e mostramos a resposta original, sem edição.

Do mapeamento ao diagnóstico. Do diagnóstico à ação:
• Assistente guiado
• Mapeamento visual (BPMN)
• Diagnóstico de gargalos
• Comparação Antes × Depois
• Plano de ação

Conheça o NexoProcess: https://go.hotmart.com/A108124551M

#GestaoDeProcessos #MelhoriaContinua #BPM #ExcelenciaOperacional
```
No Instagram, coloque o link da Hotmart na bio.

## 7. Pendências
- Ouvir os vídeos no celular, antes de publicar.
- Confirmar a página de destino da Hotmart.
- Anexar os arquivos C e D, se quiser que eu confira a identidade contra eles.
- Validação da marca no INPI (pendência anterior).
