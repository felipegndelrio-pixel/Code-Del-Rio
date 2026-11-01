# Lançamento EN (Gumroad) — runbook do fundador

Versão 2, de 01/11/2026 (v1 de 31/10/2026), branch `wip/en-foundation`. **Escrito por Sonnet; revisar** (a política pede Opus alto para schema e reembolso). Feito para o iPhone. **Nenhum segredo neste arquivo**: os valores ficam só nos painéis (Cloudflare, Supabase, Gumroad).

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
2. Produto de **pagamento único**, US$ 39, com **license key ligada** na aba Content (nome exato da opção: A VALIDAR na tela; a doc oficial cita o "license key block on the product's Content tab").
3. Anotar o **product_id** do bloco de license key, na aba Content (formato `xxxx==`). Ele vai na variável `GUMROAD_PRODUCT_ID` exatamente como aparece.
4. Mensagem de entrega ao comprador:
   `Open https://<seu-domínio>/entrar?lang=en and sign in with this email and your license key.`
5. **Não** é preciso Ping para lançar (ver §14 de `GUMROAD_ENTITLEMENT.md`).

**Pronto quando:** o produto existe, você tem o product_id e o link de compra (`https://<você>.gumroad.com/l/<produto>`).

## 2. Variáveis no Cloudflare Pages

Em Settings → Variables and Secrets → Production. São só nomes; os valores ficam com você.

| Nome | Valor | Tipo |
|---|---|---|
| `GUMROAD_PRODUCT_ID` | product_id da etapa 1.3. Com ou sem `==`: o código compara e envia à Gumroad já normalizado, com `==` | texto |
| `VITE_GUMROAD_CHECKOUT_URL` | link de compra da Gumroad | texto (build) |
| `VITE_EN_TERMS_URL` | URL pública dos Termos EN | texto (build), **só quando a página existir** |
| `VITE_EN_PRIVACY_URL` | URL pública da Privacidade EN | idem |
| `VITE_EN_REFUND_URL` | URL pública da política de reembolso EN | idem |
| `GUMROAD_REVERIFY_AFTER_SEC` | opcional (padrão 86400) | texto |
| `GUMROAD_ALLOW_TEST` | **não criar** (compra de teste desligada) | — |

- `VITE_GUMROAD_CHECKOUT_URL` e `VITE_EN_*` **não** são exigidas pelo `check-sale-env`: se faltarem, o build passa e a tela EN fica sem o botão de compra ou sem os links. Confira na etapa 5 (E2).
- Mudou uma `VITE_*`? Só vale depois de **Deployments → Retry deployment** (entra no build). `GUMROAD_*` as functions leem a cada requisição.
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

### 3.1 O que este SQL muda em relação à rc1 (FATO: `git diff 31f0ed5 HEAD -- api/_lib/schema-purchases.sql`, 25 linhas)
1. `nexo_lookup_license` passa a ignorar compras `platform = 'gumroad'` (acesso só por e-mail não vale para Gumroad). Hotmart e demais: igual.
2. Função nova, só leitura: `nexo_purchase_state(text, text)`, com `execute` só para `service_role`.
- Tudo dentro de uma transação (`begin`/`commit`) e reaplicável: se der erro, nada é gravado.
- **Nenhuma tabela é criada, alterada ou apagada.** O app antigo (rc1) continua funcionando com este SQL aplicado: ele não chama a função nova e não tem compras `gumroad`.

### 3.2 Rollback do schema (só se necessário)
- **Regra:** rollback do app **não exige** rollback do SQL (§7). Prefira não mexer no banco.
- Se mesmo assim precisar desfazer a função nova (leitura apenas, sem efeito colateral):
  ```sql
  drop function if exists public.nexo_purchase_state(text, text);
  ```
- **Não reverta `nexo_lookup_license` para a versão da rc1 se já houver compra `gumroad` no banco.** A versão da rc1 voltaria a liberar essas compras só pelo e-mail (decisão D3 violada). Para voltar à rc1 antes da 1ª venda: reaplique o `schema-purchases.sql` do commit `31f0ed5`.
- Antes de qualquer SQL: registre a contagem de `nexo_purchases` (`select count(*) from public.nexo_purchases;`) e confira que é a mesma depois.

## 4. Código no ar — exige GO seu (merge e deploy)

1. A branch `wip/en-foundation` precisa chegar à branch de produção do Pages. Isso é merge, que esta sessão não faz:
   - abra um PR de `wip/en-foundation` para a branch de produção;
   - confira o G3 verde;
   - faça o merge você mesmo.
2. O Pages faz o build sozinho pela integração com o GitHub. Se mudou variável depois do build: **Deployments → Retry deployment**.

**Pronto quando:** o deployment novo está como Production, e `/api/license` e `/api/gumroad-license` aparecem em Functions.

### 4.1 Build e deploy: comandos prontos
Caminho recomendado: **integração com o GitHub** (nenhum comando no terminal). Configuração já descrita em `DEPLOY_CLOUDFLARE.md`, Passo 3: branch de produção `main`, Root directory `apps/nexoprocess`, build `cd ../.. && npm ci && npm run nexo:build`, saída `dist`, `NODE_VERSION=22`. Variáveis só no painel.

Se preferir publicar do computador (Windows, PowerShell, na raiz do repositório, com a árvore limpa). As três variáveis do `check-sale-env` e a `VITE_GUMROAD_CHECKOUT_URL` vêm do painel; copie cada valor para a sessão **no seu terminal**, nunca para este repositório:
```powershell
git checkout main; git pull --ff-only
npm ci
npm run nexo:build:venda
npm run nexo:check-bundle
$GIT_COMMIT = git rev-parse HEAD
Set-Location apps/nexoprocess
npx wrangler pages deploy dist --project-name nexoprocess --branch main --commit-hash $GIT_COMMIT --commit-dirty=false
```
- Limite: esse caminho exige definir as variáveis `VITE_*` na sessão antes (o painel não vale para `wrangler`). Por isso o recomendado é a integração com o GitHub. Detalhes e alternativa: `DEPLOY_CLOUDFLARE.md`, "Alternativa: publicar pela linha de comando".
- `nexo:check-bundle` falha só se a **entrada** passar de 130 KB gzip ou se a tabela proibir pacotes pesados no inicial (hoje: entrada 23 KB, inicial 157,8 KB, passa).

## 5. Verificação no iPhone (Safari)

| # | Teste | Esperado |
|---|---|---|
| E1 | `https://<domínio>/entrar` | Tela em **português** (Hotmart), igual a antes |
| E2 | `https://<domínio>/entrar?lang=en` | "Sign in to NexoProcess", campos Purchase email + License key |
| E3 | E-mail qualquer + chave inventada | "We could not find an active purchase…" |
| E4 | `GET https://<domínio>/api/gumroad-license` | HTTP 405 `{"error":"metodo"}` |
| E5 | Login PT de um comprador Hotmart ativo | Entra, como antes |
| E6 | **Primeira venda real**: comprador entra com e-mail + chave | Entra. Se aparecer "couldn't activate it automatically", use o runbook §13 de `GUMROAD_ENTITLEMENT.md` |

### 5.1 Verificações pós-deploy por comando (qualquer terminal)
**A VALIDAR:** `nexoprocess.pages.dev` é o endereço que consta em `DEPLOY_CLOUDFLARE.md`; o domínio de produção pode ser personalizado. Troque pelo domínio que o comprador realmente usa antes de rodar.
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://nexoprocess.pages.dev/entrar
curl -s -w "\n%{http_code}\n" https://nexoprocess.pages.dev/api/gumroad-license
curl -s -w "\n%{http_code}\n" https://nexoprocess.pages.dev/api/license
curl -s -w "\n%{http_code}\n" -X POST https://nexoprocess.pages.dev/api/gumroad-license -H "Content-Type: application/json" -d '{"email":"nao-existe@example.com","license_key":"00000000-00000000-00000000-00000000"}'
```
| Comando | Esperado |
|---|---|
| 1 `/entrar` | `200` |
| 2 `GET /api/gumroad-license` | `405` e `{"error":"metodo"}` (nunca HTML) |
| 3 `GET /api/license` | `405` e `{"error":"metodo"}` |
| 4 POST com chave inventada | `404` (sem compra). **`503` = variável faltando** (o corpo lista os nomes que faltam, sem valores); `502` = Gumroad ou Supabase inacessível |
- Se o comando 4 retornar `503`, confira `GUMROAD_PRODUCT_ID`, `LICENSE_PRIVATE_JWK` e `SUPABASE_*` no painel. A tela do E2 e o CSP: `TEST_BASE_URL=https://nexoprocess.pages.dev npm run nexo:test:csp` (Passo 4 do `DEPLOY_CLOUDFLARE.md`).
- Os comandos acima não foram executados por esta sessão (sem acesso à produção): **A VALIDAR por você**.

- Falha em E1, E4 ou E5, ou erro 5xx em `/api/*`: **rollback do app** (Deployments → deployment anterior → Rollback). O rollback não mexe no banco.
- Falha só em E2, E3 ou E6: o PT segue funcionando. Tratar sem rollback.

## Teste de fumaça real (fundador, antes de abrir a venda; sem mexer em variáveis)
1. Faça uma compra do próprio produto com **cupom de 100%**.
2. Ative em `/entrar?lang=en` com o e-mail da compra e a license key. Esperado: entra (token).
3. No painel da Gumroad, **reembolse** essa compra.
4. Tente ativar de novo com a mesma chave. Esperado: "We could not find an active purchase" (HTTP 404) e, no banco, a compra como `refunded` (consulta no runbook §13 de `GUMROAD_ENTITLEMENT.md`).
5. Anote só **se o product_id/sale_id tem "=" e o comprimento**, nunca o valor.
- Prova a detecção de reembolso com evidência real. Se falhar no passo 2, a causa mais provável é formato de id ou `GUMROAD_PRODUCT_ID` (o código aceita a variável com ou sem "==" e envia à Gumroad o id já com "==", mas isso só foi testado com a Gumroad simulada; A VALIDAR com a 1ª compra real).
- Pendente de decisão do fundador (NÃO implementado): TTL próprio de 7 dias para tokens Gumroad, para reduzir a janela offline após reembolso.

## 6. Rollback (resumo)
| Situação | Ação | Mexe no banco? |
|---|---|---|
| E1, E4, E5 falham ou 5xx em `/api/*` | Pages → `nexoprocess` → Deployments → deployment anterior → **Rollback to this deployment**. Confirme `/api/license` e `/api/gumroad-license` em Functions (a anterior pode não ter a segunda) | Não |
| Só EN com defeito (E2, E3, E6) | Sem rollback; PT segue. Corrigir em seguida | Não |
| Cliente Gumroad sem acesso, app ok | Runbook §13 de `GUMROAD_ENTITLEMENT.md` (conceder/revogar manual) | Sim, pontual |
| Voltar da rc1 para a v2.4.5 | `DEPLOY_CLOUDFLARE.md`, "Troca inicial e retomada após rollback". Preserve o banco | Não destrutivo |
| Desfazer o SQL de §3 | §3.2; normalmente desnecessário | Só a função nova |
- Emergência sem banco: `LICENSE_ALLOWLIST` (ver `DEPLOY_CLOUDFLARE.md`).
- Rollback do app **não** reverte variáveis: se a causa foi variável errada, corrija no painel e use **Retry deployment**.

## 7. O que ainda NÃO está pronto para EN (31/10/2026)

- **Interface interna em EN: em andamento.** Até terminar, o comprador EN entra em inglês e vê partes do app em português.
- **Landing EN e páginas legais EN:** dependem do pacote `f5-landing-en.tar`, que ainda não foi anexado à sessão de engenharia.
- **Verificação em Safari do iPhone e Android reais:** só depois do deploy (etapa 5).
