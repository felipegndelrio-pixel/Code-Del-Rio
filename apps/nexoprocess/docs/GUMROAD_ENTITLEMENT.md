# Gumroad: concessão e revogação de acesso (desenho T1)

Versão 1 do desenho, de 31/10/2026, branch `wip/en-foundation`, base `v2.5.0-rc1` (31f0ed5).
Status: **desenho para revisão. Nada implementado.** O comportamento PT não muda.

## 0. Fontes e como foram verificadas

| # | Fonte | Como li | Data |
|---|---|---|---|
| F1 | Código-fonte público da Gumroad, `github.com/antiwork/gumroad`, commit `fc9e0bc51d3c732859fde734b142812a068d795e`. Ele contém o texto da doc oficial (`app/javascript/components/ApiDocumentation/Endpoints/Licenses.tsx`, `.../ResourceSubscriptions.tsx`, `app/javascript/pages/Public/Ping.tsx`, que são as páginas gumroad.com/api e gumroad.com/ping) e o servidor (`app/controllers/api/v2/licenses_controller.rb`, `app/modules/purchase/ping_notification.rb`, `app/models/purchase.rb`, `app/sidekiq/post_to_individual_ping_endpoint_worker.rb`) | clone raso, leitura direta | 31/10/2026 |
| F2 | https://help.gumroad.com/article/76-license-keys (Central de Ajuda oficial) | só trecho de busca web: o acesso direto foi bloqueado | 31/10/2026 |
| F3 | Resposta escrita do suporte Gumroad | DADO DO USUÁRIO (repassado pelo revisor) | 30/10/2026 |

**Limite (FATO):** a política de rede desta sessão bloqueia `gumroad.com`, `help.gumroad.com` e `api.gumroad.com` (proxy responde 403). Não li a página publicada gumroad.com/api.
**INFERÊNCIA:** o `main` do repositório oficial corresponde ao que roda em produção. **A VALIDAR:** abrir https://gumroad.com/api#licenses e https://gumroad.com/ping no iPhone e conferir os itens marcados [F1] antes da T2.

## 1. Fatos da API usados no desenho

### 1.1 License API `verify` [F1 Licenses.tsx; F2]
- `POST https://api.gumroad.com/v2/licenses/verify`, corpo `x-www-form-urlencoded`. Não exige `access_token`: o controller pula a autenticação OAuth em `verify` (`licenses_controller.rb`, `skip_before_action … only: [:verify]`, e `doorkeeper_authorize!` só em enable/disable/decrement/rotate).
- Parâmetros oficiais: `product_id` ("the unique ID of the product"), `license_key` e `increment_uses_count` ("true"/"false", opcional, **padrão "true"**).
  - **FATO crítico:** só a string `"false"` (ou o booleano false) desliga a contagem (`clean_params`: `params[:increment_uses_count] = ["false", false].exclude?(…)`). **Sempre enviar `increment_uses_count=false`.**
  - F2: `product_id` é obrigatório para produtos criados a partir de 09/01/2023. `product_permalink` é legado e não será usado.
- Respostas:
  - 200 `{ success: true, uses, purchase: {…} }`.
  - 404 `{ success:false, message:"That license does not exist for the provided product." }`: chave inexistente ou de outro produto.
  - 404 `"This license key has been disabled."`: o vendedor desabilitou a chave.
  - 404 `"Access to the purchase associated with this license has expired."`: `is_access_revoked`.
  - 400: parâmetro que não é string.
  - 500: falta `product_id` em produto novo.
- Campos de `purchase` usados (exemplo oficial):
  - `"product_id": "32-nPAicqbLj8B_WswVlMw=="`, `"email"`, `"price": 0` (em centavos: `price: price_cents` em `ping_notification.rb`), `"currency": "usd"` (minúsculo).
  - `"sale_id": "FO8TXN-dbxYaBdahG97Y-Q=="`, `"sale_timestamp": "2021-01-05T19:38:56Z"`.
  - `"refunded"`, `"disputed"`, `"dispute_won"`, `"chargebacked"`, `"test"` (presente só quando o comprador é o próprio vendedor), `"recurrence"` (só em assinatura), `"license_key"`.
- Semântica (FATO, `purchase.rb` e `ping_notification.rb`):
  - `refunded` = reembolso **total** (`stripe_refunded == true`). Reembolso parcial (`stripe_partially_refunded`) **não** sai no `verify`: o campo não está na lista `WHITELIST_PURCHASE_ATTRIBUTES`.
  - `disputed` = já houve chargeback (`chargeback_date.present?`) e **continua true mesmo depois de ganho**.
  - `dispute_won` = chargeback revertido.
  - `chargebacked` = disputa **não** revertida (`chargedback_not_reversed?`), e só para produto que não é assinatura.
  - Reembolsado ou disputado **continua respondendo 200** (só `is_access_revoked` dá 404). Confere com F3: a Gumroad não revoga sozinha.
- `id` ≠ `sale_id`. `id` é o `external_id` da compra e `sale_id` é `ObfuscateIds.encrypt(id)`; no exemplo oficial os valores diferem. **Usamos `sale_id`**, que é o mesmo identificador do Ping e da deduplicação recomendada.
- **Limite de chamadas:** não encontrei número publicado na doc nem no controller. **A VALIDAR com o suporte.**

### 1.2 Ping / resource subscriptions [F1 Ping.tsx, ResourceSubscriptions.tsx, worker]
- Recursos: `sale`, `refund`, `dispute`, `dispute_won`, `cancellation`, `subscription_updated`, `subscription_ended`, `subscription_restarted`.
- POST `x-www-form-urlencoded`. Qualquer resposta 2xx confirma. O endpoint tem 5 s para responder.
- Retentativas após 1 min, 3 min, 10 min e 1 h, só para 499/500/502/503/504; depois a entrega é descartada.
- A entrega acontece pelo menos uma vez e **sem ordem garantida**. Deduplicar por `sale_id` + `resource_name`.
- **FATO (texto da doc, Ping.tsx):** "Because the payload is **unsigned** and deliveries can be dropped once the retries run out, treat a ping as a trigger rather than as data: take `sale_id`, read the sale back through the API, and reconcile periodically". Isso fecha a dúvida de F3: **o Ping não é assinado.**
- O payload inclui `license_key` (quando o produto gera chave), `sale_id` e `product_id`.
- O worker aceita usuário e senha na URL (`uri.userinfo` → basic auth). **INFERÊNCIA:** dá para proteger o endpoint com um segredo na URL; ver decisão D4.

## 2. Fluxo de concessão (verificação ativa)

Rota nova `POST /api/gumroad-license`, em `functions/api/gumroad-license.ts` e `api/_lib/gumroad.ts`. Rota separada para **não tocar** `/api/license` (PT).

Entrada `{ email, license_key }`, corpo de no máximo 4 KB, como `handleLicense`. Passos:

1. **Validar a entrada.**
   - E-mail: `normalizeEmail`.
   - `license_key`: `^[A-Za-z0-9-]{8,64}$` após `trim`. Formato do exemplo: `85DB562A-C11D4B06-A2335A6B-8C079166`. **A VALIDAR** se todas as chaves seguem esse alfabeto; se não, aceitar `[\x21-\x7E]{8,128}`.
   - Inválido → 400.
2. **Chamar `verify`.**
   - Corpo: `product_id=${GUMROAD_PRODUCT_ID}`, `license_key`, `increment_uses_count=false`.
   - Timeout de 5 s. Nenhum segredo vai na chamada.
3. **Classificar a resposta.** As regras são aplicadas em ordem; a primeira que casar decide:

| Condição | Resultado |
|---|---|
| Rede, timeout, 5xx, 429 ou JSON inválido | 502 `falha_verificacao`. Nada é gravado (falha fechada) |
| 404 / `success:false` | 404 genérico (mesma mensagem de "sem licença") |
| `purchase.product_id` ≠ `GUMROAD_PRODUCT_ID` | 404 genérico e log |
| `purchase.email` ≠ e-mail digitado (minúsculo) | 404 genérico (D2) |
| `purchase.test === true` e sem `GUMROAD_ALLOW_TEST=1` | 404 genérico (D5) |
| `recurrence` presente | 404 e log (produto configurado como assinatura por engano) |
| `refunded` | grava revogação `GUMROAD_REFUNDED` e responde 404 |
| `chargebacked` ou (`disputed` e não `dispute_won`) | grava revogação `GUMROAD_DISPUTE` e responde 404 |
| `disputed` e `dispute_won` | grava concessão (seção 4) e emite token |
| caso contrário | grava concessão e emite token |

4. **Gravar a concessão.** `store.grant({...})`, que vira `nexo_grant_purchase`:
   - `platform 'gumroad'`.
   - `transaction = normalizeGumroadId(sale_id)` e `product_id = normalizeGumroadId(purchase.product_id)` (seção 3).
   - `email = purchase.email` (já igual ao digitado).
   - `event 'GUMROAD_SALE_APPROVED'`: precisa conter `APPROVED` (`schema-purchases.sql:316`).
   - `amount = price/100`, `currency = upper(currency)`.
   - `occurred_at = sale_timestamp`; `provider_event_id = null`.
5. **Emitir o token.** Se `result==='active'`, assinar o mesmo token v1 (`signToken`, `exp = now + LICENSE_TTL_DAYS`). Se `blocked`, responder 404 genérico, como no PT.

**Por que o grant usa `sale_timestamp` e a revogação usa `now()`** (INFERÊNCIA a partir de `schema-purchases.sql:377-406`):
- Concessões repetidas com o mesmo `sale_timestamp` não regridem nada.
- Uma concessão depois de uma revogação cai em "older_event" ou "terminal_purchase" e **não ressuscita** a compra.
- `chargeback_reverse` com `now()` é mais novo que o `charged_back` anterior e, por isso, é aplicado.

## 3. Formato do id de venda e normalização

- FATO: os ids de exemplo (`FO8TXN-dbxYaBdahG97Y-Q==`, `32-nPAicqbLj8B_WswVlMw==`) são base64url com padding `=`.
  - O `=` **viola** `^[A-Za-z0-9_-]{1,64}$` (transação, `schema-purchases.sql:33`) e `^[A-Za-z0-9._:-]{1,128}$` (produto, `:35`).
  - Gravados crus, o SQL bloquearia com `transaction_invalid`/`product_invalid` (`:289-312`).
- Proposta `normalizeGumroadId(raw)`, determinística e injetiva:
  1. `s = raw.trim()`.
  2. Aceitar só `^[A-Za-z0-9_-]+={0,2}$` **e** `s.length % 4 === 0`. Fora disso → `null` (falha fechada: nada é concedido, log "id_gumroad_fora_do_formato").
  3. Devolver `s.replace(/=+$/, '')`, que precisa caber em `^[A-Za-z0-9_-]{1,64}$`.
- Prova de injetividade: com comprimento múltiplo de 4, o número de `=` fica determinado pelo comprimento do corpo (corpo ≡ 0 mod 4 → 0 `=`, ≡ 3 → 1, ≡ 2 → 2; ≡ 1 é impossível). Por isso duas entradas válidas diferentes nunca dão a mesma saída.
- Reversível para suporte: basta recolocar o `=` até completar múltiplo de 4.
- Testes da T2 (unitários):
  - Os dois ids oficiais dão `FO8TXN-dbxYaBdahG97Y-Q` e `32-nPAicqbLj8B_WswVlMw`.
  - Sem padding com comprimento múltiplo de 4 passa intacto.
  - `abc` e `abc=` são rejeitados (comprimento) ou distintos.
  - `a=b==`, `+/` (base64 padrão), vazio, espaço interno e corpo com mais de 64 caracteres → `null`.
  - Teste de propriedade: normalizar e repadronizar devolve a entrada.
- G3 (Postgres real): grant `platform 'gumroad'` com o id normalizado → `active`. Com o id cru (`==`) → `blocked` (prova a regra do schema).
- Nota (INFERÊNCIA, risco baixo): `nexo_refunded_transactions` é consultada só por `transaction` (sem plataforma, `:380`, `:408`). Um id Gumroad normalizado colidir com uma transação Hotmart reembolsada (`HP…`) é improvável; vira um teste negativo no G3.

## 4. Mapeamento para os eventos canônicos

O SQL classifica pelo **nome** do evento (`schema-purchases.sql:315-341`). Os nomes abaixo foram escolhidos para cair no tipo certo:

| Situação Gumroad | Detectada por | Evento gravado | Tipo canônico |
|---|---|---|---|
| Venda válida | verify ok | `GUMROAD_SALE_APPROVED` (grant) | `active` |
| Reembolso total | `refunded:true` / ping `refund` | `GUMROAD_REFUNDED` | `refunded` |
| Reembolso parcial | **não aparece no verify** (§1.1) | nada | acesso mantido (= `partially_refunded` do PT, que não revoga). A VALIDAR (D6) |
| Disputa aberta / chargeback | `chargebacked` ou `disputed && !dispute_won` | `GUMROAD_DISPUTE` | `charged_back` |
| Disputa ganha | `disputed && dispute_won` | `GUMROAD_CHARGEBACK_REVERSED` (revoke) | `chargeback_reverse` → `active` |
| Cancelamento | só assinatura; o produto é pagamento único | `GUMROAD_CANCELLED` | `cancelled` |

- **Armadilha (FATO, `:325-330`):** o nome `GUMROAD_DISPUTE_WON` cairia em `%DISPUTE%` → `charged_back`, **revogando quem ganhou a disputa**. O evento de disputa ganha precisa conter `CHARGEBACK` e `REVERSE`. Vai ter teste no G3.
- Ordem na disputa ganha:
  - Se a compra no banco estiver `charged_back`, gravar a revogação `GUMROAD_CHARGEBACK_REVERSED`; o SQL reativa (`:423-431`).
  - Se não houver registro anterior (disputa aberta e ganha entre duas verificações), gravar o grant normal.
  - Nunca enviar `chargeback_reverse` sem `charged_back` antes: isso criaria um bloqueio de conciliação (`:427`).

## 5. Revogação

### 5.1 Reverificação na renovação (caminho principal)
- Hoje `/api/license {token}` só consulta o banco pelo e-mail (`handlers.ts:100-115`). O token não carrega a chave. O app renova quando o token tem mais de 1 hora (`LicenseGate.tsx:2`, `LICENSE.refreshAfterSec`).
- Proposta: a renovação EN usa `POST /api/gumroad-license { token, license_key }`.
  - O cliente guarda a `license_key` localmente junto do token. Ela já é do comprador; não é segredo do servidor.
  - O servidor valida o token, exige `purchase.email === token.sub` e repete os passos 2 a 5.
  - Resultado: a revogação vale no máximo ~1 h depois do reembolso para quem está online, ou em até `LICENSE_TTL_DAYS` (padrão 30) para quem fica offline.
- Alternativas descartadas:
  - Guardar a chave no servidor: dado sensível a mais no banco.
  - Colocar a chave no payload do token: muda o formato v1 que o PT usa.

### 5.2 Ping como gatilho (opcional, D4)
- `POST /api/gumroad-ping`: lê só `license_key` e `product_id` do corpo, limitado a 64 KB (`readBodyLimited`).
- Ignora o resto do payload. **Nunca concede nem revoga com base nele.**
- Chama `verify` e aplica o resultado como nos passos 3-4, com e-mail e ids **da resposta da API**.
- Responde 200 rápido e devolve 503 só se o armazenamento falhar (a Gumroad tenta de novo nesses casos).
- Um ping forjado só faz o servidor reverificar uma chave real: o custo é uma chamada à API, sem efeito indevido.

### 5.3 Conciliação periódica
- Pages Functions não tem cron. Sem ping e sem renovação, uma compra reembolsada fica `active` no banco.
- Consequência: o caminho PT por e-mail (`/api/license {email}`) ainda daria token a esse e-mail (ver risco R3 e D3).

## 6. Sem internet / API fora do ar

| Situação | Comportamento proposto |
|---|---|
| Aparelho offline com token válido | Abre normalmente até `exp` (igual ao PT) |
| Aparelho offline, token vencido | Bloqueia; pede conexão |
| Ativação com Gumroad fora (timeout/5xx/429) | 502; nada gravado; mensagem "tente de novo" |
| Renovação com Gumroad fora | **D1**: (a) falha fechada e mantém o token atual até `exp` (recomendado: o usuário não perde acesso antes do vencimento e não ganha dias novos sem verificar) ou (b) renovar pelo estado do banco |
| Supabase fora | 502, como hoje |

## 7. Volume de chamadas (estimativa)

- Premissas (HIPÓTESE): 1.000 compradores ativos, cerca de 3 aberturas por dia com intervalo acima de 1 h.
- Cálculo: 1.000 × 3 = **~3.000 chamadas/dia ao `verify`**, mais as ativações. Pico de ~1 chamada a cada 30 s.
- A Gumroad não publica limite (§1.1, A VALIDAR).
- Mitigações na T2:
  - Renovação com Gumroad só se o token tiver mais de 24 h (`GUMROAD_REVERIFY_AFTER_SEC`); abaixo disso, responder pelo banco. O revogado ainda é barrado no máximo 24 h depois.
  - Tratar 429 como falha temporária.
  - Sem retentativa automática no servidor.

## 8. DFMEA curto

Escala de 1 a 5. Severidade (S), ocorrência (O), detecção (D) e RPN (risco) = S×O×D.

| # | Modo de falha | Efeito | S | O | D | RPN | Mitigação |
|---|---|---|---|---|---|---|---|
| R1 | Esquecer `increment_uses_count=false` | Contagem de usos inflada; se um dia limitarmos usos, bloqueia clientes | 3 | 3 | 2 | 18 | Constante no código e teste que confere o corpo enviado |
| R2 | Gravar `GUMROAD_DISPUTE_WON` | Revoga quem ganhou a disputa | 4 | 2 | 2 | 16 | Nome fixo `…CHARGEBACK_REVERSED` e teste G3 |
| R3 | Compra Gumroad reembolsada ainda ativa no banco (sem ping ou renovação) e acessada por `/api/license {email}` | Acesso indevido por quem sabe o e-mail | 3 | 3 | 3 | 27 | Ping (D4) e/ou restringir o caminho só-e-mail (D3) |
| R4 | Id com `=` gravado cru | Todo comprador Gumroad bloqueado | 5 | 4→1 | 1 | 5 | `normalizeGumroadId` e teste G3 |
| R5 | Chave compartilhada | Uso por terceiros | 2 | 3 | 4 | 24 | Exigir o e-mail da compra (D2); limite de usos é opção futura (D7) |
| R6 | Gumroad fora ou com limite | Ativação falha | 3 | 2 | 1 | 6 | 502 claro e D1 |
| R7 | Ping forjado | Custo de chamadas | 1 | 2 | 2 | 4 | Só gatilho; segredo na URL (D4) |
| R8 | Doc publicada ≠ código lido | Parâmetro errado | 4 | 1 | 2 | 8 | Conferir gumroad.com/api antes da T2 |
| R9 | Comprador presenteado (`is_gift_receiver_purchase`) | E-mail diferente do pagador | 2 | 1 | 3 | 6 | Usar `purchase.email` da chave do presenteado. A VALIDAR |

## 9. Variáveis (nomes; valores só no painel, nunca no repositório)

- `GUMROAD_PRODUCT_ID` (obrigatória, com `==`, como a Gumroad mostra).
- `GUMROAD_ALLOW_TEST` (opcional, padrão desligado).
- `GUMROAD_REVERIFY_AFTER_SEC` (opcional, padrão 86400).
- `GUMROAD_PING_SECRET` (só se D4 = sim).
- Reusa `LICENSE_PRIVATE_JWK`, `LICENSE_TTL_DAYS` e `SUPABASE_*`. Nenhuma credencial Gumroad: o `verify` não exige token.

## 10. Plano de testes da T2 (sem chamada real)

- **Unitários** (`fetch` simulado com o JSON de exemplo oficial):
  - Venda ok → token.
  - `refunded` → revoke e 404.
  - `chargebacked` → revoke.
  - `disputed`+`dispute_won` com e sem `charged_back` anterior.
  - 404 da Gumroad, timeout, 429/5xx → 502 sem gravar.
  - Produto diferente, e-mail diferente, `test`, `recurrence`.
  - Corpo enviado contém `increment_uses_count=false` e `product_id`.
  - Normalização (§3).
  - A rota PT `/api/license` com os mesmos testes de antes, inalterados.
- **G3** (`platform 'gumroad'`):
  - Grant com id normalizado → active.
  - Id cru → blocked.
  - `GUMROAD_REFUNDED` → revoked e grant posterior não reativa.
  - `GUMROAD_DISPUTE` → `GUMROAD_CHARGEBACK_REVERSED` → active.
  - Garantir que `GUMROAD_DISPUTE_WON` daria `charged_back` (documenta a armadilha).
  - Mínimo do G3 ajustado ao total exato.

## 11. Decisões do fundador (bloqueiam a T2 onde indicado)

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Renovação com Gumroad fora do ar | (a) falha fechada e mantém o token atual até vencer |
| D2 | Exigir que o e-mail digitado seja o da compra | Sim |
| D3 | `/api/license {email}` (PT) deve ignorar compras `gumroad`? Isso exige mudar `nexo_lookup_license` só para `platform <> 'gumroad'`; PT/Hotmart não muda | Sim, numa etapa própria com G3 (**bloqueia** fechar R3 sem ping) |
| D4 | Usar o Ping (exige cadastrar a URL na conta Gumroad, ação do fundador) e com segredo na URL? | Sim, com segredo |
| D5 | Compras de teste (`test:true`) liberam acesso em produção? | Não |
| D6 | Reembolso parcial mantém o acesso? | Sim (igual ao PT) |
| D7 | Limitar ativações por chave (`increment_uses_count=true` e teto)? | Não agora |
| D8 | Liberar `gumroad.com`/`api.gumroad.com` na rede desta sessão para conferir a doc publicada | Sim, antes da T2 |

## 12. O que NÃO foi verificado

- A página publicada gumroad.com/api (bloqueada); usei o código-fonte oficial e um trecho de busca.
- O formato de **todos** os `sale_id` e `license_key` reais: só os exemplos oficiais. Primeira venda de teste: conferir.
- O limite de chamadas da API.
- Se um vendedor pode trocar o e-mail da compra depois (geraria `transaction_email_conflict`, `schema-purchases.sql:361`).
- Comportamento do `verify` para compra presenteada.
