# OPERAÇÃO EN — guia do fundador (leitura no iPhone)

Versão 1, 08/11/2026. Escrito pela sessão de engenharia (Sonnet). Branch `wip/ops`, a partir de `5461f40`.
Estado informado pelo revisor (não verificado por esta sessão): EN em produção (deploy `66b2e3e4` = v2.6.0-rc2); venda bloqueada pela Stripe (KYC).

**Regras deste guia**
- Consultas das seções 1 e 4 são **só SELECT**: não alteram nada.
- Nunca cole chave de licença, `service_role`, JWK privada ou token em chat, e-mail ou repositório.
- Onde diz **A VALIDAR**, o nome do botão/menu não foi conferido por mim. Confie no que a tela mostrar.
- E-mail sempre em minúsculas nas consultas. Ids da Gumroad sem o `==` final.

Onde rodar SQL: Supabase → **SQL Editor** → nova consulta (projeto de **produção**, salvo se disser staging).

---

## 1. Observação: 48 h e primeiras vendas

### 1.1 Rotina (3 vezes ao dia nas primeiras 48 h; depois 1 vez ao dia por uma semana)

| Onde | O que olhar | Sinal de alerta |
|---|---|---|
| Gumroad → Sales | vendas novas, reembolsos, disputas | reembolso ou disputa sem você saber |
| Supabase (SQL abaixo) | compras, bloqueios abertos | bloqueio aberto; compra sem acesso |
| Cloudflare → função | erros 5xx e linhas `gumroad … rejected` | pico de 502/503; `rejected (id_fora_do_formato)` |
| Caixa de suporte | e-mails de "não consigo entrar" | 2 ou mais iguais no mesmo dia |

### 1.2 Consultas do Supabase (só leitura)

**A. Compras Gumroad das últimas 72 h**
```sql
select platform, transaction_id, email, status, access_active, amount, currency, last_event, last_event_occurred_at
  from public.nexo_purchases
 where platform like 'gumroad%' and last_event_occurred_at > now() - interval '72 hours'
 order by last_event_occurred_at desc;
```
Esperado: `status = 'active'` e `access_active = true` para venda normal.

**B. Bloqueios abertos (um bloqueio aberto corta TODO o acesso do e-mail)**
```sql
select id, email, platform, transaction_id, reason, event_type, created_at
  from public.nexo_reconciliation_blocks
 where resolved_at is null order by created_at desc;
```
Esperado: **zero linhas**. Qualquer linha = ação (ver 2).

**C. Compras com problema**
```sql
select platform, transaction_id, email, status, access_active, refunded_amount, last_event, last_event_occurred_at
  from public.nexo_purchases
 where platform like 'gumroad%' and (access_active = false or status <> 'active')
 order by last_event_occurred_at desc;
```
Esperado: só reembolsos/disputas que você conhece.

**D. Eventos recebidos nas últimas 48 h**
```sql
select platform, provider_event_id, transaction_id, event_type, occurred_at, received_at, applied
  from public.nexo_purchase_events
 where received_at > now() - interval '48 hours' order by received_at desc;
```
Nota: concessões pela rota `/api/gumroad-license` **não** geram linha aqui (não têm id de evento). Vazio não é erro.

**E. Contagem por status**
```sql
select platform, status, access_active, count(*) as total
  from public.nexo_purchases group by 1, 2, 3 order by 1, 2;
```

**F. Licenças ativas sem compra ativa (devia ser vazio)**
```sql
select l.email, l.status
  from public.nexo_licenses l
 where l.status = 'active'
   and not exists (select 1 from public.nexo_purchases p where p.email = l.email and p.access_active);
```
Se vier linha: pode ser concessão antiga da Hotmart (PT) ou erro. Anote o e-mail e confira em 4.

### 1.3 Cloudflare (A VALIDAR os nomes de menu)
- Pages → seu projeto → **Functions** → logs em tempo real (ou `wrangler pages deployment tail`).
- Linhas úteis: `gumroad grant → active (…)`, `gumroad … → rejected (motivo)`, `gumroad verify indisponível`, `gumroad: falha ao gravar`.
- O e-mail aparece **mascarado**; a license key nunca aparece.
- Motivos de `rejected`: `id_fora_do_formato`, `sem_email`, `email_diferente`, `outro_produto`, `compra_de_teste`, `assinatura`.
- Web Analytics (landing `/en/`): só mede visitas; não afeta compra nem acesso.

### 1.4 Gumroad (A VALIDAR os nomes de menu)
- **Sales**: venda nova aparece com o e-mail e a license key (não copie a chave para lugar nenhum além do suporte direto ao cliente).
- Reembolso feito no painel → o app corta o acesso na **próxima verificação online** (até cerca de 24 h online; até 30 dias se o aparelho ficar offline).
- Disputa (chargeback) aparece na venda; o acesso é cortado igual.

### 1.5 Sinais de alerta e primeira ação

| Sinal | Provável causa | Ação |
|---|---|---|
| Vários 503 `License activation is temporarily unavailable` | variável faltando/inválida na Cloudflare | conferir variáveis de **Production** (nomes em LANCAMENTO_EN §2); impressão digital da chave (§4.2) |
| Vários 502 | Gumroad ou banco fora | esperar; ver status da Gumroad/Supabase; sem ação no código |
| Venda sem `nexo_purchases` | cliente ainda não entrou (a compra só grava na 1ª ativação) | normal; não é erro |
| `rejected (id_fora_do_formato)` | formato novo de id na Gumroad | conceder manual (2.3) e avisar a engenharia |
| Bloqueio aberto | evento fora de ordem ou id inválido | seção 2, passo B |

---

## 2. Comprador não consegue entrar

### 2.1 Primeiro: qual mensagem apareceu?

| Mensagem na tela | O que significa | Ir para |
|---|---|---|
| "We couldn’t find an active purchase matching this email address and license key." (404) | chave/e-mail errados, compra reembolsada, produto errado | 2.2 |
| "We found your Gumroad purchase but couldn't activate it automatically. Please contact support…" (422) | compra real, id fora do formato esperado | 2.3 |
| "We couldn’t verify your license right now. Please try again in a few minutes." (502) | Gumroad ou banco fora do ar | 2.4 |
| "License activation is temporarily unavailable. Please contact support." (503) | configuração do servidor | 2.5 |
| "Access expired. Enter your email and license key again." (401) | passou de 30 dias sem renovar | 2.6 |
| "No internet connection…" | sem rede no aparelho | pedir para conectar |
| Entrava e deixou de entrar ("This purchase is no longer active") | reembolso ou chargeback | 2.7 |

### 2.2 "We couldn’t find an active purchase" (404)
1. Peça ao cliente: **e-mail usado na compra** e **foto/print do recibo** (a chave tem 4 blocos de 8 caracteres). Não peça nada além disso.
2. Confira no Gumroad (Sales) que a venda existe e **não** está reembolsada/em disputa.
3. Teste a chave direto na Gumroad (PowerShell, no seu PC; **A VALIDAR**: este comando não foi executado por esta sessão):
```powershell
$k = Read-Host "License key" -AsSecureString
$plain = [System.Net.NetworkCredential]::new('', $k).Password
try {
  Invoke-RestMethod -Method Post -Uri 'https://api.gumroad.com/v2/licenses/verify' -Body @{
    product_id = '<PRODUCT_ID com ==>'; license_key = $plain; increment_uses_count = 'false'
  } | ConvertTo-Json -Depth 5
} catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }
```
   - Troque `<PRODUCT_ID com ==>` pelo id do produto como a Gumroad mostra (com `==`). Mantenha `increment_uses_count = 'false'`: assim a consulta não conta como uso.
   - **404 / `success: false`**: chave digitada errada (espaço, letra trocada) ou chave de outro produto. Peça para copiar do recibo.
   - **`success: true`** e `purchase.refunded`, `disputed` ou `chargebacked` = `true`: o app **deve** negar. Explique ao cliente (reembolso/disputa).
   - **`success: true`** e `purchase.email` diferente do digitado: peça que use o e-mail **da compra**.
   - **`success: true`**, tudo normal e o app nega: vá para 2.3 e para a consulta 13.1 (GUMROAD_ENTITLEMENT).
4. No Supabase, rode a consulta 13.1 do runbook (compras + bloqueios do e-mail). Bloqueio aberto → 2.8.

### 2.3 422 "couldn't activate automatically" → concessão manual
1. Confirme a compra no painel da Gumroad (e-mail, valor, **sem** reembolso).
2. Anote: e-mail em minúsculas; `sale_id` **sem** `==` (ou `order-<número do pedido>` se o id tiver caractere fora de `A-Z a-z 0-9 _ -`).
3. Rode a concessão do **runbook 13.2** (GUMROAD_ENTITLEMENT). Esperado: `{"result": "active", "status": "active"}`. Esta é uma **escrita**: confira cada valor antes.
4. Peça ao cliente para entrar de novo (e-mail + chave).
5. **Avise a engenharia** com o motivo (`id_fora_do_formato` ou `sem_email`), sem mandar chave nem e-mail completo.

### 2.4 502 "couldn’t verify right now"
Espere 5 a 10 minutos e peça para tentar de novo. Se persistir por mais de 30 minutos: veja o log da Cloudflare (`verify indisponível` = Gumroad; `falha ao gravar` = banco) e o status dos dois serviços.

### 2.5 503 "temporarily unavailable"
Problema seu, não do cliente. Cloudflare → variáveis de **Production**: confira que existem `GUMROAD_PRODUCT_ID`, `LICENSE_PRIVATE_JWK` e as do Supabase (nomes em LANCAMENTO_EN §2). A resposta 503 lista `faltando`/`invalida` (sem valores). Depois, compare a impressão digital (LANCAMENTO_EN §4.2).

### 2.6 401 "Access expired"
Normal depois de 30 dias offline. O cliente digita e-mail e chave de novo (precisa de internet).

### 2.7 "This purchase is no longer active"
1. Gumroad → a venda foi reembolsada ou entrou em disputa?
2. Supabase: consulta 13.1. `refunded`/`charged_back` e `access_active = false` = esperado.
3. Se foi engano seu (reembolso indevido): corrija na Gumroad; se ainda negar, avise a engenharia antes de mexer no banco.

### 2.8 Bloqueio aberto (consulta B)
Um bloqueio aberto corta o acesso de **todas** as compras daquele e-mail. Leia `reason`, corrija a causa (ex.: id inválido → conceder manual 13.2) e só então resolva com 13.4. Se não entender o `reason`, **não resolva**: chame a engenharia.

### 2.9 Respostas-modelo (rascunho em inglês)
O `SUPPORT_EN.md` existe, mas na branch `wip/paddle` (sessão 5): **a juntar** (ainda não está nesta branch). Até lá, use estas 4 respostas curtas.
- Pedido de dados: "Hi! Please reply with the email you used at checkout and a screenshot of your Gumroad receipt (the license key is on it). Thanks!"
- Chave errada: "That key does not match a purchase. Please copy it again from the receipt, with no spaces, and sign in with the purchase email."
- Concessão manual feita: "Done — your access is active. Please sign in again with your purchase email and license key."
- Reembolso: "Your purchase was refunded, so access ended at the next license check. If this is a mistake, tell us and we will check it right away."
Revise o tom antes de usar. Não prometa prazo que o sistema não garante.

---

## 3. Limpeza do staging

Objetivo: o staging expôs credenciais e tem chaves de teste. Faça **nesta ordem**. Nada disto mexe na produção.

### 3.1 Trocar a `service_role` exposta (Supabase **staging**)
1. Supabase (projeto de staging) → **Settings → API** (A VALIDAR o nome exato do menu).
2. Gere uma nova chave `service_role`/secret e **revogue a antiga**. Se o painel só oferecer girar o "JWT secret", isso invalida anon **e** service_role: aceite, é staging.
3. Atualize a variável do Supabase no ambiente **Preview** da Cloudflare (A VALIDAR) com a nova chave e republique o Preview só se precisar.
4. Confirme que a chave de **produção** é **outra** (projeto Supabase diferente). Não use a mesma em dois lugares.
5. Se a chave antiga apareceu em chat, print ou repositório, trate-a como comprometida mesmo depois da troca.

### 3.2 Apagar variáveis de teste do Preview (Cloudflare)
Cloudflare → Pages → projeto → **Settings → Variables and Secrets → Preview** (A VALIDAR):
- Apague `GUMROAD_ALLOW_TEST`.
- Apague `GUMROAD_DEBUG_REASONS`.
- Confirme que **nenhuma das duas existe em Production** (LANCAMENTO_EN já manda não criar; a de debug **nunca** em Production).
- Se o Preview usa a mesma `LICENSE_PRIVATE_JWK` da produção, troque por um par só de teste (ou apague), porque quem tem acesso ao Preview assina tokens válidos em produção se o par for o mesmo.

### 3.3 Desativar chaves e compras de teste
- **Gumroad**: em cada venda de teste, desative a license key (A VALIDAR: opção na venda) e arquive/despublique produtos de teste.
- **Supabase staging**: confirme que nenhum e-mail real está lá; se houver, não apague agora (consulte a engenharia).
- **Chaves de teste do repositório**: o par de `tests/e2e/fixtures/license-test-keys.json` é público e **só** serve a testes; nunca use em ambiente real.
- Verifique que a `VITE_LICENSE_PUBLIC_JWK` do build de produção tem a **mesma impressão digital** da privada de produção (LANCAMENTO_EN §4.2).

### 3.4 Conferência final (marque no iPhone)
- [ ] service_role antiga revogada
- [ ] `GUMROAD_ALLOW_TEST` fora do Preview e de Production
- [ ] `GUMROAD_DEBUG_REASONS` fora do Preview e de Production
- [ ] chaves de teste da Gumroad desativadas
- [ ] par de chaves do Preview diferente do de produção

---

## 4. Identificar compras inseridas à mão (só leitura)

Contexto (informado pelo revisor): houve uma concessão manual em produção, com sale id normalizado, por fora do roteiro. Compra automática grava `platform = 'gumroad'` com id de **22 caracteres** (sale id sem `==`) e `last_event = 'GUMROAD_SALE_APPROVED'`. Concessão manual do runbook usa `platform = 'gumroad_manual'` e id `order-<número>`.

**Nenhuma consulta abaixo altera dados.**

**4.1 Tudo que é manual pelo roteiro**
```sql
select platform, transaction_id, email, status, access_active, amount, currency, last_event, last_event_occurred_at
  from public.nexo_purchases where platform = 'gumroad_manual' order by last_event_occurred_at desc;
```

**4.2 `gumroad` fora do padrão (pode ter sido inserida à mão com a plataforma errada)**
```sql
select platform, transaction_id, length(transaction_id) as tamanho, email, status, access_active, amount, currency, product_id, last_event, last_event_occurred_at
  from public.nexo_purchases
 where platform = 'gumroad'
   and (length(transaction_id) <> 22
        or transaction_id like 'order-%'
        or last_event not in ('GUMROAD_SALE_APPROVED', 'GUMROAD_REFUNDED', 'GUMROAD_DISPUTE', 'GUMROAD_CHARGEBACK_REVERSED')
        or last_event is null
        or amount is null or currency is null)
 order by last_event_occurred_at desc;
```
Cada linha pede explicação: confira a venda no painel da Gumroad.

**4.3 Produtos diferentes do seu (id de produto estranho)**
```sql
select platform, product_id, count(*) as total
  from public.nexo_purchases group by 1, 2 order by 3 desc;
```
O `product_id` do seu produto (sem `==`) deve dominar. Qualquer outro valor merece olhar.

**4.4 Compra ativa sem evento de venda real e com valor zero ou nulo**
```sql
select platform, transaction_id, email, status, amount, currency, last_event, last_event_occurred_at
  from public.nexo_purchases
 where access_active and (amount is null or amount = 0) order by last_event_occurred_at desc;
```
Valor 0 pode ser cupom de 100% (o teste de fumaça usa um): confira cada caso na Gumroad.

**4.5 Licenças ativas sem compra correspondente**
```sql
select l.email, l.status, l.updated_at
  from public.nexo_licenses l
 where l.status = 'active'
   and not exists (select 1 from public.nexo_purchases p where p.email = l.email)
 order by l.updated_at desc nulls last;
```
Pode ser concessão antiga da Hotmart (PT) — anote e confira com o seu histórico.

**4.6 Linha do tempo de um e-mail específico**
```sql
select 'compra' as tipo, p.platform, p.transaction_id, p.status::text, p.last_event_occurred_at as quando
  from public.nexo_purchases p where p.email = 'cliente@exemplo.com'
union all
select 'bloqueio', b.platform, b.transaction_id, b.reason, b.created_at
  from public.nexo_reconciliation_blocks b where b.email = 'cliente@exemplo.com'
order by quando desc;
```

**Como ler:** compare cada linha de 4.1/4.2 com a venda no painel da Gumroad (e-mail, valor, data). Linha sem venda correspondente = inserida sem compra real. **Não apague nem edite**: anote e decida com a engenharia (revogar é pelo runbook 13.3).

---

## 5. O que esta sessão NÃO verificou
- Nenhuma consulta SQL deste guia foi executada contra o seu banco de produção (não há acesso); os nomes de tabelas e colunas vêm de `api/_lib/schema-purchases.sql`. As funções `nexo_*` citadas têm testes de integração (`tests/integration/store.postgres.test.ts`).
- O comando PowerShell e os nomes de menu da Cloudflare, Gumroad e Supabase estão marcados **A VALIDAR**.
- O estado de produção (deploy, V5=200, KYC da Stripe) é informação do revisor.
