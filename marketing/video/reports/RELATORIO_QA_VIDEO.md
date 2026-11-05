# Relatório de QA: vídeo NexoProcess V2

Data: 05/11/2026 · Verificação por `ffprobe`/`ffmpeg` (medições), folhas de contato (`reports/frames/qa_*.png`) e correlação de áudio.
**Limite:** não consigo assistir com som nem ouvir. A parte sonora foi verificada por medição.

## 1. Arquivos finais
| Arquivo | Formato | Uso |
|---|---|---|
| `exports/VIDEO_NEXOPROCESS_V2_INSTAGRAM_REELS.mp4` | 1080×1920 | Instagram Reels / YouTube Shorts |
| `exports/VIDEO_NEXOPROCESS_V2_LINKEDIN_4X5.mp4` | 1080×1350 | LinkedIn (principal) |
| `exports/VIDEO_NEXOPROCESS_V2_LINKEDIN_16X9.mp4` | 1920×1080 | LinkedIn desktop / YouTube |
| `exports/previa_locucao_NAO_COMERCIAL/*_PREVIA_LOCUCAO_NAO_COMERCIAL.mp4` (3) | idem | **Só para aprovação interna.** Voz do plano gratuito. |
| `covers/CAPA_INSTAGRAM.png` · `covers/CAPA_LINKEDIN.png` | 1080×1920 · 1080×1350 | Capas |
| `subtitles/LEGENDAS.srt` | — | Vale para os 3 formatos (mesma linha do tempo) |

**Por que existe a 16:9:** atende desktop e YouTube. A 4:5 ocupa mais tela no feed do celular e por isso é a principal.

## 2. Metadados (ffprobe, FATO)
| Arquivo | Vídeo | Áudio | Duração | Loudness | Pico |
|---|---|---|---|---|---|
| Reels | H.264 High, 30 fps | AAC LC 48 kHz estéreo 192 kb/s | 23,3 s | -14,5 LUFS | -1,4 dBFS |
| LinkedIn 4:5 | idem | idem | 23,3 s | -14,5 LUFS | -1,4 dBFS |
| LinkedIn 16:9 | idem | idem | 23,3 s | -14,5 LUFS | -1,4 dBFS |
| Prévias com locução | idem | idem | 23,3 s | -14,0 LUFS | -1,5 dBFS |

Tamanho: cerca de 15 MB cada.

## 3. Checklist
| Item | Resultado | Como verifiquei |
|---|---|---|
| Sem quadros pretos inesperados | ✅ 0 ocorrências | `blackdetect` (d ≥ 0,15 s) nos 6 arquivos |
| Sem cortes bruscos | ✅ Todas as transições são fusões de 0,25 s | Linha do tempo + folha de contato |
| Sem distorção de imagem | ✅ Escalas proporcionais; recorte só em largura | Filtros do script + inspeção |
| Sem textos cortados | ✅ | Verificação automática de limites na geração dos PNGs + folha de contato |
| Sem erros ortográficos | ✅ Todos os textos de tela revisados | Lista no §4 |
| Sem sobreposição de elementos | ⚠️ 1 ressalva: no 16:9, entre 4,5 e 6,2 s, a legenda cobre parte do diagrama na tomada com a tela inteira do app. O diagrama aparece inteiro logo depois. | Folha de contato 16:9 |
| Sem interface fictícia | ✅ Toda tela de produto é captura do app real (demonstração do próprio app) | Origem dos arquivos (`assets/`, `scripts/capture_v2.cjs`) |
| Logotipo inalterado | ✅ SVG idêntico a `Logo.tsx`, sem geração por IA | `assets/marca/nexoprocess-simbolo.svg` |
| Áudio adequado e licenciado | ✅ Final: trilha original sintetizada, sem terceiros · ⚠️ Prévias: voz ElevenLabs do plano gratuito, **não comercial** | Origem + correlação: voz ausente no final (r = -0,05), presente na prévia (r = 0,79 no instante previsto, 9,4 s) |
| Legendas sincronizadas | ✅ No ponto previsto, ±0,2 s (A VALIDAR na escuta) | Pausas medidas na locução; a voz bateu em 9,41 s contra 9,42 s previstos |
| Sem informação comercial inventada | ✅ Só funções existentes (mapa, gargalos, retrabalho, tempo/esforço/custo com fórmula, plano com responsável/prazo). Sem preços, ganhos ou depoimentos. | Comparação com `README.md` e `brand.ts` |
| Legibilidade no celular | ✅ Títulos de 58–92 px, legendas de 42–46 px, interface ampliada cerca de 2× | Folhas de contato em escala reduzida |
| Sem perda na exportação | ✅ CRF 17 (intermediário) / H.264 High, ~5 Mb/s | ffprobe |
| CTA legível | ✅ "Conheça o NexoProcess" em 38–44 px (+ "Link na bio" no Reels) | Folha de contato |
| Duração adequada | ⚠️ 23,3 s (pedido: 16–22 s). Desvio justificado no Roteiro §2. | ffprobe |
| Proporção correta | ✅ 9:16 / 4:5 / 16:9 | ffprobe |
| Áreas seguras do Instagram | ✅ Texto entre y 270 e 1480 (de 1920); CTA em y ≈ 1180–1290 | Posições no script |

## 4. Textos de tela (revisão ortográfica)
Seu processo vive numa planilha? · Quando o fluxo não está claro, os gargalos também não. · 1/3 Mapa visual · 2/3 Diagnóstico · 3/3 Plano de ação · Demonstração com dados fictícios · E ele vira um mapa visual, · com gargalos e retrabalho destacados. · O diagnóstico mostra tempo, esforço e custo, · com a fórmula à vista. · E tudo vira um plano de ação, · com responsável e prazo. · NexoProcess · Do processo na planilha ao plano de melhoria. · Mapa visual · Diagnóstico · Plano de ação · Conheça o NexoProcess · Link na bio.

## 5. Ferramentas e versões (FATO)
FFmpeg/FFprobe 6.1.1 · Node.js 22.23.4 · Playwright 1.64.1 com Chromium 153 · Python + NumPy 2.5.3 · IBM Plex Sans (@fontsource) · Gemini Omni 1.1 Flash (cenas 1–2, geradas por você no Google AI Studio) · ElevenLabs eleven_v4 (voz Nassif) e eleven_music_v2_5 (só na prévia não comercial / não usados na final).

## 6. Pendências que dependem de ação externa
1. **Locução comercial:** assinar um plano pago da ElevenLabs e regerar, ou gravar uma voz própria (Roteiro §4). Depois é um comando para remontar.
2. **Link de destino** (bio e post) e UTMs (Copys).
3. **Validação da marca** "NexoProcess" (INPI e domínio).
4. **Cenas de IA em 1080p** (opcional, com custo): os prompts estão prontos no Roteiro §5.
5. **Ouvir as versões finais** no celular e no desktop, antes de publicar.
6. Confirmar nos termos atuais as licenças do Gemini Omni e do bpmn-js (marca d'água mantida).
