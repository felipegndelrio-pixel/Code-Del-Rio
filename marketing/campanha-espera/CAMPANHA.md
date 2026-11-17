# NexoProcess · Campanha "A espera invisível" (Instagram) — v1.0

17/11/2026 · Produção em `marketing/campanha-espera/` · **Nada publicado.**

**Resumo em uma linha:** a campanha não vende "uma ferramenta de BPM". Ela mostra uma verdade que qualquer gestor reconhece — *às vezes o problema não é o trabalho, é a espera* — e prova isso com a tela real do NexoProcess.

Rótulos: **FATO** (verificado em fonte ou no código) · **INFERÊNCIA** (conclusão minha a partir de fatos) · **HIPÓTESE** (a testar) · **A VALIDAR** (depende de você ou de dado que não tenho).

---

## 1. Diagnóstico do produto e do público

### O que o NexoProcess faz (FATO, conferido em `apps/nexoprocess/README.md` e `src/config/brand.ts`)
- Entrada por **assistente conversacional** ou **planilha XLSX/CSV**. Não exige saber BPMN ou Lean.
- **Mapa BPMN 2.0 desenhado automaticamente**, com destaques de gargalo, retrabalho e etapa crítica, **com o motivo**.
- **Diagnóstico Lean** com fórmulas à vista. Cada número tem origem marcada: *Informado*, *Calculado* ou *Estimado*.
- **Recomendações por regras, sem IA generativa:** cada uma mostra evidência (fato/inferência), regra e hipótese a validar.
- **Cenário futuro e comparação** atual × futuro (tempo, esforço, custo, capacidade). "Estimativa nunca vira economia realizada."
- **Plano de ação** com responsável, prazo e critério de sucesso (nunca preenchidos automaticamente). Resultados reais, riscos/FMEA, RACI.
- **Exportações:** BPMN XML, SVG/PNG, XLSX, CSV, relatório em PDF.
- **Privacidade:** roda no navegador. Os dados ficam no aparelho; nada é enviado a servidores por padrão.
- **Limites declarados:** sem login, sem multiusuário, sem IA generativa. "NexoProcess" é codinome, com validação de marca pendente.

### Diferenciais mais fortes (INFERÊNCIA)
| Diferencial | Por que importa |
|---|---|
| Da planilha ao mapa, sem saber BPMN | Tira a barreira técnica que afasta gestores |
| Cada número com origem visível | Confiança: dá para defender o número na reunião |
| Recomendação explicada, sem caixa-preta | Em 2026, transparência é argumento contra o excesso de "IA" |
| Do mapa ao plano, na mesma jornada | O diagnóstico não morre no slide |
| Dados ficam no aparelho | Remove a objeção de dado sensível |

### Problemas que resolve
- Processos que existem só na cabeça de quem executa.
- Esperas, retrabalho e gargalos que ninguém mede.
- Ideias de melhoria sem evidência.
- Planos sem dono e sem prazo.

### Público e motivação de compra (HIPÓTESE)
| Público | O que move a compra |
|---|---|
| Gestor de operações/processos (média empresa) | Provar onde está o problema antes de pedir investimento |
| Consultor e analista de processos | Entregar diagnóstico mais rápido e com cara profissional |
| Dono de pequena empresa | Enxergar o próprio negócio sem contratar consultoria |
| Gerente de projetos | Base clara para o plano de ação |

### Demonstrações visuais mais fortes (do que existe hoje)
1. Os números do exemplo: **2 h 15 min de trabalho × 11 h de espera por execução**, ambos marcados "Calculado" (tela de comparação).
2. O mapa com "1 gargalo" e "1 retrabalho" destacados.
3. O plano: "Definir SLA de 2 h para a análise manual de crédito · Problema: Espera de 8 h".
4. **Lacuna:** não há gravação do momento "planilha → mapa". É a demonstração mais forte do produto e precisa ser gravada (ver item 12).

### Objeções e barreiras
| Objeção | Resposta disponível |
|---|---|
| "Já uso Excel/Visio/Bizagi" | Parte da planilha que você já tem |
| "BPMN é complicado" | Não precisa saber BPMN |
| "Meus dados são sensíveis" | Ficam no aparelho |
| "Tem IA?" | Não tem IA generativa: as regras estão à vista |
| "Funciona para o meu time todo?" | **Não hoje:** sem login e sem multiusuário |
| "Quanto custa?" | **A VALIDAR:** preço não está no repositório |

### Por que alguém compartilharia (INFERÊNCIA)
Porque a ideia não é sobre o software. "11 h parado, 2 h trabalhando" é uma situação que todo gestor e todo cliente já viveu. Quem assiste pensa em alguém: o chefe, o time, o fornecedor. É isso que gera envio por mensagem, o sinal que mais pesa para alcançar não seguidores (seção 3).

### O que não sei (A VALIDAR)
Perfil (@) do Instagram, número de seguidores, desempenho dos posts anteriores, preço, página de venda, depoimentos e resultados de clientes. **Não usei nenhum desses dados, porque não os tenho.**

---

## 2. Benchmark competitivo

**Limite do método:** este ambiente não acessa o Instagram. As observações vêm de análises e reportagens sobre as marcas, não de assistir aos perfis. Datas de publicação: incluídas quando a fonte informa.

| Marca | Observação (fonte) | Interpretação para o NexoProcess |
|---|---|---|
| **ClickUp** | Mantém uma marca de comédia separada ("ClickUp Comedy"), com sala de roteiristas semanal, formatos e personagens repetidos. O produto não some nem nas tendências. ([Content Ideas](https://contentideas.substack.com/p/clickup-comedy) · [Muse by Clio](https://musebyclios.com/creators/how-clickup-became-the-snl-of-project-management-platforms/) · [Castmagic](https://www.castmagic.io/podcast/the-playbook-behind-clickups-4b-content-engine)) | Formato reconhecível em série vale mais que um post isolado. "A espera invisível" foi desenhada para virar série. |
| **monday.com** | Vídeos curtos e levemente absurdos sobre caos no trabalho (prazos perdidos, planilhas espalhadas) antes de mostrar o produto. Campanhas com lhamas cantando e sobre o receio de IA no trabalho. ([Lilach Bullock](https://www.lilachbullock.com/monday-com-marketing-strategy/) · [DesignRush](https://news.designrush.com/monday-com-singing-llamas-bring-love-to-work-systems-in-whimsical-new-campaign) · [Mediaweek](https://www.mediaweek.com.au/brand-campaigns/monday-com-brings-ai-had-the-time-of-my-life-to-ease-workplace-ai-angst)) | O problema reconhecível vem primeiro; o produto entra como resolução. |
| **Asana** | Nomeou um inimigo: o "work about work" (trabalho sobre o trabalho). Campanha com clientes reais. ([Asana](https://asana.com/inside-asana/brand-campaign)) | Dar nome ao inimigo cria memória. O nosso inimigo é **a espera**. |
| **Notion** | Crescimento apoiado em criadores, embaixadores e modelos compartilháveis. Conteúdo com depoimentos, tutoriais e modelos. ([First Round](https://review.firstround.com/how-notion-does-marketing-a-deep-dive-into-its-community-influencers-growth-playbooks/) · [#paid](https://hashtagpaid.com/banknotes/how-notion-is-using-creators-to-glamorize-productivity) · [Ordinal](https://www.tryordinal.com/blog/deep-dive-notions-slow-growth-social-media-strategy)) | Algo útil para salvar e passar adiante amplia o alcance sem anúncio. |
| **Miro** | Distribui modelos prontos, inclusive para planejar conteúdo de Instagram. ([Miro](https://miro.com/templates/social-media-content-templates/)) | O modelo é distribuição. Próximo passo: um modelo de planilha do NexoProcess. |
| **Lucidchart / Process Street** | Comunicação centrada em modelos de mapa de processo e checklists, com forte presença em busca. ([Lucid](https://lucid.co/diagram/process-map/templates) · [Process Street](https://www.process.st/templates/social-media/) · [Zapier, 2026](https://zapier.com/blog/process-mapping-tools/)) | INFERÊNCIA: as ferramentas de mapeamento falam com quem já sabe mapear. Ninguém fala do **custo invisível** para o gestor leigo. Esse é o espaço livre. |

**Padrões que valem copiar (sem copiar a comunicação):** nomear um inimigo, abrir com o problema, provar com o produto, criar série e dar algo útil para salvar.
**O que não copiar:** a comédia com atores (custo alto e marca ainda sem rosto) e o tom genérico de "produtividade".

---

## 3. Como o Instagram distribui (com fontes)

| Rótulo | O que se sabe | Fonte e data |
|---|---|---|
| FATO (declaração) | Os principais sinais de ranking são **tempo de exibição, curtidas por alcance e envios por alcance**. Curtidas pesam um pouco mais com seguidores; envios, um pouco mais com não seguidores ("slightly"). | Vídeo de Adam Mosseri, jan/2025, citado por [Kompozy](https://kompozy.io/news/instagram-mosseri-ranking-signals-guidance) e [ZoomSphere](https://www.zoomsphere.com/blog/instagram-algorithm-2026-what-actually-gets-reach) |
| A VALIDAR | "Envio vale 3 a 5 vezes a curtida". Não aparece na fala original. | [Blckalpaca](https://blckalpaca.at/en/knowledge-base/social-media/social-media-algorithms-distribution/instagram-algorithm-2026) |
| FATO | Cada superfície (Feed, Reels, Explorar) tem seu próprio sistema de ranking. | [Hanami](https://hanamisocial.com/en/blog/instagram-reels-algorithm-2026/) |
| FATO | Novas métricas: **taxa de pulo** (quem desliza nos primeiros segundos) e **gráfico de retenção** dos Reels. | Anúncio no fim de 2025: [Social Media Today](https://www.socialmediatoday.com/news/instagram-adds-retention-insights-reels/758464/), [Techedt (27/11/2025)](https://www.techedt.com/instagram-introduces-retention-metrics-to-help-creators-improve-reels-performance), [Inro (abr/2026)](https://www.inro.social/blog/instagram-insights-update) |
| FATO | "Visualizações" substituiu "impressões" e "reproduções" (abr/2025). | [SocialPilot](https://www.socialpilot.co/de/instagram-marketing/instagram-views-metrics-changes) |
| FATO | Conteúdo original tem prioridade. A regra de 2024 (Reels) foi ampliada a fotos e carrosséis em 30/04/2026: contas que só repostam perdem a recomendação. | [Engadget (2024)](https://www.engadget.com/instagrams-algorithm-overhaul-will-reward-original-content-and-penalize-aggregators-130018977.html) · [PetaPixel (30/04/2026)](https://petapixel.com/2026/04/30/new-instagram-policies-target-reposted-content/) · [Diretrizes de originalidade](https://creators.instagram.com/original-content-guidelines/) |
| FATO | O **Status da conta** mostra se a conta pode ser recomendada a não seguidores. Se a conta estiver inelegível, nada dela é recomendado. | [Instagram Help](https://help.instagram.com/539126347315373) · [Instagram Creators](https://creators.instagram.com/blog/instagram-recommendations-eligibility-tips-creators) · [TechCrunch (07/12/2022)](https://techcrunch.com/2022/12/07/instagrams-new-transparency-tools-will-tell-you-if-your-content-is-ineligible-to-be-recommended/) |
| FATO | **Reels de teste** (Trial Reels) mostram o vídeo só a não seguidores antes de ir ao perfil. Lançados em dez/2024. | [Business Standard (11/12/2024)](https://business-standard.com/technology/tech-news/instagram-introduces-trial-reels-feature-what-it-is-how-it-works-more-124121100429_1.html) · [Social Media Today](https://www.socialmediatoday.com/news/instagram-launches-trial-reels-for-audience-sampling/735136/) |
| A VALIDAR | Mínimo de 1.000 seguidores, janela de 24 a 72 h e promoção automática aos seguidores. As fontes divergem. | [Postfast](https://postfa.st/blog/instagram-trial-reels) · [MakeInfluence](https://www.makeinfluence.com/en/academy/instagram-trial-reels-testing-content-on-non-followers-first-and-what-it-means-for-sponsored-content) |
| FATO (declaração) | Hashtags **não aumentam o alcance**; ajudam a classificar o assunto. Palavras-chave importam mais. | Mosseri, 2025: [Magnetic (abr/2025)](https://magneticmag.com/2025/04/instagrams-ceo-finally-explained-the-algorithm-heres-what-it-means-for-djs-artists-and-indie-music-pages/) · [Storyboard18 (nov/2025)](https://storyboard18.com/digital/explained-are-hashtags-really-irrelevant-83474.htm) |
| FATO | Desde 10/07/2025, posts públicos de contas profissionais podem aparecer no Google. A legenda é o principal texto indexado. | [Metricool](https://metricool.com/instagram-indexing-on-google/) · [Search Engine World](https://www.searchengineworld.com/its-live-instagram-posts-are-ranking-and-showing-in-google-and-bing-seo-meets-social) |
| FATO | A grade do perfil passou a 3:4 em jan/2025. A capa precisa funcionar nesse recorte. | [Lindsey Gamble](https://www.lindseygamble.com/blog/instagrams-shift-to-vertical-a-vertical-profile-grid-and-more-vertical-first-experiences) · [Planoly (jan/2025)](https://planoly.com/blog/instagram-updates-jan-2025) |
| FATO | **Colabs:** o post aparece nos dois perfis depois que o convidado aceita. | [Instagram Help](https://help.instagram.com/iphone-app/5861247717337470) |
| INFERÊNCIA | Não existe "melhor horário" universal: teste o seu. | [Expert Beacon](https://expertbeacon.com/best-times-to-post-on-instagram/) · [Shopify](https://www.shopify.com/ca/blog/time-post-instagram) |

**Nenhum "algoritmo secreto".** O Instagram não publica os pesos. A estratégia abaixo usa sinais observáveis e testes medidos.

### Qual sinal importa em cada etapa
| Etapa | Pergunta | Sinal no Insights |
|---|---|---|
| 0. Elegibilidade | O vídeo pode ser recomendado? | Status da conta; conteúdo original, sem marca d'água |
| 1. Teste inicial | As pessoas param? | Taxa de pulo, retenção nos 3 primeiros segundos |
| 2. Expansão | Vale mostrar a mais gente? | Tempo médio, retenção, envios/alcance, curtidas/alcance, salvamentos |
| 3. Descoberta | Chega a quem não segue? | % do alcance em não seguidores |
| 4. Interesse | Vira seguidor e visita? | Visitas ao perfil, seguidores por alcance, cliques no link |
| 5. Negócio | Vira interesse real? | Visitas à página de venda, mensagens qualificadas, vendas |

---

## 4. Três conceitos criativos

### Conceito 1 — "A espera invisível"
- **Ideia:** às vezes o problema não é o trabalho. É a espera.
- **Gancho (0–2 s):** "Este pedido ficou **11 h** parado." Relógio batendo.
- **Problema:** o tempo parado não aparece em lugar nenhum.
- **Virada:** a barra de espera se parte em pedaços e vira o mapa do processo.
- **Produto real:** mapa com gargalos → tabela com "Calculado" → plano de ação.
- **Gatilho:** intelectual ("nunca tinha pensado assim") e reconhecimento.
- **Frase final:** "Às vezes, o problema não é o trabalho. É a espera."
- **CTA:** "Descubra onde o seu processo espera — link na bio."

### Conceito 2 — "Três versões do mesmo processo"
- **Ideia:** pergunte a três pessoas como o processo funciona e ouça três respostas diferentes.
- **Gancho:** três frases contraditórias na tela, uma sobre a outra: "Chega por e-mail." "Não, pelo WhatsApp." "Depende do cliente."
- **Problema:** cada um enxerga um pedaço.
- **Virada:** as três versões se fundem em um mapa único, gerado da planilha.
- **Produto real:** importação da planilha → mapa automático.
- **Gatilho:** reconhecimento com humor leve.
- **Frase final:** "Um processo. Uma versão."
- **CTA:** "Mande para quem descreve o processo diferente de você."

### Conceito 3 — "Sem caixa-preta"
- **Ideia:** toda ferramenta diz que usa IA. Esta mostra a conta.
- **Gancho:** "De onde veio essa recomendação?" sobre um card de sugestão.
- **Problema:** recomendações que não dá para defender na reunião.
- **Virada:** zoom nas etiquetas "Fato", "Inferência", "Hipótese a validar" e "Calculado".
- **Produto real:** tela de Oportunidades e do Diagnóstico.
- **Gatilho:** ceticismo em relação à IA; confiança.
- **Frase final:** "Recomendação boa é a que você consegue explicar."
- **CTA:** "Veja como cada número é calculado — link na bio."

---

## 5. Matriz de decisão ponderada

Notas de 1 a 5. São **HIPÓTESE** (julgamento estratégico), a confirmar nos testes da seção 9.

| Critério (peso) | C1 Espera | C2 Versões | C3 Caixa-preta |
|---|---|---|---|
| Parar a rolagem (15) | 5 | 4 | 4 |
| Relevância para o público (15) | 5 | 5 | 3 |
| Originalidade (10) | 4 | 4 | 4 |
| Potencial de envio (15) | 5 | 4 | 3 |
| Retenção (10) | 4 | 4 | 3 |
| Memória de marca (10) | 5 | 4 | 4 |
| Entendimento do produto (10) | 4 | 3 | 4 |
| Conversão (10) | 4 | 3 | 4 |
| Viabilidade com o que existe (5) | 5 | 2 | 4 |
| **Total (de 100)** | **92** | **77** | **72** |

Conta: soma de (nota × peso) ÷ 5. Ex.: C1 = (75+75+40+75+40+50+40+40+25) ÷ 5 = 92.

**Sensibilidade:** C1 continua na frente mesmo com o dobro de peso em originalidade. C2 só venceria com viabilidade fora da conta, porque depende de uma gravação da importação que ainda não existe.

---

## 6. Conceito vencedor: "A espera invisível"

**Por quê:**
1. **Envio:** a frase é universal e leva o espectador a pensar em alguém. Envio é o sinal mais ligado a não seguidores.
2. **Prova:** todos os números do gancho estão na tela real, marcados "Calculado" (exemplo fictício).
3. **Marca:** dá ao NexoProcess um inimigo próprio (a espera), como o "work about work" da Asana.
4. **Série:** rende episódios ("A espera invisível #2: o retrabalho").
5. **Viável hoje:** usa só capturas que já existem.

**Plataforma de marca:** *NexoProcess mostra o tempo que ninguém vê.*

---

## 7. Storyboard do Reel (9:16, 25,2 s, 30 qps)

Arquivos: `exports/NexoProcess_Espera_Reel_A.mp4` (gancho com números) e `_B.mp4` (gancho com pergunta). Cortes nos tempos fortes de 100 BPM (0,6 s).

**0,0–2,4 s · Gancho**
- **Tela:** A: "Este pedido ficou **11 h** parado." (11 h em âmbar, gigante) · B: "Quanto do seu processo é **espera?**". Etiqueta no topo: "Exemplo fictício · calculado no NexoProcess".
- **Movimento:** o texto já está na tela no 1º quadro e assenta com zoom sutil. A barra âmbar cresce em 4 degraus, um por batida do relógio.
- **Som:** relógio + golpe grave no quadro 0.
- **Locução opcional (fundador):** "Esse pedido ficou onze horas parado."
- **Função:** parar a rolagem com um número concreto (A) ou uma pergunta pessoal (B).

**2,4–5,4 s · Contraste**
- **Tela:** A: "E só **2 h 15 min** sendo trabalhado." · B: "Neste pedido: 11 h parado. 2 h 15 min trabalhando." Abaixo, a barra teal cresce a 20% da âmbar. Legendas: "11 h · espera" e "2 h 15 min · trabalho". Nota: "Por execução · exemplo fictício".
- **Som:** golpe no corte; o relógio continua.
- **Locução:** "E só duas horas e quinze sendo trabalhado."
- **Função:** o choque da proporção.

**5,4–7,2 s · Pergunta aberta**
- **Tela:** "Onde ele fica **parado?**" A barra âmbar se parte em 4 pedaços que sobem para fora da tela.
- **Som:** subida de tensão; respiro de silêncio antes do corte.
- **Função:** criar a curiosidade que segura até a resposta.

**7,2–11,4 s · Mapa (tela real)**
- **Tela:** "O mapa mostra onde ele **trava.**" Painel com o mapa real. Destaques âmbar pulsam em "1 gargalo" (Análise de crédito) e "1 gargalo · 1 retrabalho" (Separação). Abaixo: "Gargalo e retrabalho destacados no fluxo, com o motivo."
- **Câmera:** aproximação lenta até Análise de crédito e Separação.
- **Som:** impacto e entrada do pulso; um "ping" em cada destaque.
- **Função:** primeira prova do produto.

**11,4–15,0 s · Origem dos números (tela real)**
- **Tela:** "Cada número tem **origem.**" Tabela real "Impacto da melhoria". Destaque teal na linha de trabalho (2 h 15 min), âmbar na de espera (11 h) e nos selos "Calculado". Abaixo, as mesmas duas barras do gancho e "Base: calculado a partir dos dados do processo."
- **Câmera:** aproximação até as linhas.
- **Função:** fechar o ciclo: o número do gancho é real (do exemplo) e calculado. É o diferencial de transparência.

**15,0–18,6 s · Ação (tela real)**
- **Tela:** "E vira **ação.**" Plano real: "Definir SLA de 2 h para a análise manual de crédito · Problema: Espera de 8 h…", com "Em andamento", "Alta", responsável e data. Abaixo: "Com problema, responsável e prazo."
- **Câmera:** desce suavemente até o primeiro card.
- **Função:** mostrar que o diagnóstico vira trabalho.

**18,6–21,6 s · Tese**
- **Tela:** "Às vezes, o problema não é o trabalho." Em 20,4 s, o relógio **para**: silêncio curto, impacto, "**É a espera.**" em âmbar.
- **Som:** só o relógio, cada vez mais presente; parada seca; impacto.
- **Função:** a frase que as pessoas repetem e enviam.

**21,6–25,2 s · Marca**
- **Tela:** o símbolo se desenha, "NexoProcess", "Descubra onde o seu processo **espera.**", botão "Conheça · link na bio" e "Telas reais do app · dados fictícios".
- **Som:** resolução em Ré maior e a **assinatura de três notas** do filme "Do caos à clareza" (o mesmo som de marca).
- **Função:** lembrança da marca e CTA.

**Roteiro de locução opcional (gravado pelo fundador, voz própria):** "Esse pedido ficou onze horas parado. E só duas horas e quinze sendo trabalhado. Onde ele fica parado? O mapa mostra. E cada número diz de onde veio. Daí sai o plano: com problema, responsável e prazo. Às vezes, o problema não é o trabalho. É a espera." Recomendo testar a versão com voz como uma terceira variação.

---

## 8. Copy final

**Gancho na tela:** A: "Este pedido ficou 11 h parado." · B: "Quanto do seu processo é espera?"

**Legenda principal**
```
Este pedido ficou 11 h parado. E só 2 h 15 min sendo trabalhado.

Às vezes, o problema não é o trabalho. É a espera.

Gestão de processos começa por enxergar isso. No NexoProcess, você descreve o processo ou importa a planilha, vê o mapa com os gargalos, entende de onde vem cada número e transforma tudo em um plano de ação.

O exemplo do vídeo é fictício. As telas são reais.

E no seu processo: em qual etapa o trabalho mais espera?

Link na bio.

#gestaodeprocessos #mapeamentodeprocessos #melhoriacontinua #lean #nexoprocess
```

**Legenda alternativa (curta, para o teste B)**
```
Quanto do seu processo é trabalho de verdade?

Neste exemplo: 11 h de espera e 2 h 15 min de trabalho, por execução. O NexoProcess mostra onde o pedido trava e transforma isso em ação.

Exemplo fictício · telas reais. Link na bio.

#gestaodeprocessos #lean #melhoriacontinua
```

**CTA principal:** "Descubra onde o seu processo espera — link na bio."
**CTA alternativo:** "Salve para usar na próxima reunião de processo."

**Título da capa:** A: "11 h parado. 2 h 15 min trabalhando." · B: "Quanto do seu processo é espera?"

**Palavras-chave (SEO do Instagram e do Google):** gestão de processos · mapeamento de processos · melhoria de processos · gargalo · tempo de espera · retrabalho · lean · BPMN · plano de ação · eficiência operacional. Use-as na legenda e no campo "nome" do perfil, não só em hashtags.

**Hashtags:** 3 a 5, descritivas (elas ajudam a classificar, não a alcançar).

**Comentário fixado**
```
De onde vêm os números: é um exemplo fictício de processamento de pedido. O próprio NexoProcess calcula o tempo de trabalho e o de espera a partir das durações e das esperas informadas em cada etapa.

E aí: qual etapa do seu processo mais espera?
```

**Conformidade (CDC/Conar):** sem promessa de resultado, sem número de cliente, com aviso de exemplo fictício na tela, na legenda e no comentário. Em parceria paga com criador, a identificação publicitária é obrigatória (#publi ou rótulo de parceria paga). **A VALIDAR:** página de venda e política de arrependimento de 7 dias na Hotmart.

---

## 9. Instruções de produção visual

| Item | Regra |
|---|---|
| Paleta | Fundo `#03060c`, profundidade navy `#173263`, **âmbar `#f5b84a` = espera** (o problema), **teal `#3fd0de`/`#00A8BC` = trabalho e ação** (a marca). O âmbar nunca aparece na marca. |
| Tipografia | IBM Plex Sans: 700 em títulos, 600 em rótulos, 400 em apoio. Número de impacto em corpo gigante (11 h ≈ 370 px). |
| Composição | Alinhada à esquerda, x de 72 a 930. Conteúdo essencial entre y 250 e 1.480 (fora da área de legenda e dos botões do Reels). |
| Telas do app | Só capturas reais, em moldura com borda teal fina e sombra. Destaque por contorno pulsante, nunca escondendo a interface. |
| Movimento | Palavras entram com desfoque (0,4 s). Painéis sobem e assentam (0,55 s). Câmera até 1,7× de aproximação, sempre lenta. |
| Luz | Brilho radial navy e teal discreto, granulação leve, vinheta. Sem partículas e sem neon. |
| Transições | Cortes nos tempos fortes. Dois clarões apenas: entrada do produto (7,2 s) e "É a espera." (20,4 s). |
| Hierarquia | Uma ideia por cena: título → prova (tela) → frase de apoio. |
| Marca | Nome discreto desde o 1º quadro ("calculado no NexoProcess"); símbolo e nome só no fim; assinatura sonora de três notas. |
| Capa | Mensagem dentro do recorte 3:4 (grade) e 4:5 (feed): y de 300 a 1.620. |

Código de produção: `scripts/espera.cjs` (vídeo), `scripts/espera_sound.py` (trilha), `scripts/pecas.cjs` (capas e Stories). Instruções no `README.md`.

---

## 10. Distribuição orgânica

### Antes de publicar
1. **Status da conta:** confirmar que a conta pode ser recomendada a não seguidores. *Por quê:* sem isso nada chega a quem não segue.
2. **Perfil:** conta profissional; nome com palavra-chave ("NexoProcess · Gestão de processos"); bio com a promessa ("Mostra o tempo que ninguém vê no seu processo") e o link com UTM. *Por quê:* o nome entra na busca; o link medido separa curiosidade de interesse.
3. **Fixar** no perfil: este Reel, o carrossel "O fio" e o filme "Do caos à clareza".
4. **Capa:** subir a capa A e conferir o recorte 3:4 na grade.

### Publicação e teste de horário
1. **Se houver Reels de teste:** publicar A como teste num dia e B no seguinte. Comparar taxa de pulo, tempo médio e envios por alcance entre não seguidores. Publicar o vencedor para os seguidores.
2. **Sem Reels de teste:** publicar A. Guardar B para uma segunda rodada com outro título, depois de 7 dias.
3. **Horário (HIPÓTESE):** testar duas janelas em semanas diferentes (por exemplo, almoço em dia útil e começo da noite). Comparar alcance em 24 h. Manter o resto igual.

### Stories de apoio (em `exports/stories/`)
| Quando | Story | Figurinha nativa |
|---|---|---|
| Dia 0, após publicar | 1 · Chamada ("11 h parado…") | Compartilhar o Reel no Story |
| Dia 1 | 2 · "No seu processo, o que pesa mais?" | Enquete: "Trabalho" / "Espera" |
| Dia 2 | 3 · "Qual etapa mais espera?" | Caixa de pergunta |
| Dia 3 | 4 · "Descubra onde o seu processo espera." | Link (com UTM) |

As áreas vazias das imagens são o lugar das figurinhas. Respostas da caixa de pergunta só viram conteúdo de forma agregada, sem identificar ninguém (LGPD).

### Comunidade, envios e parcerias
- **Comunidade:** comentar com conteúdo (não com "ótimo post") em perfis de gestão, Lean e operações, 15 minutos por dia. Nunca colar link.
- **Envios:** mandar o Reel, um a um, só para quem realmente se interessa pelo tema. Nada de envio em massa.
- **Colab:** convidar 1 consultor ou professor de processos/Lean (microcriador) para coautoria. Critérios: público de gestores, conteúdo próprio e sem histórico de compra de seguidores. Se pago, identificar como publicidade.
- **LinkedIn:** publicar o mesmo vídeo de forma nativa, com legenda adaptada (o link funciona na legenda).

### Comentários
Responder todos nas primeiras horas, com substância. Fixar o comentário da seção 8. Transformar perguntas em próximos conteúdos. Ocultar spam.

**Proibido:** comprar seguidores ou interações, grupos de engajamento, automação de curtidas e comentários, envio em massa de mensagens.

---

## 11. Plano de medição (primeiras 24 h e depois)

### Funil de métricas
| Etapa | Métrica | Tipo |
|---|---|---|
| Atenção | Taxa de pulo; retenção aos 3 s | Diagnóstico do gancho |
| Retenção | Tempo médio; % que chega a 21,6 s (marca); repetições | Diagnóstico do vídeo |
| Ressonância | Envios ÷ alcance; salvamentos ÷ alcance; curtidas ÷ alcance; comentários | Sinal de distribuição |
| Descoberta | % do alcance em não seguidores | Sinal de distribuição |
| Interesse | Visitas ao perfil ÷ alcance; seguidores ÷ visitas; cliques no link | **Resultado de marca** |
| Negócio | Visitas à página (UTM); mensagens qualificadas; vendas | **Resultado de negócio** |

**Vaidade × negócio:** visualizações e curtidas sozinhas são vaidade. O sucesso desta campanha é medido por **novos seguidores por alcance, cliques no link e mensagens qualificadas**.

### Rotina de 24 h
| Momento | O que anotar | Decisão |
|---|---|---|
| 1 h | Visualizações, taxa de pulo, envios | Responder comentários; não apagar nem repostar |
| 3 h | Retenção (onde cai), % não seguidores | Se a queda for no gancho, preparar o B |
| 24 h | Funil completo | Comparar com a média dos seus últimos Reels |

**Referência:** sem os seus números anteriores, não há meta absoluta. A régua é a mediana dos seus últimos Reels (**A VALIDAR**: preciso desses dados). Não invento benchmark.

### Hipóteses e testes A/B (uma variável por vez)
| Hipótese | Teste | Métrica de decisão |
|---|---|---|
| H1: número concreto segura mais que pergunta | Reel A × B | Taxa de pulo, tempo médio |
| H2: a voz do fundador aumenta a retenção | A com e sem locução | Tempo médio, % até o fim |
| H3: "salve" gera mais salvamento que "link na bio" sem perder cliques | Legenda principal × alternativa | Salvamentos/alcance, cliques |
| H4: capa com números leva mais cliques na grade que capa com pergunta | Capa A × B, em semanas diferentes | Visitas ao perfil → reproduções |
| H5: insight vence transparência | Conceito 1 × Conceito 3 (próxima semana) | Envios/alcance, seguidores/alcance |

---

## 12. Próximos três conteúdos

1. **Carrossel "3 perguntas para achar a espera no seu processo"** (salvável). Fecha o CTA alternativo e alimenta salvamentos.
2. **Reel "Da planilha ao mapa"**: gravação real da importação do XLSX virando mapa. É a demonstração mais forte do produto e ainda não existe. Posso gravá-la com o próprio app, em ambiente local, com o exemplo fictício.
3. **Reel "Sem caixa-preta"** (Conceito 3): de onde vem cada recomendação. Testa o diferencial de transparência contra o de insight.

Série: "A espera invisível #2 — o retrabalho" pode reaproveitar todo o motor do vídeo.

---

## Revisão red team (antes da entrega)

| Pergunta | Resposta honesta | Correção aplicada |
|---|---|---|
| Quem não conhece para de rolar? | **HIPÓTESE:** sim, número concreto + relógio. Risco: "pedido" pode soar como e-commerce | Versão B com pergunta universal, para teste |
| Entende o produto sem explicação? | Em parte: mapa, tabela e plano aparecem; o "da planilha ao mapa" não | Próximo Reel cobre a lacuna |
| Tem motivo para enviar? | Sim: a frase-tese fala do chefe, do time, do fornecedor | Tese isolada em tela própria, com silêncio antes |
| Mostra um diferencial real? | Sim: número com origem ("Calculado") e gargalo com motivo | Cena dedicada à origem dos números |
| Os 2 primeiros segundos funcionam? | Texto legível desde o 1º quadro; som no quadro 0 | Sem fade de entrada |
| Parece original? | O tema "espera" não aparece no benchmark | Paleta âmbar × teal própria da campanha |
| CTA tem função clara? | Um CTA por peça, ligado à frase final | "Descubra onde o seu processo espera" |
| Toda afirmação é verificável? | Sim. Os números são do exemplo fictício, visíveis na tela e marcados | Aviso na tela, na legenda e no comentário |
| Dá para produzir com o que existe? | Sim: tudo foi produzido aqui | — |

**Riscos que continuam abertos**
1. **Marca é codinome (INPI pendente).** Investir em lembrança de um nome que pode mudar é o maior risco estratégico. Recomendo validar o nome antes de qualquer verba paga; o teste orgânico pode seguir.
2. **Texto pequeno na tabela real** (cena de 11,4 s). As barras repetem os números em tamanho legível, mas a tabela em si fica pequena no celular.
3. **Não ouvi a trilha.** Ela foi validada por medição. Ouça antes de publicar.
4. **Reels de teste** podem não estar disponíveis na sua conta.
5. **Sem multiusuário:** se o vídeo atrair equipes, a objeção "e o meu time?" aparece. Prepare a resposta honesta.
