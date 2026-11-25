# NexoProcess Goes Global — carrossel de 3 slides (v1.0)

Nada foi publicado. Arquivos em `exports/`, já numerados na ordem de upload.

| Ordem | Arquivo | Papel no carrossel |
|---|---|---|
| 1 | `1_NexoProcess_GoesGlobal_its_today.jpg` | **A notícia:** "It’s today. NexoProcess goes global." |
| 2 | `2_NexoProcess_GoesGlobal_its_the_wait.jpg` | **O gancho que viraliza:** a frase que a pessoa quer mandar para alguém |
| 3 | `3_…_product_instagram.jpg` (ou `_linkedin.jpg`) | **A prova e a ação:** o produto real, com lupa no gargalo, e "Get it on Gumroad" |
| LinkedIn | `NexoProcess_GoesGlobal_LinkedIn_carrossel_3p.pdf` | Os 3 slides como documento (rodapé "Link in the first comment") |

Todos têm 1080×1350. No Instagram o carrossel inteiro segue a proporção do primeiro item, então nenhum slide será cortado.

## Benchmark: o que pesou nas decisões

| Rótulo | Achado | Como apliquei |
|---|---|---|
| FATO (declaração) | Adam Mosseri: um carrossel que a pessoa passou sem deslizar pode voltar para ela **abrindo no segundo slide** ([Uppbeat](https://uppbeat.io/blog/creator-news/whats-working-on-instagram-right-now-carousels-and-sends-says-adam-mosseri) · [CC Startup, 21/10/2024](https://ccstartup.com/blog/2024/10/21/why-instagram-carousels-sometimes-start-on-the-second-slide/)) | O slide 2 funciona sozinho: tem frase, dado e marca. É a "segunda chance" do post |
| FATO (declaração) | Envios por mensagem pesam um pouco mais para alcançar quem não segue (Mosseri, jan/2025) | O slide 2 é uma frase universal ("Sometimes the problem isn’t the work. It’s the wait."), do tipo que se manda para o chefe ou para o time |
| INFERÊNCIA | Conteúdo "relatable" e de opinião está entre os mais compartilhados ([Sked Social](https://skedsocial.com/blog/how-to-increase-your-instagram-post-shareability-in-2026) · [Lia Haberman](https://liahaberman.substack.com/p/icymi-5-types-of-shareable-content)) | Frase de identificação + dado concreto (11 h × 2 h 15 min) |
| FATO (dado de fornecedor) | Carrossel tem a maior taxa de engajamento entre os formatos do Instagram em 2026 ([Socialinsider](https://www.socialinsider.io/pt/social-media-benchmarks/instagram)) | Três slides com a mesma identidade, uma ideia por slide |
| A VALIDAR | Carrossel misto (imagem + vídeo) teria mais engajamento que só imagem (Socialinsider, via [CreatorFlow](https://creatorflow.so/blog/instagram-carousel-posts-guide)) | **Opcional:** acrescente o Reel EN (`campanha-espera/exports/v2_en/1_Instagram_Reel_v2_EN_9x16.mp4`) como slide 4 |
| FATO | Instagram testa curtidas por slide do carrossel ([Storyboard18](https://www.storyboard18.com/brand-marketing/beyond-total-likes-instagram-tests-per-frame-engagement-for-carousels-75876.htm)) | Cada slide precisa ser forte sozinho |

## Legenda — Instagram (EN)
```
It’s today. NexoProcess goes global.

Swipe: sometimes the problem isn’t the work. It’s the wait.

The English edition of NexoProcess is now available on Gumroad, our first international platform. Describe your process or import a spreadsheet, see where it stalls, and turn it into an action plan.

Who on your team needs to see slide 2?

Get it on Gumroad. Link in bio.

#NexoProcess #ProcessImprovement #ProcessMapping #Lean #Operations
```
Ative "AI info" ao publicar: a cena do slide 2 foi gerada com IA.

## Legenda — LinkedIn (EN, com o PDF)
```
It’s today. NexoProcess goes global.

The English edition is now available on Gumroad, our first international platform.

One idea is behind the whole product: sometimes the problem isn’t the work. It’s the wait. In the fictional sample in slide 2, an order spends 11 hours waiting and only 2 h 15 min being worked on.

NexoProcess makes that visible:
• Import the spreadsheet you already have.
• See bottlenecks and rework flagged on the map, with the reason.
• Turn it into an action plan, with owners and due dates set by you.

Made in Brazil. Now in English.

Where does work wait the longest in your process?

#ProcessImprovement #OperationalExcellence #Lean #BPMN
```
**Primeiro comentário:** "Get NexoProcess on Gumroad:" seguido do seu link de compra.

## Por que a pergunta, e não "curta e compartilhe"
- **"Who on your team needs to see slide 2?"** convida a mandar o post, sem pedir curtida. Pedido explícito de curtida é tratado como isca de engajamento pela Meta.
- **"Where does work wait the longest in your process?"** gera comentários de quem trabalha com processos. Esse é o público certo.

## Como foi feito
- **Slide 2:** quadro real da cena que você gerou no AI Studio (quadro 96, centrado). Ampliei, removi duas manchas de luz nas costas e tratei a cor. A etiqueta "Scene: AI-generated" está no rodapé.
- **Slide 3:** o mockup MacBook + iPhone com telas reais em inglês. A lupa amplia o nó "Picking" do mapa real, com as etiquetas "1 bottleneck" e "1 rework", e uma linha liga a lupa ao ponto exato da tela.
- **Reproduzir:** `node marketing/lancamento-global/carrossel/gera_carrossel.cjs`.
