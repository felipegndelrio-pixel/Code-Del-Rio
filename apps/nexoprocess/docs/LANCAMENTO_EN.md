# Lançamento EN (Gumroad) — runbook do fundador

Versão 1, de 31/10/2026, branch `wip/en-foundation`. Feito para o iPhone. **Nenhum segredo neste arquivo**: os valores ficam só nos painéis (Cloudflare, Supabase, Gumroad).

Quem executa: o fundador (esta sessão de engenharia não tem acesso a Cloudflare, Supabase nem Gumroad).
Ordem: sem pular etapas. Cada etapa tem um "pronto quando" verificável.

## 0. Antes de tudo: o que está no ar? (A VALIDAR)

- **Onde olhar:** Cloudflare → Pages → `nexoprocess` → Deployments → o deployment de Production.
- **Se ainda for a v2.4.5:** o lançamento EN inclui a **troca para o backend novo da rc1** (registro de compras). É o caso que `DEPLOY_CLOUDFLARE.md` prevê (rollback para `782574b2`).
  - Siga a seção **"Troca inicial e retomada após rollback"** de `docs/DEPLOY_CLOUDFLARE.md`, passos 1 a 7: exportar `nexo_licenses`, impressão digital, divergência zero.
  - **Não pule esse procedimento.**
- **Se já for a rc1:** a etapa 3 abaixo só reaplica `schema-purchases.sql`, que é idempotente e não muda o Hotmart.

## 1. Gumroad (o fundador já está fazendo)

1. Conta com recebimento configurado (PayPal/conta).
2. Produto de **pagamento único**, US$ 39. Em "Content" → ligar **"Generate a unique license key per sale"**.
3. Anotar o **product_id** do bloco de license key, na aba Content (formato `xxxx==`). Ele vai na variável `GUMROAD_PRODUCT_ID` exatamente como aparece.
4. Mensagem de entrega ao comprador:
   `Open https://<seu-domínio>/entrar?lang=en and sign in with this email and your license key.`
5. **Não** é preciso Ping para lançar (ver §14 de `GUMROAD_ENTITLEMENT.md`).

**Pronto quando:** o produto existe, você tem o product_id e o link de compra (`https://<você>.gumroad.com/l/<produto>`).

## 2. Variáveis no Cloudflare Pages

Em Settings → Variables and Secrets → Production. São só nomes; os valores ficam com você.

| Nome | Valor | Tipo |
|---|---|---|
| `GUMROAD_PRODUCT_ID` | product_id da etapa 1.3 | texto |
| `VITE_GUMROAD_CHECKOUT_URL` | link de compra da Gumroad | texto (build) |
| `VITE_EN_TERMS_URL` | URL pública dos Termos EN | texto (build), **só quando a página existir** |
| `VITE_EN_PRIVACY_URL` | URL pública da Privacidade EN | idem |
| `VITE_EN_REFUND_URL` | URL pública da política de reembolso EN | idem |
| `GUMROAD_REVERIFY_AFTER_SEC` | opcional (padrão 86400) | texto |
| `GUMROAD_ALLOW_TEST` | **não criar** (compra de teste desligada) | — |

- As variáveis atuais (`LICENSE_PRIVATE_JWK`, `SUPABASE_*`, `HOTMART_*`, `VITE_LICENSE_*`, `VITE_SUPPORT_EMAIL`) continuam iguais.
- Sem as `VITE_EN_*`, a tela EN simplesmente não mostra os links legais. Melhor publicar as páginas legais antes de vender (CDC/LGPD; nos EUA, A VALIDAR com assessoria).

## 3. Banco (Supabase) — exige GO seu

1. Se a produção estiver na v2.4.5: siga a etapa 0 (troca completa).
2. Se já estiver na rc1: Supabase → SQL Editor → colar e rodar **o arquivo inteiro** `apps/nexoprocess/api/_lib/schema-purchases.sql` **do mesmo commit que será publicado**.
3. Conferir:
   ```sql
   select public.nexo_lookup_license('<um e-mail Hotmart ativo>');   -- {"status": "active"}, como antes
   select count(*) from public.nexo_reconciliation_blocks where resolved_at is null;  -- igual ao de antes
   ```

**Pronto quando:** o lookup do Hotmart ativo continua `active` e os bloqueios não aumentaram.

## 4. Código no ar — exige GO seu (merge e deploy)

1. A branch `wip/en-foundation` precisa chegar à branch de produção do Pages. Isso é merge, que esta sessão não faz:
   - abra um PR de `wip/en-foundation` para a branch de produção;
   - confira o G3 verde;
   - faça o merge você mesmo.
2. O Pages faz o build sozinho pela integração com o GitHub. Se mudou variável depois do build: **Deployments → Retry deployment**.

**Pronto quando:** o deployment novo está como Production, e `/api/license` e `/api/gumroad-license` aparecem em Functions.

## 5. Verificação no iPhone (Safari)

| # | Teste | Esperado |
|---|---|---|
| E1 | `https://<domínio>/entrar` | Tela em **português** (Hotmart), igual a antes |
| E2 | `https://<domínio>/entrar?lang=en` | "Sign in to NexoProcess", campos Purchase email + License key |
| E3 | E-mail qualquer + chave inventada | "We could not find an active purchase…" |
| E4 | `GET https://<domínio>/api/gumroad-license` | HTTP 405 `{"error":"metodo"}` |
| E5 | Login PT de um comprador Hotmart ativo | Entra, como antes |
| E6 | **Primeira venda real**: comprador entra com e-mail + chave | Entra. Se aparecer "couldn't activate it automatically", use o runbook §13 de `GUMROAD_ENTITLEMENT.md` |

- Falha em E1, E4 ou E5, ou erro 5xx em `/api/*`: **rollback do app** (Deployments → deployment anterior → Rollback). O rollback não mexe no banco.
- Falha só em E2, E3 ou E6: o PT segue funcionando. Tratar sem rollback.

## 6. O que ainda NÃO está pronto para EN (31/10/2026)

- **Interface interna em EN: em andamento.** Até terminar, o comprador EN entra em inglês e vê partes do app em português.
- **Landing EN e páginas legais EN:** dependem do pacote `f5-landing-en.tar`, que ainda não foi anexado à sessão de engenharia.
- **Verificação em Safari do iPhone e Android reais:** só depois do deploy (etapa 5).
