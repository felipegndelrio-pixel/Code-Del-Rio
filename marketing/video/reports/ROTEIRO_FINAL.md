# Roteiro e storyboard final: NexoProcess V2

**Conceito:** DO PROCESSO NA PLANILHA AO PLANO DE MELHORIA · **Jornada:** desorganizado → mapa → diagnóstico → plano de ação.
**Duração:** 23,4 s (os três formatos usam a mesma linha do tempo, então uma única `LEGENDAS.srt` serve para todos).

## 1. Roteiro e storyboard
| Cena | Tempo | Visual (fonte) | Texto na tela | Locução (só na prévia) | Som |
|---|---|---|---|---|---|
| 1. Gancho | 0,0–2,2 s | Escritório à noite, gestor de costas diante de parede com planilhas e fios (Gemini Omni) | **Seu processo vive numa *planilha?*** | — | Impacto grave no 1º quadro |
| 2. Problema | 1,95–4,55 s | Fios embaraçados que começam a se alinhar (Gemini Omni) | **Quando o fluxo não está claro, os *gargalos* também não.** | — | Tensão + subida |
| 3. Solução: mapa | 4,3–9,2 s | **Real:** mapa macro em travelling, depois a etapa "Separação" com o laço de retrabalho | Rótulo "1/3 Mapa visual" + selo + legenda | "E ele vira um mapa visual, com gargalos e retrabalho destacados." | "Braam" na entrada + pulso |
| 4. Diagnóstico | 8,95–14,3 s | **Real:** cartão "Resumo do processo atual" rolando até **"Como calculamos"** (fórmulas) | "2/3 Diagnóstico" + legenda | "O diagnóstico mostra tempo, esforço e custo, com a fórmula à vista." | Pulso + acordes |
| 5. Plano de ação | 14,05–18,3 s | **Real:** cartão "Plano de ação" com 4 ações (responsável, prazo, status) | "3/3 Plano de ação" + legenda | "E tudo vira um plano de ação, com responsável e prazo." | Subida até o logo |
| 6. Encerramento | 18,05–23,4 s | Logo oficial + slogan + pilares; CTA aos 19,35 s | NexoProcess · Do processo na planilha ao plano de melhoria. · Mapa visual · Diagnóstico · Plano de ação · **Conheça o NexoProcess** (+ "Link na bio" no Instagram) | "NexoProcess. Do processo na planilha ao plano de melhoria." | Impacto + acorde final |

## 2. Desvios em relação ao storyboard pedido (e por quê)
- **23,4 s em vez de 16–22 s.** A locução existente (4 frases, 17,4 s de fala) define o ritmo. Para chegar a 20 s seria preciso gravar uma locução nova, mais curta, e isso tem custo e licença pendentes (§4).
- **As mensagens das cenas 3–5** usam as frases da locução ("E ele vira um mapa visual…") em vez de "Transforme processos em mapas visuais". Assim a legenda bate com a fala; com outra locução, dá para voltar ao texto sugerido.
- **"Navegação pela interface"** aparece no mapa: visão macro → etapa, que é o drill-down real. Não há cursor simulado.
- **A cena do assistente foi removida** por duração. O clipe real continua guardado.

## 3. Composição por formato (recomposição, não corte automático)
| Elemento | Reels 9:16 (1080×1920) | LinkedIn 4:5 (1080×1350) | LinkedIn 16:9 (1920×1080) |
|---|---|---|---|
| Título (cenas 1–2) | Topo, y 300 (abaixo da margem de 250 px) | Topo, y 70–84 | Inferior esquerdo, sobre degradê |
| Cena de IA | 1080×940 a partir de y 560 + fundo desfocado | 1080×900 a partir de y 380 | Tela cheia |
| Telas do app | Janela de 960×950 com rolagem suave | Janela de 960×955 | Janela de 1400×760 (layout desktop) |
| Legenda | Centro em y 1400 (fora da faixa de interface do IG) | Centro em y 1222 | Centro em y 985 |
| Rótulo / selo | y 270, esquerda / direita | y 48 | y 56 |

## 4. Locução: como fica comercial
- A voz Nassif foi gerada no **plano gratuito** da ElevenLabs, que não permite uso comercial. Ela fica só em `exports/previa_locucao_NAO_COMERCIAL/`.
- **Opção A (recomendada):** assinar o plano Starter da ElevenLabs (~US$ 5–6/mês, A VALIDAR) e **gerar de novo** as 4 frases. Áudio criado antes da assinatura pode não ter licença.
- **Opção B:** gravar com a sua própria voz ou com um locutor contratado (mesmo texto e mesmo ritmo, cerca de 4,5 / 5,0 / 3,9 / 4,1 s por frase).
- **Como encaixar:** substituir `audio/.../locucao_nassif.mp3`, rodar `scripts/align.py` (que separa as frases) e `python3 scripts/build_v2.py all`.

## 5. IA de vídeo: avaliação e prompts prontos
**Ferramentas disponíveis (FATO, pela lista de modelos desta conta ElevenLabs):** `veo-3.1-generate-001`, `veo-3.1-fast-generate-001`, `veo-3.1-lite-generate-001`, `gemini-omni-1.1-flash`, `kling-3-pro`, `runway-gen4-5`, entre outros. Você também usa o Gemini Omni 1.1 Flash no Google AI Studio.

**Decisão:** **não gerei nada novo.** As duas cenas atuais cumprem o storyboard. A única melhoria seria regerá-las em 1080p nativo, e isso tem custo, que pede sua autorização. A interface nunca é gerada por IA.

**Prompts para regerar (um clipe por cena, um por formato: 9:16, 4:5 e 16:9):**

| | Cena 1: Gancho | Cena 2: Problema |
|---|---|---|
| Objetivo | Identificação: a gestão "no escuro" | Mostrar a desordem que começa a se organizar |
| Duração | 4 s | 4 s |
| Câmera | Dolly-in lento em direção à parede | Push-in lento, macro |
| Luz / paleta | Noturna, navy profundo, realces teal | Navy escuro, fios teal brilhantes |
| Referência | `generated/omni_cena1_escritorio_360p.mp4` (quadro 1) | `generated/omni_cena2_fios_fluxo_360p.mp4` (quadro 1) |
| Restrições | Sem texto legível, letras, números, logos, telas ou rostos | Sem texto, letras, números, logos ou interface |

Prompt da cena 1:
```
Photorealistic cinematic shot for a premium B2B software brand film. Night inside a modern operations office. A manager seen only from behind, in silhouette, stands still in front of a wall covered with sticky notes, printed spreadsheets and red strings connecting them. Slow, smooth dolly-in toward the wall; keep the wide framing, no close-up of the notes. Deep navy blue ambient light with subtle teal highlights, shallow depth of field, anamorphic look, subtle film grain. One single continuous shot. No readable text, letters, numbers, handwriting, logos, computer screens or faces. No dialogue, no music.
```

Prompt da cena 2:
```
Photorealistic cinematic macro shot on a dark navy surface: a tangled knot of glowing teal threads slowly loosens and the threads begin to straighten into parallel lines, moving left to right. Slow smooth push-in, soft volumetric light, elegant and minimal, subtle film grain. One single continuous shot. No text, letters, numbers, logos or user interface. No dialogue, no music.
```

**Critério de aceite de cada clipe:** pessoa de costas, nenhuma letra ou número, movimento suave, só navy e teal. Nada é dado como gerado antes de conferir o arquivo.

## 6. Música
- **Trilha da V2:** original, sintetizada por código (`scripts/music_v2.py`), sem amostras nem licença de terceiros, e casada com o corte. Estrutura: impacto aos 0 s → tensão → "braam" aos 4,3 s (entrada do produto) → pulso a ~104 BPM em 6 compassos → subida → impacto no logo aos 18,05 s.
- **Limite:** soa sintética. Uma trilha de biblioteca com licença comercial (ou ElevenLabs Music no plano pago) deve soar mais rica. A troca é só de arquivo.
