# Auditoria do vídeo NexoProcess (v3) + benchmark + direção criativa V2

Data: 05/11/2026 · Escopo: vídeo atual (v3: Reels 9:16 e LinkedIn 16:9), identidade visual, capturas, gravações e materiais comerciais do repositório.
Legenda: **FATO** (medido ou lido em arquivo) · **INFERÊNCIA** · **HIPÓTESE** · **A VALIDAR**.

## 1. Método
- `ffprobe` para metadados; `blackdetect` e `freezedetect` para quadros pretos e congelados; detector de cena (limiar 0,25) para cortes.
- Folha de contato a 1 quadro por segundo (`reports/frames/V1_reels_contato_1fps.png`).
- Áudio: decodificação completa, nível por trecho, teste de compatibilidade mono e correlação com a voz e a música de origem.
- **Limite:** não consigo ouvir. A avaliação sonora é feita por medição, não pela escuta.

## 2. Inventário de materiais (FATO)
| Material | Onde está | Estado |
|---|---|---|
| Logotipo | `apps/nexoprocess/src/components/Logo.tsx`, `public/icons/*`; cópia em `assets/marca/` | Símbolo próprio (início → ligação → decisão). Nome é **codinome a validar** (`docs/COMERCIALIZACAO.md`). |
| Paleta | `src/config/brand.ts` e `src/styles/index.css` | Navy `#0d1c38` / `#173263`, acento `#00A8BC` (escuro `#40C8D6`), fundo escuro `#0E1117`. |
| Tipografia | `tailwind.config.js` | IBM Plex Sans (texto) e IBM Plex Mono. |
| Capturas reais | `apps/nexoprocess/docs/screenshots/`, `assets/telas-*`, `assets/capturas-v2/` | Demonstração fictícia, tema escuro, até 4K. |
| Gravações | `generated/omni_*_360p.mp4` (Gemini Omni 1.1 Flash) | 640×360, 24 fps, 10 s cada. Cenas de cinema, sem interface. |
| Materiais comerciais | `src/config/brand.ts` (LANDING, COMMERCIAL) | Slogan oficial: "Do processo na planilha ao plano de melhoria." CTA secundário **vazio**. |
| Áudio | `audio/elevenlabs_plano_gratuito_NAO_COMERCIAL/` | Voz Nassif e música tema, gerados no plano **gratuito** (ver risco R1). |

## 3. Medições do vídeo v3 (FATO)
| Item | Reels 9:16 | LinkedIn 16:9 |
|---|---|---|
| Resolução / FPS | 1080×1920 / 30 | 1920×1080 / 30 |
| Duração | 36,5 s | 40,0 s |
| Vídeo / áudio | H.264 High ~4,3 Mb/s / AAC 48 kHz estéreo | H.264 ~5,9 Mb/s / AAC 48 kHz estéreo |
| Quadros pretos | nenhum | nenhum |
| Congelamento | 35,0 s → fim (logo parado, intencional) | 38,3 s → fim (idem) |
| Cortes secos | nenhum (todas as transições em fusão) | nenhum |
| Loudness | -13,8 LUFS, pico -1,3 dBFS | idem |
| Áudio x vídeo | Sem erros; voz e música presentes; compatível com mono | idem |

## 4. Achados quadro a quadro
| # | Achado | Evidência | Decisão |
|---|---|---|---|
| 1 | O produto só aparece aos **8,8 s** (24% do vídeo) | Folha de contato | **Substituir:** o produto entra aos 4,3 s |
| 2 | No 9:16, a cena de IA ocupa só o **terço central** da tela | Quadros 0–8 s | **Melhorar:** a cena passa a ocupar metade da tela, com o título acima |
| 3 | As legendas (pílulas) **cobrem números e textos do app** | Quadros 18–28 s | **Substituir:** cartões reais em janela própria e legendas fora da interface |
| 4 | O plano de ação **não mostra** responsável e prazo, que a locução cita | Quadros 27–30 s | **Substituir:** captura do cartão com as 4 ações (responsável, prazo, status) |
| 5 | A locução cita "fórmula à vista", mas a fórmula **não aparece** | Quadros do diagnóstico | **Corrigir:** "Como calculamos" aberto na rolagem |
| 6 | O encerramento **não tem CTA**; os pilares (~20 px) ficam ilegíveis no celular | Quadros 31–36 s | **Melhorar:** CTA "Conheça o NexoProcess" e pilares em 34 px |
| 7 | Duração de 36–40 s | ffprobe | **Reduzir:** 23,4 s (ver Roteiro, desvio justificado) |
| 8 | Cena do assistente: real e boa, mas fora da estrutura pedida | Quadros 9–13 s | **Remover da V2** (por duração); fica guardada em `assets/clipes/*-H-assistente.mp4` |
| 9 | Paleta escura com brilho verde-azulado e o tom cinematográfico | Todos | **Manter** (personalidade visual) |
| 10 | Telas do app 100% reais, com o selo "Exemplo fictício" | Todas as telas | **Manter**, com o selo "Demonstração com dados fictícios" também nos recortes |
| 11 | Cenas de IA em 360p ampliadas: suaves, com granulação | Medição | **Manter por ora**; regerar em 1080p é pendência com custo (Roteiro §5) |
| 12 | Marca d'água BPMN.io no diagrama | Recortes do mapa | **Manter visível** (licença do bpmn-js; A VALIDAR com jurídico, `COMERCIALIZACAO.md` item 2) |

## 5. Riscos
| ID | Risco | Evidência | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | **A voz e a música ElevenLabs não podem ser usadas comercialmente** | Central de ajuda oficial: o plano gratuito não inclui licença comercial. A conta retornou `free_shared`. | Alto: anúncio com áudio sem licença | V2 final com **trilha original sintetizada** (sem terceiros). Locução só em prévia marcada NÃO COMERCIAL. |
| R2 | Nome "NexoProcess" ainda é codinome | `COMERCIALIZACAO.md` | Alto: troca de marca depois da divulgação | Busca no INPI (classes 9 e 42) e domínio antes de investir em mídia |
| R3 | O CTA não tem destino | App não publicado; `COMMERCIAL.url` vazio | Médio: interesse sem conversão | Definir o link da bio e o do post antes de publicar |
| R4 | Dados fictícios lidos como reais | Telas com R$ e horas | Médio (CDC: publicidade enganosa) | Selo em todas as cenas de produto |
| R5 | Licença das cenas Gemini Omni | Termos do Google | Baixo/médio | A VALIDAR nos termos do plano usado |

## 6. Benchmark (separado por nível de evidência)
**Limite declarado:** as buscas não trouxeram análises dos vídeos de Notion, Miro, Lucidchart, Monday, Asana ou ClickUp, e daqui não consigo assistir vídeos. **Não afirmo o que essas marcas fazem.** O que segue vem de guias de plataforma e de produção (a maioria de fornecedores) e da prática do setor.

**Práticas observadas em fontes:**
- Gancho nos primeiros 1–3 s; a mensagem principal vem na frente.
- Legenda gravada no vídeo, porque boa parte assiste sem som. A legenda automática erra nomes de marca e jargão B2B.
- Vídeos de até ~30 s para gerar conhecimento da marca. Segundo um levantamento de fornecedor, a taxa de conclusão cai com a duração.
- Em demo B2B, o produto **é** a interface: mostrar um fluxo do começo ao fim, com dados realistas.
- Reels aparecem no feed recortados em 4:5 (1080×1350 central). Margens seguras de ~250 px no topo e de 340–450 px na base.

**Hipóteses de marketing (INFERÊNCIA):**
- Uma mensagem por cena e telas em close geram mais compreensão que a tela inteira.
- Rótulos de etapa (1/3, 2/3, 3/3) ajudam a reter, porque dão ao espectador a sensação de progresso.
- Cartão final com logo, slogan e um único CTA converte melhor que vários CTAs.

**Recomendações aplicadas:** gancho em 0 s; produto aos 4,3 s; legenda gravada; 23 s; telas reais em close; um CTA; recomposição por formato, em vez de corte automático.

## 7. Avaliação do gancho
| Opção | Identificação | Clareza | Curiosidade | Relevância B2B | Fácil de entender |
|---|---|---|---|---|---|
| A. "Seu processo vive numa planilha?" | Alta (situação concreta) | Alta | Média | Alta | Alta |
| B. "Sua empresa conhece seus processos ou apenas acredita que conhece?" | Média | Média (longa) | Alta | Alta | Média (16 palavras) |
| C. "Você consegue enxergar onde seus processos estão travando?" | Alta | Alta | Média | Alta | Alta |

**Escolha: A.** Liga-se ao slogan oficial ("Do processo **na planilha**…"), tem 6 palavras (leitura em menos de 2 s) e não promete resultado. A ideia de C entra na cena 2 ("…os gargalos também não").

## 8. Direção criativa V2: "Do caos ao mapa"
- **Personalidade preservada:** escuro cinematográfico com brilho verde-azulado (cenas 1–2).
- **Produto como prova:** a interface real é a protagonista, em close, dentro de uma janela própria e com rolagem suave.
- **Sistema gráfico:** IBM Plex Sans, acento `#40C8D6`, navy da marca, rótulos de etapa 1/3–3/3 (a jornada real do app) e selo âmbar de dados fictícios.
- **Evitar:** efeitos gratuitos, interface gerada por IA e texto longo na tela (no máximo 2 linhas por legenda).

## Fontes
- [ElevenLabs: posso publicar o conteúdo gerado?](https://help.elevenlabs.io/hc/en-us/articles/13313564601361)
- [Argil: especificações de Reels 2026](https://argil.ai/blog/instagram-reel-size-e350f)
- [Quso: dimensões de Reels](https://quso.ai/blog/instagram-reel-dimensions)
- [ZenABM: boas práticas de vídeo no LinkedIn](https://zenabm.com/blog/linkedin-video-ads-best-practices)
- [Storykit: o que o LinkedIn recomenda](https://storykit.io/blog/linkedin-video-ads-best-practices)
- [VibrantSnap: vídeos de produto](https://www.vibrantsnap.com/blog/product-marketing-videos)
- [Atomik Growth: formatos de lançamento](https://www.atomikgrowth.com/blog/the-tech-launch-video-formats-that-actually-work)
