# NexoProcess V3: auditoria, plano e bloqueio de locução

**Status: V3 parada na Etapa 3 (Locução).** Pela regra inegociável do briefing, não há versão final sem locução. Hoje nenhuma voz com licença comercial pode ser produzida sem a sua autorização.

## 1. Inventário (FATO)
| Material | Arquivo | Reaproveitar? |
|---|---|---|
| V2 (3 formatos) | `exports/VIDEO_NEXOPROCESS_V2_*.mp4` | Sim, como base visual e de linha do tempo |
| Telas reais em alta resolução | `assets/capturas-v2/*-m.png` (1464 px), `*-d.png` (1904–2560 px), `assets/telas-4k/` | Sim. A prévia 512×640 **não** é usada como fonte. |
| Cenas Gemini Omni | `generated/omni_*_360p.mp4` | Sim. Limite: 360p (ver R3) |
| Logo, fonte, paleta | `assets/marca/`, IBM Plex, `brand.ts` | Sim |
| Locução Nassif | `audio/elevenlabs_plano_gratuito_NAO_COMERCIAL/` | **Não**: plano gratuito, sem licença comercial |
| Música ElevenLabs | idem | **Não**: mesmo motivo |
| Trilha original (código) | `audio/trilha_original_v2.wav`, `scripts/music_v2.py` | Sim: própria, sem terceiros |
| Efeitos sonoros | sintetizados em `music_v2.py` (impacto, subida) | Sim |
| Assistente (digitação real) | `assets/clipes/*-H-assistente.mp4` | Opcional |

## 2. Diagnóstico da V2 → correções da V3
| V2 | V3 |
|---|---|
| Sem locução na versão final | **Locução obrigatória** com licença comercial |
| Textos da tela iguais às frases da antiga locução | Textos e locução do briefing V3 (§3) |
| Diagnóstico só com tempo, esforço e custo | Duas tomadas: **pontos críticos** (cartão "Gargalos identificados", #1 e #2) → indicadores + "Como calculamos" |
| Duração de 23 s, ditada pela voz antiga | Cerca de 36 s, ditada pela nova locução (sem acelerar a voz) |
| CTA "Conheça o NexoProcess" | "Conheça a plataforma." (texto + voz), visível por pelo menos 3 s |
| LinkedIn 16:9 extra | Só LinkedIn 4:5 e Instagram 9:16, como pede o briefing |

## 3. Roteiro de locução validado contra o produto
| Etapa | Locução | Confere com o app? |
|---|---|---|
| 1 | Seu processo ainda vive numa planilha? | — (pergunta) |
| 2 | Quando o fluxo não está claro, identificar gargalos, retrabalho e oportunidades de melhoria se torna muito mais difícil. | — (problema) |
| 3 | Com o NexoProcess, você transforma processos em mapas visuais e consegue enxergar melhor como o trabalho acontece. | ✅ Mapa BPMN gerado a partir da planilha ou do assistente |
| 4 | Visualize pontos críticos e analise informações como tempo, esforço e custos, com transparência sobre os critérios utilizados. | ✅ Gargalos com critério configurável, marcação de "crítica", fórmulas em "Como calculamos". ⚠️ O custo só aparece quando o custo-hora é informado. |
| 5 | E transforme o diagnóstico em um plano de ação estruturado para orientar as melhorias. | ✅ Com uma nuance: o plano é gerado das mudanças do TO-BE ("Gerar do TO-BE"), que partem do diagnóstico. A simplificação é aceitável. |
| 6 | NexoProcess. Do processo na planilha ao plano de melhoria. Conheça a plataforma. | ✅ |

Cerca de 86 palavras ≈ 33–35 s de fala em ritmo moderado. Vídeo estimado em 36–38 s.

## 4. Opções de locução (decisão sua)
| Opção | Licença comercial | Custo | Qualidade esperada | O que é preciso |
|---|---|---|---|---|
| **A. ElevenLabs Starter** | Sim, para áudio gerado durante a assinatura | ~US$ 5–6/mês (A VALIDAR na página oficial) | Alta (voz Nassif, já aprovada) | Você assina; eu gero de novo (~450 créditos por take) e monto |
| **B. Sua voz (iPhone)** | Sim (voz própria) | R$ 0 | Média/alta, se gravada em ambiente silencioso | Você grava as 6 frases no Gravador e me envia; eu trato (ruído, EQ, compressão) |
| **C. Kokoro TTS (código aberto, Apache-2.0)** | Sim | R$ 0 | Média: português é a parte mais fraca do modelo (A VALIDAR na escuta) | Autorização para instalar `kokoro-onnx` (PyPI) e baixar o modelo (~330 MB, GitHub). **Bloqueado** pela política deste ambiente. |
| **D. Google Cloud TTS (pt-BR)** | Sim, pelos termos do GCP (A VALIDAR) | Centavos (~600 caracteres), mas exige faturamento ativo | Alta | Conta GCP + chave por formulário seguro |

**Recomendação:** A, pela qualidade e consistência com a voz já aprovada, ou B, se a regra for custo zero.

## 5. Plano de execução
| Etapa | O quê / como | Dependência | Critério de aceite |
|---|---|---|---|
| 1. Auditoria | Feita (este documento) | — | Inventário e lacunas registrados |
| 2. Planejamento | Roteiro §3 + storyboard V2 adaptado | — | Cada frase ligada a uma tela real |
| 3. Locução | Opção A, B, C ou D | **Sua decisão** | Licença comprovada; frases separadas por pausas |
| 4. Edição | `build_v2.py` → `build_v3.py`: corte guiado pela voz, nova tomada "pontos críticos", textos V3 | Etapa 3 | Nenhuma frase começa antes da sua cena |
| 5. Adaptação | 4:5 e 9:16 recompostos (já existem) | Etapa 4 | Áreas seguras respeitadas |
| 6. QA | ffprobe, quadros pretos, correlação da voz, transcrição para conferir a pronúncia (se houver ferramenta autorizada), folhas de contato | Etapa 5 | Checklist do briefing §12 |
| 7. Entrega | `exports/V3/` + relatórios | Etapa 6 | Os 12 itens do briefing §13 |

Tempo estimado depois de receber a locução: cerca de 40 minutos.

## 6. Riscos
- **R1. Não consigo ouvir.** A verificação sonora é feita por medição (nível, posição da voz, ruído). Você precisa ouvir os vídeos antes de aprovar.
- **R2. Marca ainda é codinome** (INPI).
- **R3. Cenas de IA em 360p.** Regerar em 1080p tem custo (prompts prontos em `ROTEIRO_FINAL.md` §5).
- **R4. O CTA "Conheça a plataforma" precisa de um destino** (link na bio e no post).
