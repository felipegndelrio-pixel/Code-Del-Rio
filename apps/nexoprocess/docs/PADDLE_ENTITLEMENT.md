# Paddle (Billing): segundo canal de venda EN (desenho)

Versão 2, de 06/11/2026, branch `wip/paddle`, base `v2.6.0-rc2` (`5461f40`). Padrão: `GUMROAD_ENTITLEMENT.md`. A v1 (04/11/2026) era rascunho sem fonte oficial; a v2 troca as hipóteses por fatos da documentação oficial da Paddle Billing.
Status: **desenho com fatos oficiais; implementação em `api/_lib/paddle.ts` (P2), sem chamada real, nada publicado, nenhuma migração aplicada fora do G3.** O comportamento PT/Hotmart e o canal Gumroad não mudam.
Pedido: fundador, 06/11/2026 ("avançar em todas as frentes para vender fora do Brasil o quanto antes"). Gumroad continua sendo o canal de lançamento atual.

## 0. Fontes e como foram verificadas

Todas lidas em 06/11/2026, direto em `developer.paddle.com` (cada URL tem uma versão Markdown oficial: o mesmo caminho + `.md`). Não usei a busca de documentação da Paddle (`paddle-docs-retrieval…workers.dev`): o proxy desta sessão a bloqueia.

| # | Página oficial | Para quê |
|---|---|---|
| P1 | https://developer.paddle.com/webhooks/about/signature-verification | cabeçalho, algoritmo, tolerância, rotação |
| P2 | https://developer.paddle.com/webhooks/about/how-webhooks-work | formato do evento, entrega, `event_id`, `occurred_at` |
| P3 | https://developer.paddle.com/webhooks/about/respond-to-webhooks | resposta, retentativas, IPs |
| P4 | https://developer.paddle.com/webhooks/transactions/transaction-completed | evento de transação concluída (schema + exemplo) |
| P5 | https://developer.paddle.com/webhooks/adjustments/adjustment-created e `…/adjustment-updated` | reembolso, chargeback (schema + exemplo) |
| P6 | https://developer.paddle.com/build/transactions/create-transaction-adjustments | regras de reembolso, crédito e chargeback |
| P7 | https://developer.paddle.com/sdks/sandbox | sandbox |
| P8 | https://developer.paddle.com/api-reference/about/paddle-ids | formato dos IDs |
| P9 | https://developer.paddle.com/api-reference/customers/get-customer e `…/about/authentication` | e-mail do cliente; chave de API |
| P10 | https://developer.paddle.com/webhooks/about/notification-destinations e `…/webhooks/simulator/test-webhooks` | destino de notificação, simulador |
| P11 | https://developer.paddle.com/llms.txt (tabela Classic × Billing) | a Billing não entrega chave de licença |
| C1 | Código deste repositório (`api/_lib/schema-purchases.sql`, `gumroad.ts`, `store.ts`) | nosso lado |

**DADO DO USUÁRIO (fundador, 06/11/2026):** a Paddle respondeu que aceita pessoa física no Brasil e que faz a revisão do site no ar. Não verifiquei isso em fonte pública. Impostos e *seller of record* continuam fora dos textos legais EN (D-L2).

## 1. Resumo e recomendação

- **FATO [P4, P5]:** o evento de compra (`transaction.completed`) e os de reembolso/chargeback (`adjustment.created` e `adjustment.updated`) **não trazem o e-mail do comprador**: só `customer_id` (`ctm_…`). O e-mail vem de `GET /customers/{id}` (permissão `customer.read`) [P9] ou do evento `customer.created`.
- **FATO [P11]:** na Paddle Billing a Paddle **não gera chave de licença**: "Build your own workflows using transaction webhooks". A opção C da v1 está descartada.
- **Recomendação (mantida):** concessão **dirigida por webhook assinado** e ativação do comprador por **e-mail + id da transação** (`txn_…`), conferidos contra o banco (§5). Sem chave de licença própria.
- **Escolha de desenho (INFERÊNCIA):** o e-mail é obtido por **chamada autenticada** `GET /customers/{id}` dentro do webhook, não por tabela de clientes alimentada por `customer.created`, porque a ordem de entrega não é garantida [P3] e a tabela exigiria migração maior. Custo: um segredo de servidor a mais (`PADDLE_API_KEY`, só `customer.read`) e uma chamada por evento.
- **Risco aberto de ativação (A VALIDAR):** a doc diz que o recibo por e-mail traz um PDF com a fatura (`invoice_number`), mas **não diz que o `txn_…` aparece** nele [P8, P11]. Antes de vender, abrir um recibo do sandbox e conferir. Plano B no §5.
- **Não recomendo lançar a Paddle antes de a Gumroad vender:** dois canais dobram suporte e conciliação (D-P1).

## 2. Webhook assinado: verificação (FATOS [P1], 06/11/2026)

| Item | Fato oficial |
|---|---|
| Cabeçalho | `Paddle-Signature` |
| Formato | `ts=1671552777;h1=eb4d0dc8…` — duas partes separadas por `;`: `ts` (Unix, segundos) e `h1` |
| Algoritmo | HMAC com SHA-256 sobre `ts` + `:` + **corpo cru** (bytes recebidos, sem reformatar), chave = a *endpoint secret key* do destino, saída em hexadecimal |
| Comparação | o exemplo oficial compara `h1` com o resultado calculado em tempo constante (`timingSafeEqual`) |
| Tolerância | a doc recomenda checar `ts` contra o relógio; o padrão dos SDKs oficiais é **5 segundos**. O exemplo manual rejeita evento mais velho que 5 s |
| Rotação | "Signatures contain at least one `h1`… During secret rotation, more than one `h1` is returned." Logo, aceitar se **qualquer** `h1` bater |
| Segredo | um por destino de notificação; formato de exemplo `pdl_ntfset_…`; fica em Paddle > Events > Notifications (ou `endpoint_secret_key` na API). "Treat it like a password" |
| Corpo | "Don't transform or process the raw body… including adding whitespace": ler os bytes antes de qualquer `JSON.parse` |

Do nosso lado (decisões, INFERÊNCIA):
1. Corpo ≤ 64 KB (`readBodyLimited`), lido como texto uma única vez e usado tanto na assinatura quanto no `JSON.parse`.
2. Assinatura verificada **antes de qualquer leitura de dados**. Inválida, ausente, malformada ou fora da tolerância → **401**, nada gravado, log sem corpo.
3. Segredo ausente → 503 `nao_configurado` e nada gravado (falha fechada).
4. Tolerância padrão **5 s** (o valor do SDK), ajustável por `PADDLE_SIGNATURE_TOLERANCE_SEC`. Vale para atraso e para relógio adiantado (valor absoluto).
5. **A VALIDAR (sandbox):** se cada retentativa é reassinada com `ts` novo. A doc não diz. Se não for, retentativas depois de 5 s seriam recusadas e só o primeiro envio valeria; nesse caso, subir a tolerância. Também **A VALIDAR** se o corpo chega intacto pelas Pages Functions (o desenho lê os bytes crus; teste com payload real do simulador).

## 3. Entrega (FATOS [P2, P3])

- Resposta esperada: HTTP `200` em até **5 segundos** (P3 diz `200`; a página do sandbox diz `2xx`: divergência A ≠ B, usamos exatamente `200`). Outro código ou demora → retentativa.
- Retentativas: **live** até 60 tentativas em cerca de 2 dias (≈10 na 1ª hora, ≈45 no 1º dia; espera `60 × n^1.1` s); **sandbox** 3 tentativas em cerca de 2 minutos. Esgotadas, o status vira `failed` e dá para reenviar pela API (*replay*).
- **Ordem não garantida.** A doc manda comparar `occurred_at` antes de mudar o estado. Entrega **pelo menos uma vez**: deduplicar por `event_id` (`evt_…`).
- Corpo: `event_id`, `event_type`, `occurred_at` (RFC 3339), `notification_id` (`ntf_…`, muda a cada notificação), `data`.
- IPs de origem publicados (live: 34.232.58.13, 34.195.105.136, 34.237.3.244, 35.155.119.135, 52.11.166.252, 34.212.5.7; sandbox: 34.194.127.46, 54.234.237.108, 3.208.120.145, 44.226.236.210, 44.241.183.62, 100.20.172.113). A Paddle recomenda lista de permissão; **não** implementamos filtro por IP no código (Pages Functions atrás da Cloudflare; a assinatura é o controle). Se houver WAF/bot-fight na Cloudflare, liberar o caminho do webhook (P3) — ação do fundador.
- A doc recomenda responder antes de processar. Aqui o processamento é curto (uma consulta de cliente e uma gravação) e fica dentro do prazo, com timeout de 3 s na API da Paddle; falha → 5xx e a Paddle reenvia (idempotente por `provider_event_id`).

## 4. Eventos para tipos canônicos

O SQL classifica pelo **nome** que gravamos (`schema-purchases.sql`, `nexo_apply_purchase_event`), não pelo nome da Paddle. Os campos e valores de `action`, `type` e `status` são FATOS da Paddle [P4–P6]; o mapeamento para os nomes é decisão nossa.

### 4.1 Eventos assinados no destino de notificação (somente estes)
`transaction.completed`, `adjustment.created`, `adjustment.updated`. Todo o resto é ignorado com 200 e log (não grava).

### 4.2 Transação concluída [P4]
- `transaction.completed`: "Transactions move to completed after they're `paid`"; é onde a Paddle termina de calcular taxas, totais e fatura.
- Campos usados de `data`: `id` (`txn_…`), `status` (`completed`), `customer_id`, `currency_code` (`USD`, maiúsculo), `details.totals.grand_total` (texto, **menor unidade**, ex.: `"65215"` = 652,15), `items[].price.product_id` (`pro_…`), `items[].price.id` (`pri_…`), `subscription_id` (só em recorrente), `origin`.
- Grant gravado como `PADDLE_TRANSACTION_COMPLETED` (contém `COMPLETE`, aceito pelo grant).
- Regras: `status` precisa ser `completed`; algum item com `product_id` = `PADDLE_PRODUCT_ID`, senão **ignora** (outro produto); `subscription_id` presente → ignora e loga (produto é pagamento único).

### 4.3 Reembolso, crédito e chargeback [P5, P6]
`adjustment.*` traz `action`, `type` (`full`|`partial`), `status`, `transaction_id`, `customer_id`, `totals.total` (menor unidade) e `currency_code`.

| `action` (FATO) | Significado oficial | O que fazemos | Nome gravado | Tipo canônico |
|---|---|---|---|---|
| `refund`, `status=pending_approval` | "Most refunds for live accounts require Paddle approval" | revoke | `PADDLE_REFUND_PENDING_APPROVAL` | `refund_pending_approval` (acesso mantido pelo SQL) |
| `refund`, `approved`, `type=full` | reembolso do total | revoke | `PADDLE_REFUNDED` | `refunded` |
| `refund`, `approved`, `type=partial` | reembolso de itens/valor | revoke + `refund_amount` | `PADDLE_PARTIAL_REFUND` | `partially_refunded` (mantém acesso); o SQL converte em `refunded` quando a soma dos parciais alcança o valor da compra |
| `refund`, `rejected` | Paddle recusou | ignora (o acesso não foi tirado no pendente) | — | — |
| `chargeback` | "Created automatically… when a customer successfully disputes a charge"; o valor é devolvido | revoke | `PADDLE_CHARGEBACK` | `charged_back` |
| `chargeback_warning` | aviso antecipado; "The amount is refunded" | revoke (**decisão D-P8**) | `PADDLE_CHARGEBACK` | `charged_back` |
| `chargeback_reverse` | "when Paddle contests a chargeback successfully" | revoke, **só se a compra estiver `charged_back`** | `PADDLE_CHARGEBACK_REVERSED` | `chargeback_reverse` → `active` |
| `chargeback_warning_reverse` | reversão do aviso | igual a `chargeback_reverse` | `PADDLE_CHARGEBACK_REVERSED` | idem |
| `credit`, `credit_reverse` | crédito na fatura; não devolve dinheiro | ignora e loga | — | — |

Regras:
- `chargeback`, `chargeback_warning` e as reversões só valem com `status=approved`. O `adjustment.updated` do chargeback original com `status=reversed` (a Paddle marca o original quando cria a reversão) **é ignorado**.
- **Armadilhas (FATO do SQL [C1]):**
  - **Nunca** gravar `PADDLE_DISPUTE_WON`/`…CHARGEBACK_WON`: o nome tem `DISPUTE`/`CHARGEBACK` sem `REVERSE` e vira `charged_back`, **revogando quem ganhou** (mesma armadilha da Gumroad). Disputa ganha = `…CHARGEBACK_REVERSED`.
  - **Nunca** gravar um nome com `CHARGEBACK` + `WARNING`: o SQL o classifica como `chargeback_warning` (mantém acesso). Por isso o aviso é gravado como `PADDLE_CHARGEBACK`.
  - `PADDLE_CREDIT` cairia em `revoke_event_unrecognized` e **bloquearia o e-mail inteiro**: créditos nunca são gravados.
  - Nome com `REFUND` e `PENDING` muda de tipo: nomes fixos, nunca montados com dados do payload.
  - `CHARGEBACK_REVERSED` sem a compra em `charged_back` cria bloqueio de conciliação: a rota lê `nexo_purchase_state` antes (regra C1 da Gumroad); se não estiver `charged_back`, ignora.
- **Compra desconhecida:** o `adjustment.*` não traz o produto. Se `nexo_purchase_state('paddle', txn)` devolver `null`, a transação não é nossa (ou o `transaction.completed` ainda não foi processado): **ignora com 200 e loga**; reembolso sem compra conhecida cai no runbook manual. Risco residual no §10 (P12).
- **Idempotência por estado:** `provider_event_id` = `<adj_id>:<status>` nos ajustes e `event_id` na compra. Assim `adjustment.created` e `adjustment.updated` do **mesmo** estado não contam duas vezes o reembolso parcial.
- **Horário:** `occurred_at` do evento da Paddle nas concessões e nas revogações (a Paddle manda o horário real; ver P2). O SQL ignora evento mais velho (`older_event`) e não ressuscita compra encerrada.
- **A VALIDAR (sandbox):** os valores exatos de `type` em chargebacks e se o `adjustment.updated` de um reembolso aprovado traz `status=approved`.

## 5. Identificadores e formato

- `platform = 'paddle'` (cabe em `^[a-z][a-z0-9_-]{0,31}$`) [C1].
- **FATO [P8]:** todo ID é prefixo + 26 caracteres `[a-z0-9]`: `txn_` (transação, 30 caracteres), `pro_` (produto), `pri_` (preço), `ctm_` (cliente), `adj_` (ajuste), `evt_` (evento), `ntf_` (notificação). Todos cabem em `^[A-Za-z0-9_-]{1,64}$` (transação) e `^[A-Za-z0-9._:-]{1,128}$` (produto). **Sem normalização** (ao contrário da Gumroad). Fora do padrão `^txn_[a-z\d]{26}$` / `^ctm_…` / `^adj_…`: no **webhook** → 200 `ignored` (reenviar não conserta), nada gravado e erro no log (vale o runbook manual); na **ativação**, `transaction_id` fora do padrão → 400 `id_invalido`.
- Guardar `transaction_id` = `txn_…`, `product_id` = `pro_…`.
- `provider_event_id`: ver §4.3 (`evt_…` ou `adj_…:<status>`, ≤ 160 caracteres).
- Valores: `grand_total` e `totals.total` vêm como texto na **menor unidade da moeda** [P4, "lowest denomination"]. Convertemos por `÷ 100`. **A VALIDAR:** moedas sem centavos (ex.: JPY): a doc consultada não trata; só afeta o valor exibido, não a soma dos reembolsos (mesma unidade nos dois lados).
- Moeda: `currency_code` já em maiúsculas (3 letras).

### Como o comprador ativa (opção A, recomendada)
`POST /api/paddle-license` com `{ email, transaction_id }` ou `{ token, transaction_id }` (renovação):
1. `transaction_id` no formato `txn_…`; e-mail normalizado; corpo ≤ 4 KB.
2. O servidor consulta o banco (RPC nova `nexo_purchase_owner`, só `service_role`, devolve e-mail, estado e se há bloqueio aberto) por `platform='paddle'` + transação e compara o e-mail com o digitado. Sem chamada à Paddle na ativação.
3. Resposta de erro genérica (mesma para "não existe", "e-mail diferente" e "revogada"). Atraso do webhook: mensagem "tente de novo em alguns minutos".
4. Renovação confere o banco de novo: revogado por webhook corta na próxima renovação.
- **Compra Paddle não vale só por e-mail (D3).** FATO do código [C1]: `nexo_lookup_license` excluía só `platform <> 'gumroad'`. Troca para `platform not in ('gumroad','paddle')`, dentro de `schema-purchases.sql` (idempotente; o G3 aplica duas vezes), com teste "D3 paddle". As compras Hotmart ficam inalteradas.
- **Plano B se o `txn_…` não aparecer no recibo (A VALIDAR):** aceitar também o `invoice_number` da fatura (existe em `transaction.completed` quando a transação é concluída [P4]); exigiria guardá-lo (migração) e foi deixado fora desta fase. Alternativa sem migração: página de sucesso do checkout com o id (`successUrl`/`checkout.completed` dão o id ao navegador). Decisão do fundador (D-P9).
- **Pesquisa D-P9 (revisor, 06/11/2026), pelas páginas oficiais `…/build/checkout/handle-success-post-checkout`, `…/paddle-js/methods/paddle-checkout-open`, `…/paddle-js/events/checkout-completed`:**
  - (a) **`successUrl`**: FATO: existe (`settings.successUrl` ou `data-success-url`, deve começar com `http://` ou `https://`) e redireciona ao concluir. **A doc consultada NÃO diz que a Paddle acrescenta o `transaction_id` à URL.** Não depender disso (A VALIDAR no sandbox).
  - (a') **Evento `checkout.completed` do Paddle.js (`eventCallback`)**: FATO: o evento traz `data.transaction_id` (`txn_…`) e o e-mail do cliente (`data.customer.email`). É a forma comprovada de a página de retorno saber o id: na página de sucesso, o callback leva o comprador a `/entrar?lang=en` com o `txn_…` (e o e-mail) preenchidos; o servidor confere e-mail + transação no banco, como já faz `/api/paddle-license`. **Atenção:** o `checkout.completed` pode ocorrer **antes** do webhook gravar a compra (e, em pagamento diferido, "payment was authorized and is pending capture"); por isso a primeira tentativa pode dar 404 e a tela deve repetir/pedir "tente em alguns minutos".
  - (b) `txn_…` no recibo: não comprovado (acima). (c) `invoice_number`: existe em `transaction.completed` quando concluída [P4]; exigiria migração e consulta, fora desta fase.
  - **Decisão de implementação:** o servidor já aceita (a') sem mudança (entrada = e-mail + `txn_…`). Falta o **cliente** (Paddle.js na página de venda, CSP, preenchimento da tela de entrada e e2e), que NÃO foi feito. Pré-requisito de venda no sandbox: confirmar `checkout.completed` com `transaction_id` e se o `successUrl` recebe o id.
- O id da transação é um segredo fraco (vai no recibo). Mitigação: exigir **também** o e-mail e a RPC não distinguir os casos de erro. Limitar tentativas em Pages Functions: A VALIDAR (D-P3).

## 6. Sandbox (FATOS [P7, P10])

- Sandbox é um **ambiente separado**: conta própria (cadastro em `sandbox-vendors.paddle.com/signup`), dados, chaves, destinos de notificação, produtos e clientes **não são compartilhados** com a conta live.
- Base da API: live `https://api.paddle.com`, sandbox `https://sandbox-api.paddle.com`.
- Chaves de API: formato `^pdl_(live|sdbx)_apikey_[a-z\d]{26}_[a-zA-Z\d]{22}_[a-zA-Z\d]{3}$`; "contém `_sdbx`" = sandbox. Credencial de um ambiente na API do outro devolve erro `forbidden`.
- Cartões de teste: `4242 4242 4242 4242` (sem 3DS), `4000 0038 0000 0446` (3DS), `4000 0000 0000 0002` (recusado), entre outros; qualquer nome e validade futura. Só funcionam no sandbox.
- No sandbox: sem aprovação do site; reembolsos aprovados automaticamente **a cada 10 minutos**; e-mails só chegam ao domínio da conta (os demais são encaminhados ao e-mail principal); 3 tentativas de webhook.
- **Simulador de webhooks** [P10]: eventos únicos e cenários, sem transação real. Só destinos com `traffic_source` `all` ou `simulation` recebem simulações; destino `platform` só recebe eventos reais. **Em produção usar `platform`.**
- **Como o evento identifica o ambiente: não identifica.** O payload não traz campo de ambiente. O que separa os ambientes é o **segredo do destino** (cada conta tem o seu): produção só conhece o segredo live; evento do sandbox falha na assinatura (401). Por isso a v1 do desenho ("rejeitar evento cujo ambiente não bate") é substituída por: `PADDLE_ENV` define a base da API e **precisa bater com o prefixo da `PADDLE_API_KEY`** (`pdl_live_`/`pdl_sdbx_`); divergência → 503 `nao_configurado`.
- Go-live: checklist oficial (https://developer.paddle.com/build/go-live-checklist); recriar catálogo e destino na conta live. Aprovação do site/domínio é da Paddle (DADO DO USUÁRIO: revisão do site no ar).

## 7. Reembolso, disputa e ajuste: política do app

Igual à Gumroad (D6): reembolso **total** revoga; **parcial** mantém acesso (e revoga se a soma alcançar o valor da compra); chargeback revoga; disputa ganha reativa. Reembolso automático da Paddle [P6]: aprovado sozinho se a conta passou pela verificação, valor ≤ 400 USD (ou equivalente), menor que o saldo e não for transferência bancária; fora disso fica `pending_approval`. Prazo de reembolso e quem decide: termos do vendedor na Paddle (A VALIDAR). O `REFUND_EN.md` (7 dias, via Gumroad) **precisa ser reaberto** se a Paddle virar canal (D-P5); não editado nesta fase.

## 8. Volume e limites

- Por compra: 1 chamada `GET /customers/{id}` no `transaction.completed` e 1 por ajuste. Limite de taxa da API da Paddle: **A VALIDAR** (não consultei a página de limites).
- Falha na API da Paddle ou no Supabase → 503 para o webhook (a Paddle reenvia). Falha de assinatura nunca vira retentativa útil.

## 9. Variáveis (nomes; valores só no painel da Cloudflare, nunca no repositório)

- `PADDLE_WEBHOOK_SECRET` (obrigatória; *endpoint secret key* do destino).
- `PADDLE_ENV` (`sandbox` ou `production`, obrigatória; define a base da API e confere o prefixo da chave).
- `PADDLE_PRODUCT_ID` (obrigatória; `pro_…`, confere o produto dos itens).
- `PADDLE_API_KEY` (obrigatória; permissão mínima `customer.read`; segredo de servidor, nunca `VITE_*`).
- `PADDLE_SIGNATURE_TOLERANCE_SEC` (opcional, padrão 5).
- Reusa `LICENSE_PRIVATE_JWK`, `LICENSE_TTL_DAYS` e `SUPABASE_*`.
- Checkout no cliente: **A VALIDAR** (Paddle.js com *client-side token* ou link de pagamento; Paddle.js mexe na CSP). Nenhuma variável `VITE_PADDLE_*` secreta. Fora do escopo desta fase.

## 10. DFMEA curto

Escala 1 a 5; RPN = S×O×D.

| # | Modo de falha | Efeito | S | O | D | RPN | Mitigação |
|---|---|---|---|---|---|---|---|
| P1 | Webhook sem verificação ou frouxa | Qualquer um concede/revoga | 5 | 2 | 2 | 20 | Assinatura antes de ler; tempo constante; testes: inválida, ausente, velha, corpo alterado, vários `h1` |
| P2 | Gravar `…DISPUTE_WON` | Revoga quem ganhou | 4 | 2 | 2 | 16 | Nome fixo `…CHARGEBACK_REVERSED`; teste G3 |
| P3 | Parcial tratado como total (ou o inverso) | Revoga indevido / mantém reembolsado | 4 | 3 | 3 | 36 | `type` oficial `full`/`partial`; soma dos parciais no SQL; testes com os dois |
| P4 | Crédito gravado como revogação | Bloqueio do e-mail inteiro | 4 | 2 | 3 | 24 | `credit*` ignorado; só nomes da tabela §4.3 |
| P5 | `paddle` valendo só por e-mail (D3) | Acesso por quem sabe o e-mail | 4 | 3 | 2 | 24 | SQL com lista de plataformas; G3 "D3 paddle" |
| P6 | Evento do sandbox concedendo em produção | Acesso grátis | 3 | 2 | 3 | 18 | Segredo por ambiente; `PADDLE_ENV` × prefixo da chave; destino `platform` |
| P7 | Webhook atrasado ou perdido | Comprador sem ativar; reembolso sem revogar | 3 | 3 | 3 | 27 | Mensagem "tente em alguns minutos"; retentativas da Paddle; runbook `paddle_manual` |
| P8 | Corpo reserializado quebra a assinatura | Todas as vendas rejeitadas | 5 | 2 | 2 | 20 | Bytes crus; teste com payload do simulador (A VALIDAR) |
| P9 | `txn_…` adivinhado ou vazado | Ativação por terceiro | 3 | 2 | 4 | 24 | Exigir e-mail; erro genérico; D-P3 |
| P10 | Textos legais/reembolso divergem do canal | Promessa errada | 4 | 3 | 2 | 24 | Reabrir `REFUND_EN` e Termos antes de ligar (D-P5) |
| P11 | Dois canais para o mesmo e-mail | Estados contraditórios | 2 | 2 | 3 | 12 | `platform` separa; acesso = qualquer compra ativa |
| P12 | Ajuste chega antes da compra ser conhecida (ordem não garantida), ou reversão antes do chargeback | Reembolso ignorado; revogação final indevida | 4 | 1 | 3 | 12 | Ignora com log; retentativas; runbook manual; ocorrência improvável (ajustes ocorrem horas/dias depois) |
| P13 | Recibo não mostra o `txn_…` | Comprador não consegue ativar | 4 | 3 | 2 | 24 | Conferir no sandbox antes de vender; plano B §5 (D-P9) |
| P14 | Chave de API com permissão demais | Dano se vazar | 4 | 1 | 3 | 12 | Só `customer.read`; segredo só no painel |

## 11. Plano de testes (sem chamada real)

- Unitários com assinatura calculada no teste (segredo falso): válida, vários `h1`, inválida, ausente, malformada, velha, futura, corpo alterado; cada evento da §4 vira o nome esperado; `credit` e eventos não assinados → 200 sem gravar; produto diferente e `subscription_id` → ignorado; id fora do formato → 422 sem gravar; corpo > 64 KB → 413; API de cliente indisponível → 503 sem gravar; `provider_event_id` por estado.
- G3 (Postgres real): grant `paddle` ativa; `REFUNDED` revoga e grant posterior não reativa; `PADDLE_CHARGEBACK` → `…CHARGEBACK_REVERSED` → ativa; `…DISPUTE_WON` daria `charged_back` (documenta a armadilha); `paddle` não vale por e-mail (D3); parcial sem `provider_event_id` bloqueia; parciais somados viram reembolso; `nexo_purchase_owner` (service_role lê; anon e authenticated negados; e-mail errado, revogada, bloqueio aberto); mínimo do G3 ajustado ao total exato (35 = 29 + 6 testes `paddle`).
- Rotas PT e Gumroad com os testes existentes, inalterados.

## 12. O que NÃO foi verificado

- Nenhuma chamada real à Paddle (assinatura, API de cliente, sandbox). Os payloads dos testes seguem os exemplos oficiais, mas são simulados.
- Se o recibo do sandbox mostra o `txn_…` (P13).
- Se retentativas são reassinadas com `ts` novo (§2.5).
- Limites de taxa da API, moedas sem centavos (§5), valores de `type` em chargebacks.
- Termos do vendedor (reembolso, impostos, país): só o DADO DO USUÁRIO sobre pessoa física no Brasil.
- Pages Functions reais, Safari do iPhone e Android.

## 13. Decisões do fundador

| # | Decisão | Recomendação | Estado |
|---|---|---|---|
| D-P1 | Abrir a Paddle agora ou depois da 1ª venda Gumroad? | Depois | Aberta (o pedido de 06/11 pede avançar o código; ligar o canal é outra decisão) |
| D-P2 | Liberar `developer.paddle.com` na rede da sessão | — | **Resolvida** em 06/11/2026 (leitura feita) |
| D-P3 | Ativação: A (e-mail + id da transação) | A | Recomendação mantida; implementada |
| D-P4 | Mudar o SQL de exclusão por e-mail (D3) para lista de plataformas | Sim, com prova de que o PT não mudou | Implementada no G3 (PT inalterado) |
| D-P5 | Reabrir `REFUND_EN` e Termos se a Paddle virar canal | Sim, antes de ligar | Aberta |
| D-P6 | Falha da Paddle na renovação: mantém o token até `exp` | Sim | Implementada (renovação só confere o banco; sem chamada à Paddle) |
| D-P7 | Conta Paddle (cadastro, aprovação, dados pessoais) | Ação do fundador | Aberta |
| D-P8 | `chargeback_warning` revoga (o valor já foi devolvido) ou só avisa (como o SQL faz com a Hotmart)? | Revogar | **Implementado revogando; confirmar.** Alternativa: gravar `PADDLE_CHARGEBACK_WARNING` (mantém acesso) |
| D-P9 | Se o recibo não mostrar o `txn_…`: aceitar `invoice_number` (migração) ou página de sucesso com o id | Decidir após ver o recibo do sandbox | Aberta |
