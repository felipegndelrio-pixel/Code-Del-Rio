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

### Cliente e landing (P4, implementado; ver também D-P9)
- **Variáveis públicas do build** (nomes; valores só no ambiente de build): `VITE_PADDLE_CLIENT_TOKEN` (`test_…` sandbox, `live_…` produção), `VITE_PADDLE_ENV` (`sandbox`|`production`, precisa conferir com o token), `VITE_PADDLE_PRICE_ID` (`pri_…`), e as origens do checkout no CSP de `/en/*`: `VITE_PADDLE_CSP_FRAME` (obrigatória no build de venda) e `VITE_PADDLE_CSP_CONNECT` (opcional). As três primeiras só valem **juntas**; sem elas, nada da Paddle aparece (landing, CSP e entrada ficam idênticos; testes provam).
- **Landing `/en/`:** botão "Buy with Paddle" ao lado do da Gumroad e dois scripts **externos** (`https://cdn.paddle.com/paddle/v2/paddle.js`, endereço exigido pela doc, e `assets/paddle-buy.js`), sem JavaScript inline. O CSP de `/en/*` (e só ele) ganha `https://cdn.paddle.com` em `script-src` e as origens informadas em `frame-src`/`connect-src`; o app segue com `script-src 'self'`. O arquivo `_headers` é ajustado no build (`patchHeaders`).
- **Hosts do checkout (iframe e rede): NÃO constam nas páginas consultadas.** Por isso vêm das variáveis acima e são **A VALIDAR no sandbox** (abrir o checkout, ler as violações de CSP no console e copiar as origens). Sem `VITE_PADDLE_CSP_FRAME` o build de venda é recusado.
- **Retorno do checkout:** `checkout.completed` (Paddle.js) leva a `/entrar?lang=en#txn=…&email=…`. **Desvio deliberado da sugestão do revisor:** os dados vão no **fragmento** (`#`), não na query, para não aparecerem no log do servidor nem no Referer; a tela os lê e apaga o fragmento. Com os dois preenchidos a ativação começa sozinha e, em 404, repete (esperas de 2, 3, 5, 8 e 12 s, ≈ 30 s) mostrando "Finishing your purchase…"; depois, a mensagem normal.
- **Entrada:** seção "Bought with Paddle?" (e-mail + id da transação) só com as variáveis; o formulário Gumroad não muda. A renovação usa `/api/paddle-license` quando há id de transação guardado (`nexo.license.txn`); a última ativação (Gumroad ou Paddle) apaga a outra credencial no aparelho.
- **Build de venda com Paddle** exige também os textos legais da variante Paddle aprovados (`docs/legal-en/paddle/`, P5): enquanto estiverem em rascunho, o build é recusado. **Única exceção:** `npm run nexo:build:staging-paddle` (S1), só com `VITE_PADDLE_ENV=sandbox` e token `test_`, com aviso grande no console; nunca publicar esse build em produção.
- **Verificado:** vitest (cliente, build, script) e e2e em Chromium com Paddle.js **simulado** e a rota real `/api/paddle-license`. **NÃO verificado:** Paddle.js real, checkout real, CSP real em Pages (`nexo:test:csp` precisa do wrangler), Safari/Android.

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
| D-P9 | Se o recibo não mostrar o `txn_…`: aceitar `invoice_number` (migração) ou página de sucesso com o id | Decidir após ver o recibo do sandbox | Via (a') `checkout.completed` aprovada pelo revisor e implementada (P4); recibo e `successUrl` no checklist §14 |
| D-P10 | Testar no sandbox com a variante Paddle ainda em rascunho | Modo de build só para staging | **Resolvida (S1, 08/11/2026):** `npm run nexo:build:staging-paddle` aceita os rascunhos Paddle **apenas** com `VITE_PADDLE_ENV=sandbox` e token `test_`; recusa qualquer outra combinação; o build de venda normal segue recusando rascunho. Roteiro na §14 |

## 14. Roteiro do sandbox no staging (P6/S3): passos do fundador

Versão 2, 08/11/2026. Executar **no sandbox da Paddle** (conta separada; sem dinheiro real) e no **staging** (`https://staging-en.nexoprocess.pages.dev`, ramo `staging-en`, ambiente **Preview** da Cloudflare). **Nunca cole nem anote o valor de segredos** (chave de API, segredo do destino) em chat, e-mail ou repositório: só nome, tamanho e "ok/falhou". Tudo que está "A VALIDAR" se resolve neste roteiro. Nenhum comando aqui foi executado por quem escreveu (sem acesso à Paddle, à Cloudflare nem ao seu PC).

**Fatos usados (doc oficial, lida em 08/11/2026):** o sandbox é uma conta separada (https://sandbox-vendors.paddle.com/signup); chave de API de sandbox contém `_sdbx` e token de cliente começa com `test_`; no sandbox não precisa de aprovação do site; reembolsos são aprovados sozinhos **a cada 10 minutos**; e-mails só chegam ao domínio da conta, os demais (inclusive gmail/hotmail) são **encaminhados ao e-mail principal da conta** (https://developer.paddle.com/sdks/sandbox); cartões de teste: `4242 4242 4242 4242` (sem 3DS), `4000 0038 0000 0446` (com 3DS), `4000 0000 0000 0002` (recusado), qualquer nome e validade futura (mesma página).

### 14.1 Passo (a): na Paddle sandbox
1. Entre em https://sandbox-vendors.paddle.com (conta já criada).
2. **Catalog > Products**: crie o produto "NexoProcess" e, nele, um **preço** de pagamento único (US$ 39). Anote **só os ids**: `pro_…` (produto) e `pri_…` (preço). O `pro_…` vai em `PADDLE_PRODUCT_ID`; o `pri_…` em `VITE_PADDLE_PRICE_ID`.
3. **Paddle > My account > Settings > Authentication**: confira que existem a **chave de API** de sandbox com **só a permissão `customer.read`** (contém `_sdbx`) e o **token de cliente** (`test_…`). Se a chave tiver mais permissões, crie outra só com `customer.read` e apague a antiga.
4. **Paddle > Events > Notifications > New destination**: tipo **URL**; endereço `https://staging-en.nexoprocess.pages.dev/api/paddle-webhook`; eventos: **só** `transaction.completed`, `adjustment.created` e `adjustment.updated`; uso (`traffic_source`) **Platform and simulation**. Salve e copie a **chave secreta do destino** (Edit destination > ícone de copiar): ela vira `PADDLE_WEBHOOK_SECRET` no passo (b).

### 14.2 Passo (b): Cloudflare, ambiente **Preview** (projeto `nexoprocess`)
Cloudflare > Workers & Pages > `nexoprocess` > Settings > Variables and Secrets > **Preview** (os nomes de menu são A VALIDAR). Crie, **só no Preview**:

| Nome | Tipo | Valor |
|---|---|---|
| `PADDLE_ENV` | texto | `sandbox` |
| `PADDLE_PRODUCT_ID` | texto | o `pro_…` do passo (a) |
| `PADDLE_API_KEY` | **Secret** | a chave de API de sandbox (`pdl_sdbx_apikey_…`) |
| `PADDLE_WEBHOOK_SECRET` | **Secret** | a chave secreta do destino |

Já devem existir no Preview as do staging: `LICENSE_PRIVATE_JWK`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (do Supabase **de staging**). `PADDLE_SIGNATURE_TOLERANCE_SEC` só se o item 12 da §14.4 mandar. **As variáveis só valem no próximo deployment**: crie todas **antes** do passo (c).

### 14.3 Passo (c): build e deploy de staging (Windows, PowerShell, **uma sessão só**)
O build de staging usa `npm run nexo:build:staging-paddle`. Ele **aceita os textos legais Paddle em rascunho** só se `VITE_PADDLE_ENV=sandbox` **e** o token começa com `test_`; com produção ou `live_` ele **recusa**. O build de venda normal (`nexo:build:venda`) continua recusando rascunho. As 4 variáveis `VITE_*` da Paddle são **públicas** (vão no JavaScript); os segredos do passo (b) **não** entram no build.
```powershell
# 1) Clone limpo, em pasta nova, no commit fixo informado pelo revisor
cd $env:USERPROFILE
git clone https://github.com/felipegndelrio-pixel/Code-Del-Rio.git nexo-paddle-staging
cd nexo-paddle-staging
$SHA = Read-Host 'SHA do commit (informado pelo revisor)'
git checkout $SHA
git status --short          # tem de ficar vazio
git rev-parse HEAD          # tem de ser igual ao SHA informado

# 2) Variáveis do build, uma por linha, só nesta sessão (nada vai para arquivo)
$env:VITE_LICENSE_PUBLIC_JWK       = (Get-Clipboard -Raw).Trim()   # ANTES: copie a linha PÚBLICA da chave de STAGING
$env:VITE_HOTMART_CHECKOUT_URL     = Read-Host 'VITE_HOTMART_CHECKOUT_URL'
$env:VITE_SUPPORT_EMAIL            = Read-Host 'VITE_SUPPORT_EMAIL'
$env:VITE_GUMROAD_CHECKOUT_URL     = Read-Host 'VITE_GUMROAD_CHECKOUT_URL'
$env:VITE_EN_TERMS_URL             = Read-Host 'VITE_EN_TERMS_URL'
$env:VITE_EN_PRIVACY_URL           = Read-Host 'VITE_EN_PRIVACY_URL'
$env:VITE_EN_REFUND_URL            = Read-Host 'VITE_EN_REFUND_URL'
$env:VITE_CF_WA_TOKEN              = Read-Host 'VITE_CF_WA_TOKEN'
$env:VITE_PADDLE_ENV               = 'sandbox'
$env:VITE_PADDLE_CLIENT_TOKEN      = Read-Host 'VITE_PADDLE_CLIENT_TOKEN (comeca com test_)'
$env:VITE_PADDLE_PRICE_ID          = Read-Host 'VITE_PADDLE_PRICE_ID (pri_...)'
$env:VITE_PADDLE_CSP_FRAME         = Read-Host 'VITE_PADDLE_CSP_FRAME (deixe VAZIO no 1o build; ver 14.5)'
$env:VITE_PADDLE_CSP_CONNECT       = Read-Host 'VITE_PADDLE_CSP_CONNECT (deixe VAZIO no 1o build; ver 14.5)'

# 3) Build de staging (recusa produção/live_; mostra o aviso grande) e deploy SÓ no ramo de staging
npm ci
npm run nexo:build:staging-paddle
$GIT_COMMIT = git rev-parse HEAD
cd apps/nexoprocess
npx wrangler pages deploy dist --project-name nexoprocess --branch staging-en --commit-hash $GIT_COMMIT --commit-dirty=false
```
- Os textos entre aspas em `Read-Host` são só rótulos; **você digita o valor**. Para o 1º build, aperte Enter nas duas linhas de CSP (variável vazia = ausente; o build aceita isso **apenas** no modo staging).
- O terminal deve mostrar o quadro `BUILD DE STAGING COM PADDLE EM SANDBOX. NÃO PUBLICAR EM PRODUÇÃO, NÃO VENDER.` e `Commit do build de staging: <SHA>`. Se aparecer `Modo staging-paddle RECUSADO`, confira `VITE_PADDLE_ENV` e o prefixo `test_` (nada foi gerado).
- **Não use `--branch main`** com este build.
- A VALIDAR: o endereço do repositório e o nome do ramo/projeto (aqui os do pedido do revisor).

### 14.4 Passo (d): o teste (e a verificação por etapa)
Cada linha com resultado e evidência. As com **"Bloqueia a venda"** precisam passar antes de qualquer venda real.

**Sequência (faça nesta ordem; a tabela abaixo detalha o que conferir em cada etapa):**
1. Abra `https://staging-en.nexoprocess.pages.dev/en/` no **Chrome do PC**, com o console aberto (F12 > Console) e clique em **Buy with Paddle**. Se o checkout **não abrir** ou o console mostrar `Refused to frame` / `Refused to connect`, vá para **14.5** e refaça o build (14.3) com as origens; depois volte aqui.
2. No checkout (aparece a marca "Test Mode"): e-mail que você consulta (**gmail/hotmail são encaminhados ao e-mail principal da conta Paddle**, então o recibo chega lá), país qualquer, cartão `4242 4242 4242 4242`, nome qualquer, validade futura. Pague.
3. Você deve voltar sozinho para `/entrar?lang=en` e **entrar no app** (pode aparecer "Finishing your purchase…" por alguns segundos). Se aparecer a mensagem 404 depois de ~30 s, o webhook não chegou: vá para o item 9.
4. **Conferir o banco do staging** (Supabase de **staging** > SQL Editor), com o `txn_…` da compra (consulta P-D de `OPERACAO_EN.md` §6.1):
```sql
select platform, transaction_id, email, status, access_active, amount, currency, last_event
  from public.nexo_purchases
 where platform = 'paddle' and transaction_id = 'COLE_O_TXN_AQUI_EM_MINUSCULAS';
```
   Esperado: `status = 'active'`, `access_active = true`, `last_event = 'PADDLE_TRANSACTION_COMPLETED'`.
5. **Reembolsar no sandbox:** Paddle sandbox > Transactions > a compra > Refund (total). O sandbox aprova sozinho **em até 10 minutos**. Rode a mesma consulta de novo: esperado `status = 'refunded'` e `access_active = false`.
6. **Conferir a revogação no app:** no staging, saia e entre de novo com e-mail + `txn_…`: deve aparecer "We couldn’t find an active purchase matching this email address and transaction ID". Quem ficou logado perde o acesso na próxima verificação (até 1 h online).


| # | O que conferir | Como | Passa se | Bloqueia a venda? | Resultado |
|---|---|---|---|---|---|
| 9 | **Webhook assinado chega e é aceito** | Fazer uma compra de teste (cartão `4242 4242 4242 4242`, validade futura, qualquer nome). Ver em Paddle > Events > Notifications o status de `transaction.completed` e, no log da função, `paddle transaction.completed → active` | Status "delivered" (200); compra gravada (consulta §13.1 do runbook Gumroad, com `platform='paddle'`) | **Sim** | |
| 10 | **Assinatura inválida é recusada** | no PowerShell: `try { Invoke-WebRequest -Method Post -Uri 'https://staging-en.nexoprocess.pages.dev/api/paddle-webhook' -Body '{}' -ContentType 'application/json' } catch { $_.Exception.Response.StatusCode.value__ }` (sem o cabeçalho `Paddle-Signature`) | 401; nada gravado | **Sim** | |
| 11 | **O `txn_…` aparece no recibo/e-mail?** (risco P13) | Abrir o e-mail de recibo do sandbox (chega ao e-mail principal da conta; domínios gratuitos são encaminhados, P7) e o PDF da fatura. Procurar `txn_…` e o número da fatura | Registrar **sim/não** e onde. Se **não**: a ativação manual só funciona pela via do `checkout.completed`; decidir D-P9 (b)/(c) antes de vender | **Sim** (define o suporte) | |
| 12 | **As retentativas são reassinadas com `ts` novo?** (tolerância de 5 s) | Fazer a função devolver 503 de propósito (ex.: `PADDLE_API_KEY` errada), comprar, e olhar as 3 tentativas do sandbox (~2 min) em Notifications e no log (`paddle → 401 assinatura inválida (expirada)` ou não) | Tentativas 2 e 3 **não** dão "expirada". Se derem: subir `PADDLE_SIGNATURE_TOLERANCE_SEC` (máx. 600) e repetir; registrar o valor | **Sim** | |
| 13 | **`checkout.completed` traz `transaction_id` e e-mail** | Comprar pela landing de teste (`/en/`): o botão "Buy with Paddle" abre o checkout; ao concluir, a página deve ir a `/entrar?lang=en` e entrar sozinha | Entra no app; a barra de endereços fica sem `#txn`; "Finishing your purchase…" aparece só se o webhook demorar | **Sim** | |
| 14 | **CSP do checkout:** origens do iframe e da rede | Abrir `/en/` no Chrome com o console aberto, clicar em comprar; copiar as origens bloqueadas (`Refused to frame …`, `Refused to connect …`). Colocá-las em `VITE_PADDLE_CSP_FRAME` / `VITE_PADDLE_CSP_CONNECT` (vírgula), refazer o build e repetir | Checkout abre e conclui sem violação de CSP | **Sim** | |
| 15 | **`successUrl`:** a Paddle acrescenta o id da transação à URL? | Só informativo (o fluxo usa `checkout.completed`). Se quiser testar: `successUrl` apontando para uma página de teste e ver a URL final | Registrar sim/não | Não | |
| 16 | **Reembolso total** | Paddle > Transactions > a compra > Refund (total). Sandbox aprova sozinho a cada 10 min (P7). Ver `adjustment.created` (pendente) e `adjustment.updated` (aprovado) | Banco `refunded`; `/api/paddle-license` nega; o app sai no próximo check (≤ 1 h online ou ao reabrir com token > 1 h) | **Sim** | |
| 17 | **Reembolso parcial** | Refund de parte dos itens/valor | Acesso mantido; `refunded_amount` sobe; reembolsos que somam o total revogam | **Sim** | |
| 18 | **Valores de `type`/`status` dos ajustes** | No payload de `adjustment.*` do passo 16/17: `action=refund`, `type=full|partial`, `status=pending_approval|approved` | Iguais aos da §4.3 | **Sim** | |
| 19 | **Chargeback e reversão** | O sandbox não gera chargeback real: usar o **simulador** (Events > Simulations) com `adjustment.created` de ação `chargeback`/`chargeback_reverse` apontando para a transação do passo 9 (ids reais) | Compra vai a `charged_back` e volta a `active`; sem bloqueio de conciliação | Não (coberto por G3), mas registre | |
| 20 | **Eventos simulados com ids falsos** | Simulador com payload de exemplo | Resposta 200 `ignored` (cliente/transação desconhecidos), nada gravado, sem erro 5xx | Não | |
| 21 | **Moeda sem centavos** (ex.: JPY) | Compra de teste em JPY se o preço permitir | O valor gravado é coerente, e reembolsos parciais somam certo | Não | |
| 22 | **Textos legais da variante Paddle** | Ler `docs/legal-en/paddle/*.md` com o recibo e o checkout reais ao lado; resolver cada `TO VALIDATE` e só então trocar `status: approved` (decisão do fundador, D-P5) | Build de venda com Paddle deixa de ser recusado | **Sim, para vender** | |

### 14.5 Descobrir as origens de CSP do checkout (S2)
**O que a doc oficial diz (lida em 08/11/2026, https://developer.paddle.com/llms-full.txt e as páginas de Paddle.js):** o script vem de `https://cdn.paddle.com/paddle/v2/paddle.js`; o ambiente sandbox usa `Paddle.Environment.set('sandbox')`; o token `test_…` é de sandbox. **A doc consultada NÃO menciona CSP, `frame-src` nem `connect-src`, e não lista os hosts do checkout.** Não foi encontrada fonte oficial; **não use valor de memória**. O que a Paddle carrega de fato se descobre no navegador:

1. Faça o 1º build **sem** `VITE_PADDLE_CSP_FRAME` e `VITE_PADDLE_CSP_CONNECT` (14.3) e publique no staging.
2. No **Chrome do PC**, abra `https://staging-en.nexoprocess.pages.dev/en/`, F12 > **Console**, clique em **Buy with Paddle**.
3. O Chrome registra uma linha por origem bloqueada, por exemplo `Refused to frame 'https://…' because it violates the following Content Security Policy directive: …` (iframe do checkout) e `Refused to connect to 'https://…' …` (rede). Copie **só a origem** (`https://nome-do-host`, sem caminho nem `?`). Repita o clique até não aparecerem mais violações (o checkout pode pedir novas origens em etapas).
4. **Onde pôr:** origens de `Refused to frame` em `VITE_PADDLE_CSP_FRAME`; de `Refused to connect` em `VITE_PADDLE_CSP_CONNECT`. Várias, separadas por vírgula, **até 6**, só `https://host` (sem `*`, sem caminho; o build recusa o que não for assim). Exemplo de formato (o host é fictício): `$env:VITE_PADDLE_CSP_FRAME = 'https://exemplo-1.test,https://exemplo-2.test'`.
5. Refaça o passo (c) com as origens (a mesma pasta serve: rode só os `$env:` das duas CSP, `npm run nexo:build:staging-paddle` e o deploy) e repita o teste. Registre as origens encontradas (são públicas) no item 14 da tabela.
6. Efeito no servidor: o build ajusta apenas o CSP de `/en/*` (`script-src` ganha `https://cdn.paddle.com`; `frame-src` e `connect-src` ganham as origens). O app (`/entrar`, `/app`) continua com `script-src 'self'`.

### 14.6 Ir para a produção (somente depois de tudo acima)
1. Conta **live** aprovada pela Paddle (DADO DO USUÁRIO: a Paddle já disse que aceita pessoa física no Brasil e revisa o site no ar). Seguir o checklist oficial: https://developer.paddle.com/build/go-live-checklist .
2. Recriar produto, preço e **destino de notificação** na conta live (sandbox e live **não compartilham** nada, P7). Destino com `traffic_source` = **Platform only**. Novo segredo do destino.
3. Trocar as variáveis para live: `PADDLE_ENV=production`, `PADDLE_API_KEY` (`pdl_live_…`), `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRODUCT_ID`; build com `VITE_PADDLE_CLIENT_TOKEN` (`live_…`), `VITE_PADDLE_ENV=production`, `VITE_PADDLE_PRICE_ID`. O servidor recusa chave cujo prefixo não bate com `PADDLE_ENV`.
4. Repetir os itens 9, 13 e 16 com **uma compra real do próprio fundador** e reembolso, como no teste de fumaça da Gumroad (`HANDOFF_EN.md`).
5. **Reverter** (se algo falhar): remover as `VITE_PADDLE_*` e refazer o build (landing e entrada voltam ao estado só-Gumroad); as rotas `/api/paddle-*` ficam inertes sem tráfego.

### 14.7 O que registrar (sem segredos)
Data, ambiente (sandbox/live), commit do build (`VITE_BUILD_ID`), resultado de cada linha, onde o `txn_…` aparece (item 11), a tolerância usada (item 12) e as origens de CSP encontradas (item 14, são públicas). Anexar prints sem dados pessoais.
