# Paddle (Billing): segundo canal de venda EN (desenho P1, só documento)

Versão 1, de 04/11/2026, branch `wip/en-foundation`, base `d007d09`. Padrão: `GUMROAD_ENTITLEMENT.md`.
Status: **RASCUNHO DE DESENHO. Sem código, sem migração, sem conta Paddle, nada publicado.** O comportamento PT/Hotmart e o canal Gumroad não mudam.
Pedido: fundador, 04/11/2026 (via revisor). Gumroad continua sendo o canal de lançamento; a Paddle é opção futura.

## 0. Fontes e limite da pesquisa

| # | Fonte | Estado | Data |
|---|---|---|---|
| P1 | Documentação oficial da Paddle (`developer.paddle.com`: webhooks, assinatura, adjustments, sandbox, API) | **NÃO LIDA.** O proxy desta sessão responde 403 em `developer.paddle.com` (`curl`: "CONNECT tunnel failed, response 403"); o agente de leitura também falhou (`ENOTFOUND`) em 12 páginas | 04/11/2026 |
| C1 | Código deste repositório (`api/_lib/schema-purchases.sql`, `gumroad.ts`, `GUMROAD_ENTITLEMENT.md`) | Lido | 04/11/2026 |

**FATO:** nenhuma afirmação sobre a Paddle neste documento foi confirmada em fonte oficial. Tudo que é da Paddle está marcado **A VALIDAR** e, quando aparece uma expectativa, ela é **HIPÓTESE (conhecimento geral, não verificado)**. As partes do nosso lado (banco, tipos canônicos, ids) são FATO do código [C1].
**Como destravar:** liberar `developer.paddle.com` na rede da sessão (decisão do fundador, como a D8 da Gumroad) **ou** o fundador abrir as páginas da lista da §12 no iPhone e confirmar. Os URLs abaixo são os que devem ser lidos; **não foram abertos**.

## 1. Resumo e recomendação

- **Conclusão (INFERÊNCIA):** a Paddle encaixa no mesmo banco (`nexo_purchases`, `platform 'paddle'`) sem mudar o modelo. O que muda é a **ativação**: na Gumroad a licença nasce do `verify` sem segredo; na Paddle a compra só chega por **webhook assinado** (ou por API com chave secreta).
- **Recomendação:** concessão **dirigida por webhook** (a compra concluída grava a concessão) e ativação do comprador por **e-mail + id da transação**, conferidos contra o banco (§5). Sem chave de licença própria na v1 do canal.
- **Não recomendo lançar a Paddle antes de a Gumroad vender:** dois canais dobram suporte e conciliação. Decisão D-P1.
- Pontos legais (quem é o *seller of record*, impostos, país do vendedor pessoa física no Brasil, aprovação da conta): **A VALIDAR na documentação e nos termos da Paddle; não afirmar nos textos legais EN** (D-L2 já evita afirmar o *seller of record*).

## 2. Webhook assinado: verificação (A VALIDAR)

O que o desenho exige, independente dos detalhes da Paddle:

1. Ler o **corpo cru** (bytes), antes de qualquer `JSON.parse`; limite de 64 KB (`readBodyLimited`, como o ping da Gumroad).
2. Verificar a assinatura **antes de qualquer leitura de dados**. Sem assinatura válida → 401, nada gravado, log sem corpo.
3. Comparação em tempo constante; tolerância de relógio (anti-replay) configurável.
4. Segredo do destino de notificação só em variável de ambiente (§9), nunca no repositório.
5. Falha de configuração (segredo ausente) → 503 e nada gravado (falha fechada, como o 503 de chave inválida da licença).

A VALIDAR na doc oficial (lista de perguntas, sem resposta ainda):
- Nome do cabeçalho de assinatura e seu formato. **HIPÓTESE (não verificada):** cabeçalho `Paddle-Signature` com `ts` e `h1`; HMAC-SHA256 sobre `ts` + `:` + corpo cru.
- Tolerância de tempo recomendada.
- Se há mais de um segredo ativo durante rotação.
- Se o corpo cru pode ser reserializado por proxy (Cloudflare Pages Functions) sem quebrar a assinatura.
- Fonte: https://developer.paddle.com/webhooks/signature-verification (**não aberta**).

## 3. Eventos para tipos canônicos

O SQL classifica pelo **nome** do evento que gravamos (`schema-purchases.sql:315-358`), não pelo nome da Paddle. Nomes nossos propostos:

| Situação | Nome gravado por nós | Tipo canônico | Como o SQL decide |
|---|---|---|---|
| Transação concluída (pagamento confirmado) | `PADDLE_TRANSACTION_COMPLETED` (grant) | `active` | `grant` exige `APPROVED` ou `COMPLETE` |
| Reembolso total | `PADDLE_REFUNDED` (revoke) | `refunded` | contém `REFUND` |
| Reembolso parcial | `PADDLE_PARTIAL_REFUND` + valor + `provider_event_id` | `partially_refunded` (mantém acesso) | `PARTIAL`+`REFUND`; **exige `provider_event_id`**, senão bloqueia (`partial_refund_event_id_missing`) |
| Reembolso pendente de aprovação | `PADDLE_REFUND_PENDING_APPROVAL` | `refund_pending_approval` | `REFUND` + `PENDING`/`APPROVAL` |
| Chargeback / disputa aberta | `PADDLE_CHARGEBACK` | `charged_back` | contém `CHARGEBACK` |
| Aviso de chargeback | `PADDLE_CHARGEBACK_WARNING` | `chargeback_warning` | `CHARGEBACK`+`WARNING` |
| Disputa **ganha** | `PADDLE_CHARGEBACK_REVERSED` (revoke) | `chargeback_reverse` → `active` | `CHARGEBACK`+`REVERSE` |
| Pagamento falhou | `PADDLE_PAYMENT_FAILED` | `payment_failed` | `PAYMENT`+`FAILED` |
| Cancelada | `PADDLE_CANCELLED` | `cancelled` | `CANCEL` |

**Armadilhas (FATO do SQL [C1]):**
- **Nunca** gravar `PADDLE_DISPUTE_WON` nem `…CHARGEBACK_WON`: o nome contém `DISPUTE`/`CHARGEBACK` sem `REVERSE` e vira `charged_back`, **revogando quem ganhou** (mesma armadilha do `GUMROAD_DISPUTE_WON`). Disputa ganha = `…CHARGEBACK_REVERSED`.
- Só enviar `CHARGEBACK_REVERSED` se a compra estiver `charged_back` (RPC `nexo_purchase_state`); senão cria bloqueio de conciliação. Mesma regra C1 da Gumroad.
- **Crédito** (ajuste que não devolve dinheiro) **não** tem nome reconhecido: gravar `PADDLE_CREDIT` cairia em `revoke_event_unrecognized` e **bloquearia o e-mail inteiro**. Ajuste de crédito = ignorar (200, sem gravar) e logar. A VALIDAR se a Paddle tem esse tipo.
- Nome que contenha `REFUND` e também `PENDING` muda de tipo: nomes fixos, sem montar string com dados do payload.
- Ordem de entrega não garantida (HIPÓTESE): o SQL já ignora evento mais velho (`older_event`) e não ressuscita compra terminal. Usar o horário do **evento** da Paddle como `occurred_at` na concessão e `now()` na revogação, como na Gumroad (§2 do doc Gumroad).

**A VALIDAR (sem resposta ainda), em https://developer.paddle.com/webhooks/overview (não aberta):**
- Lista exata de eventos e se transação e ajuste (*adjustment*) são eventos separados. **HIPÓTESE:** reembolso e chargeback chegam como *adjustment* com um campo `action`; a transação concluída é outro evento.
- Valores literais de `action` e `status` do ajuste (reembolso, crédito, chargeback, chargeback revertido, aviso), e quais são totais ou parciais.
- Como distinguir reembolso **total** de **parcial** (comparar valor do ajuste com o total da transação?). Sem essa regra, risco R3.
- Se o reembolso passa por aprovação (estado pendente) antes de valer.

## 4. Identificadores e formato

- `platform = 'paddle'` (cabe em `^[a-z][a-z0-9_-]{0,31}$`) [C1].
- Transação: `^[A-Za-z0-9_-]{1,64}$`; produto: `^[A-Za-z0-9._:-]{1,128}$` [C1]. **HIPÓTESE:** ids da Paddle têm prefixo e `_` (ex.: `txn_…`), compatíveis. A VALIDAR o formato real; se vier fora do formato, mesma saída segura da Gumroad: **422 `ativacao_manual`, nada gravado**.
- Guardar o **id da transação** como `transaction_id` e o **id do preço ou produto** como `product_id`.
- `provider_event_id` = id da notificação (deduplicação; A VALIDAR o nome do campo).
- Moeda: `upper()` de 3 letras; valor em unidade maior (`amount numeric(14,2)`). A VALIDAR se a Paddle manda o total em unidade menor como texto.
- E-mail do comprador: A VALIDAR se vem no evento ou só por consulta de cliente na API. **Se só pela API**, o webhook precisa de chamada autenticada (§9, chave de API) ou o desenho muda para ativação sem e-mail do evento.

## 5. Como o comprador ativa

| Opção | Como | Prós | Contras |
|---|---|---|---|
| **A (recomendada)** | E-mail + **id da transação** (do recibo) em `/api/paddle-license`; o servidor confere contra `nexo_purchases` (`platform 'paddle'`) preenchida pelo webhook | Sem chave própria; sem chamada à API da Paddle na ativação; revogação por webhook | Depende de o webhook ter chegado antes (atraso → "tente em alguns minutos"); id da transação vira credencial |
| B | Chave de licença própria gerada por nós no webhook e enviada por e-mail | Mesma experiência da Gumroad | Precisa enviar e-mail (serviço novo, custo, segredo) e armazenar/gerar chave |
| C | A Paddle entrega a chave | Nenhum código de chave | **HIPÓTESE:** a Paddle Billing não gera chave de licença; A VALIDAR. Se não gera, C está descartada |

Detalhes da opção A (INFERÊNCIA):
- Rota nova e separada, como a da Gumroad; **não toca `/api/license` (PT)**.
- Entrada `{ email, transaction_id }`, corpo ≤ 4 KB; validar formato antes de qualquer consulta; resposta de erro genérica (não revelar se o e-mail existe).
- Exige `purchase.email === e-mail digitado` (D2) e `status/access_active` do banco; a renovação reconfere o banco (revogado por webhook corta na próxima renovação, ≤ 1 h online, ≤ `LICENSE_TTL_DAYS` offline).
- **Mudança de SQL necessária (FATO do código [C1]):** hoje `nexo_lookup_license` exclui só `platform <> 'gumroad'` (`schema-purchases.sql:198-199`). Sem generalizar, uma compra `paddle` valeria **só por e-mail** (D3 violada). Antes de qualquer código, trocar para lista de plataformas que exigem segredo (`gumroad`, `paddle`) e cobrir no G3. Essa mudança toca o caminho PT: provar com os testes PT inalterados.
- Id da transação é segredo fraco (aparece no recibo). Mitigação: exigir **também** o e-mail e limitar tentativas (A VALIDAR limite viável em Pages Functions, que não têm contador próprio). Decisão D-P3.

## 6. Sandbox

- **A VALIDAR:** existência de ambiente sandbox separado, URL da API sandbox, conta e chaves separadas, cartões de teste, e se o webhook de sandbox usa segredo próprio. Fonte: https://developer.paddle.com/build/tools/sandbox (**não aberta**).
- Regras do nosso lado (independem da Paddle): variável `PADDLE_ENV=sandbox|production` (padrão **production** só no build de venda; erro se faltar); compra de sandbox **não** pode conceder em produção (equivalente ao `GUMROAD_ALLOW_TEST`, D5): rejeitar evento cujo ambiente não bate com `PADDLE_ENV`. A VALIDAR como o evento identifica o ambiente.
- Teste sem dinheiro: simulador de eventos da Paddle, se existir (A VALIDAR).

## 7. Reembolso, disputa e ajuste: política do app

Igual à Gumroad (D6): reembolso **total** revoga; **parcial** mantém acesso; chargeback revoga; disputa ganha reativa. Prazo de reembolso e quem decide: **A VALIDAR** nos termos do vendedor na Paddle. O texto `REFUND_EN.md` (7 dias, via Gumroad) **precisaria ser reaberto** se a Paddle virar canal: não editar nesta fase.

## 8. Volume e limites

- A VALIDAR: limite de taxa da API; política de retentativas do webhook; prazo de resposta exigido; códigos tratados como sucesso. **HIPÓTESE:** entrega pelo menos uma vez e sem ordem garantida → deduplicar por id de notificação (`nexo_purchase_events`, `provider_event_id`).
- Se o webhook exigir resposta rápida, gravar e responder; sem trabalho pesado.

## 9. Variáveis (nomes; valores só no painel da Cloudflare, nunca no repositório)

- `PADDLE_WEBHOOK_SECRET` (obrigatória; segredo do destino de notificação).
- `PADDLE_ENV` (`sandbox` ou `production`, obrigatória).
- `PADDLE_PRODUCT_ID` (ou id do preço; obrigatória; confere `product_id` do evento).
- `PADDLE_API_KEY` **somente se** o e-mail não vier no evento (§4); a VALIDAR; é segredo de servidor, nunca `VITE_*`.
- `PADDLE_SIGNATURE_TOLERANCE_SEC` (opcional).
- Reusa `LICENSE_PRIVATE_JWK`, `LICENSE_TTL_DAYS` e `SUPABASE_*`. Nenhuma variável `VITE_PADDLE_*` secreta. Link de compra no cliente: variável pública própria (nome a definir; A VALIDAR se o checkout é por link ou por script da Paddle, o que mexeria na CSP).

## 10. DFMEA curto

Escala 1 a 5; RPN = S×O×D.

| # | Modo de falha | Efeito | S | O | D | RPN | Mitigação |
|---|---|---|---|---|---|---|---|
| P1 | Webhook sem verificação ou com verificação frouxa | Qualquer um concede ou revoga | 5 | 2 | 2 | 20 | Assinatura antes de ler; tempo constante; teste com assinatura inválida/ausente/velha |
| P2 | Gravar `…DISPUTE_WON` | Revoga quem ganhou | 4 | 2 | 2 | 16 | Nome fixo `…CHARGEBACK_REVERSED`; teste G3 |
| P3 | Reembolso parcial tratado como total (ou vice-versa) | Revoga indevidamente ou mantém acesso reembolsado | 4 | 3 | 3 | 36 | Regra explícita total×parcial validada na doc; teste com os dois |
| P4 | Ajuste de crédito gravado como revogação | Bloqueio de conciliação no e-mail inteiro | 4 | 2 | 3 | 24 | Ignorar tipos não mapeados (200 + log); nunca gravar nome fora da tabela §3 |
| P5 | `paddle` valendo só por e-mail (D3) | Acesso indevido por quem sabe o e-mail | 4 | 3 | 2 | 24 | Generalizar a exclusão no SQL antes do código; G3 "D3 paddle" |
| P6 | Evento de sandbox concedendo em produção | Acesso grátis | 3 | 2 | 3 | 18 | `PADDLE_ENV` + rejeitar ambiente divergente |
| P7 | Webhook atrasado ou perdido | Comprador não consegue ativar; reembolso não revoga | 3 | 3 | 3 | 27 | Mensagem "tente em alguns minutos"; suporte com runbook manual (`paddle_manual`, como `gumroad_manual`); conciliação por consulta à API (A VALIDAR) |
| P8 | Corpo reserializado quebra a assinatura | Todas as vendas rejeitadas | 5 | 2 | 2 | 20 | Ler bytes crus; teste com corpo real do sandbox |
| P9 | Id de transação adivinhado/vazado | Ativação por terceiro | 3 | 2 | 4 | 24 | Exigir também o e-mail; limitar tentativas; D-P3 |
| P10 | Textos legais/reembolso divergem do canal Paddle | Promessa errada ao comprador | 4 | 3 | 2 | 24 | Reabrir `REFUND_EN` e Termos antes de ligar o canal; D-P5 |
| P11 | Dois canais ativos para o mesmo e-mail | Estados contraditórios | 2 | 2 | 3 | 12 | `platform` separa; acesso = qualquer compra ativa (regra atual de `nexo_refresh_license_access`) |

## 11. Plano de testes (quando houver código; nada executado agora)

- Unitários com assinatura calculada no teste (segredo falso): válida, inválida, ausente, velha, corpo alterado; cada evento da §3 vira o tipo esperado; evento não mapeado → 200 sem gravar; ambiente divergente → rejeitado; id fora do formato → 422 sem gravar; corpo > 64 KB → 413.
- G3 (Postgres real): grant `paddle` ativa; `REFUNDED` revoga e grant posterior não reativa; `CHARGEBACK` → `CHARGEBACK_REVERSED` → ativa; `…DISPUTE_WON` daria `charged_back` (documenta a armadilha); `paddle` não vale por e-mail (P5); reembolso parcial sem `provider_event_id` bloqueia; mínimo do G3 ajustado ao total exato.
- Rotas PT e Gumroad com os testes existentes, inalterados.

## 12. O que NÃO foi verificado

- **Toda a documentação da Paddle** (§0). Páginas a ler antes de qualquer código: `developer.paddle.com/webhooks/signature-verification`, `…/webhooks/overview`, `…/webhooks/respond-to-webhooks`, eventos de transação e de ajuste, `…/build/tools/sandbox`, referência da API (limites, consulta de transação e cliente), e os termos do vendedor (país, pessoa física, impostos, reembolso).
- Se a Paddle aceita vendedor pessoa física no Brasil e quais as condições: **não encontrado, não pesquisado.**
- Qualquer valor de campo, nome de cabeçalho ou de evento da Paddle citado como HIPÓTESE.

## 13. Decisões do fundador (abertas)

| # | Decisão | Recomendação |
|---|---|---|
| D-P1 | Abrir o canal Paddle agora ou depois da primeira venda Gumroad? | Depois |
| D-P2 | Liberar `developer.paddle.com` na rede da sessão, ou o fundador valida as páginas da §12? | Liberar só leitura, ou o fundador valida |
| D-P3 | Ativação: A (e-mail + id da transação), B (chave nossa por e-mail) ou C (se a Paddle emitir chave)? | A |
| D-P4 | Aceitar mudar o SQL de exclusão por e-mail (D3) para uma lista de plataformas, com G3 | Sim, só com prova de que o PT não mudou |
| D-P5 | Reabrir `REFUND_EN` e Termos (prazo, quem é o *seller of record*, impostos) se a Paddle virar canal | Sim, antes de ligar |
| D-P6 | Falha da Paddle/webhook na renovação: falha fechada mantendo o token até `exp` (como D1) | Sim |
| D-P7 | Conta Paddle (cadastro, aprovação, dados pessoais) | Ação do fundador, fora desta sessão |
