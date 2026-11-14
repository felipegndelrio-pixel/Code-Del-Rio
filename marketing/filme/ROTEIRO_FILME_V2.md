# Filme "A história do NexoProcess" — v2 (56 s)

Formatos: 9:16 (Reels/Shorts), 16:9 (YouTube) e 4:5 (LinkedIn/feed). Sem música: só desenho de som.

## Roteiro
| Tempo | Cena | Texto na tela | Imagem | Som |
|---|---|---|---|---|
| 0,0–4,5 | A data | 19.10.2026 · COMMIT 3F7C92E · "A primeira linha de código do NexoProcess." | Data digitada, clarão horizontal | Subida, teclas, impacto grave em 1,75 s |
| 4,3–8,6 | A pergunta | "Por que tantos processos ainda vivem em planilhas?" | Escritório à noite (Gemini Omni) | Passagem de ar |
| 8,3–12,2 | O problema | "Onde o fluxo não aparece, o gargalo também não." | Fios embaraçados (Gemini Omni) | Tensão grave |
| 11,9–18,0 | A construção | "Linha a linha. Commit a commit." | Os 20 commits reais do app | Teclas |
| 17,7–31,2 | O produto | Assistente guiado → mapa visual → diagnóstico → plano de ação | Telas reais (demonstração fictícia) | Teclas no assistente, passagens |
| 30,9–37,4 | Brasil | "Hoje, no Brasil: disponível na Hotmart." · "E o Google já responde o que é o NexoProcess." | Foto original MacBook + iPhone, recortada, com a gravação original do Google | Batida grave |
| 37,1–43,0 | O mundo | "O próximo capítulo: o mundo." | Globo: Brasil (Hotmart, hoje) → EUA (Gumroad) e Reino Unido (Paddle), em breve | Ar + marcações |
| 42,7–48,6 | Em inglês | "Agora, em inglês." · "Em desenvolvimento para as plataformas internacionais Gumroad e Paddle." | Arquivo real `en.ts` | Teclas, subida |
| 48,3–56,0 | Fechamento | NexoProcess · "Do processo na planilha ao plano de melhoria." · Hotmart / Gumroad / Paddle · "Conheça o NexoProcess" | Logo desenhado, horizonte do globo | Impacto final |

## Fatos e fontes
- **19/10/2026 e commit 3f7c92e:** primeiro commit de `apps/nexoprocess` (`git log --reverse -- apps/nexoprocess`).
- **Commits exibidos:** `git log --reverse -- apps/nexoprocess` (20 registros).
- **Telas do app:** capturas reais da demonstração fictícia do próprio app (selo "Demonstração com dados fictícios").
- **Google:** gravação original de 07/11/2026, sem edição do conteúdo.
- **Hotmart (hoje) e Gumroad/Paddle (em breve):** informação do titular do produto. Origem das empresas: Brasil, EUA e Reino Unido (conhecimento geral; a validar).
- **Globo:** Natural Earth via `world-atlas` (domínio público).

## Marcas e licenças
- Tipografia: Instrument Serif (OFL), IBM Plex Sans/Mono (OFL).
- Ícones Gumroad e Paddle: Simple Icons (CC0 para o conjunto; as marcas pertencem aos donos). Hotmart: recorte do ícone exibido na gravação do Google, em uma cor. **Conferir as regras de uso de marca das três empresas antes de impulsionar.**
- Cenas de escritório e fios: Gemini Omni 1.1 Flash (geradas pelo titular); termos de uso a validar.
- Som: sintetizado por código (`scripts/sound2.py`), sem amostras de terceiros.

## Benchmark aplicado (fontes de terceiros, não oficiais das plataformas)
- Prender nos primeiros 3 s: a digitação começa em 0,4 s e o impacto vem em 1,75 s.
- Texto que funciona sem som: toda a história está nos títulos.
- Abertura cinematográfica como identidade de marca.
Fontes: dev.to/bulkdl (hook nos 3 s), fluxnote.io (retenção em Shorts), graphicdesignjunction.com (tendências de vídeo 2026), filmfont.pages.dev (tipografia de títulos).

## Como refazer
`node scripts/film2.cjs <9x16|16x9|4x5>` → `work/video2_*.mp4`; `python3 -I scripts/sound2.py work/som2.wav`; juntar com FFmpeg.
