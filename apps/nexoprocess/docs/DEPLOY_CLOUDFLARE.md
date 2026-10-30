# Publicar no Cloudflare Pages — NexoProcess com acesso pela compra na Hotmart

**Caminho recomendado para vender sem mensalidade.** É o mesmo app do guia da Vercel ([`DEPLOY_VERCEL.md`](DEPLOY_VERCEL.md)), mas aqui:
- a API roda em **Pages Functions** (`functions/api/*`), sobre os mesmos handlers de `api/_lib/`;
- os cabeçalhos de segurança vêm direto de `public/_headers`, o formato nativo do Pages.

> Estado: **não publicado**. Tudo foi validado localmente no runtime do Pages (`wrangler pages dev`): CSP, rotas e a API completa (`npm run nexo:test:api`). O deploy exige a conta do titular.

## Custo

| Item | Plano gratuito | Fonte |
|---|---|---|
| Arquivos do app (HTML, JS, ícones) | requisições ilimitadas | [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing) |
| API (`/api/license`, `/api/hotmart-webhook`) | 100.000 requisições/dia, somadas à cota gratuita de Workers (zera à meia-noite UTC) | idem |
| Uso comercial no plano gratuito | **a validar nos termos atuais do Cloudflare** (não encontrei restrição nem permissão explícita) | — |
| Supabase (tabela de licenças) | plano gratuito; projetos pausam por inatividade (limites atuais a validar) | — |

Ordem de grandeza: cada comprador gera 1 requisição na ativação e até 1 por hora de uso com internet (ex.: 1.000 compradores abrindo 4 vezes por dia ≈ 4 mil/dia); cada venda gera de 1 a 2 webhooks. **100 mil/dia sobra muito para o início.** O plano pago do Workers remove o limite diário.

## Como funciona

```
Comprador ──compra──▶ Hotmart ──webhook──▶ /api/hotmart-webhook ──grava──▶ Supabase (nexo_licenses)
    │                                                                          ▲
    └─▶ app (PWA) /entrar ──e-mail──▶ /api/license ──consulta───────────────────┘
                     ◀── token assinado (ECDSA, 30 dias) ──
        token salvo no aparelho → app abre offline; confere a compra em 2º plano se o token tem > 1 h (reembolso revoga)
```

Processos e planilhas nunca saem do aparelho; só o e-mail vai ao servidor (`docs/PRIVACIDADE.md`). Sem configuração, ninguém entra: a API responde 503.

## Passo 1 — Supabase (banco das licenças)

1. supabase.com → **New project**.
2. **SQL Editor** → cole [`api/_lib/schema.sql`](../api/_lib/schema.sql) → **Run**. Isso cria `nexo_licenses` com RLS ligado e sem políticas: a chave pública não acessa nada.
3. **Project Settings → API**: copie a **Project URL** (`SUPABASE_URL`) e a chave **service_role** (`SUPABASE_SERVICE_ROLE_KEY`, secreta).

## Passo 2 — Chaves do token de acesso

```bash
node apps/nexoprocess/scripts/license-keys.mjs
```

A saída tem duas linhas:
- `LICENSE_PRIVATE_JWK`: **secreta**; guarde no gerenciador de senhas;
- `VITE_LICENSE_PUBLIC_JWK`: pública, usada no build.

Trocar o par depois desconecta todos os compradores (cada um entra de novo com o e-mail).

## Passo 3 — Projeto no Pages (integração com o GitHub)

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → `felipedelrii/Code-Del-Rio`.
2. Configuração de build:

| Campo | Valor |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| **Root directory** | `apps/nexoprocess` (é onde ficam `functions/` e `public/_headers`) |
| Build command | `cd ../.. && npm ci && npm run nexo:build` |
| Build output directory | `dist` |

3. **Settings → Variables and Secrets** (Production; repita em Preview se quiser testar lá):

| Variável | Valor | Tipo |
|---|---|---|
| `NODE_VERSION` | `22` | texto |
| `VITE_LICENSE_REQUIRED` | `true` | texto (build) |
| `VITE_LICENSE_PUBLIC_JWK` | linha pública do passo 2 | texto (build) |
| `VITE_HOTMART_CHECKOUT_URL` | link do checkout da Hotmart | texto (build) |
| `VITE_SUPPORT_EMAIL` | e-mail de suporte mostrado ao comprador | texto (build) |
| `LICENSE_PRIVATE_JWK` | linha secreta do passo 2 | **Secret** |
| `SUPABASE_URL` | Project URL | texto |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role | **Secret** |
| `HOTMART_HOTTOK` | Hottok do passo 5 (pode adicionar depois) | **Secret** |
| `HOTMART_PRODUCT_ID` | ID do produto na Hotmart (opcional; filtra outros produtos) | texto |
| `LICENSE_ALLOWLIST` | opcional, sem Supabase: e-mails separados por vírgula | texto |
| `LICENSE_TTL_DAYS` | opcional (padrão 30) | texto |

4. **Deploy.** Depois de mudar variáveis, vá em **Deployments → Retry deployment**: as `VITE_*` entram no build, e as functions leem o resto a cada requisição.

**SPA:** sem `404.html` no build, o Pages serve `index.html` para as rotas do app. As functions só respondem em `/api/license` e `/api/hotmart-webhook`; o resto continua estático.

**Subcaminho:** para servir em `/algo/`, defina `VITE_BASE=/algo/`.

### Alternativa: publicar pela linha de comando (wrangler)

As variáveis do painel **não** valem para `wrangler pages deploy`: o build é feito no seu computador. Use o build de venda, que se recusa a rodar sem as chaves (sem elas o app sairia aberto, sem `/entrar` nem modo demo):

No Windows (PowerShell ou cmd), configure `VITE_LICENSE_PUBLIC_JWK`, `VITE_HOTMART_CHECKOUT_URL` e `VITE_SUPPORT_EMAIL` no ambiente da sessão e execute `npm ci` e `npm run nexo:build:venda` na raiz do repositório. O script valida as variáveis, exige que não haja alterações rastreadas e injeta o SHA completo do commit em `<meta name="nexo-build-id">`; funciona também em Git Bash. O deploy usa a pasta `apps/nexoprocess/dist`:

```powershell
$GIT_COMMIT = git rev-parse HEAD
Set-Location apps/nexoprocess
npx wrangler pages deploy dist --project-name nexoprocess --branch main --commit-hash $GIT_COMMIT --commit-dirty=false
```

O deployment deve ser feito a partir do mesmo commit limpo usado no build.

As variáveis do servidor (`LICENSE_PRIVATE_JWK`, `SUPABASE_*`, `HOTMART_*`) continuam no painel: as functions as leem a cada requisição.

## Passo 4 — Conferir o deploy

Troque `https://SEU-PROJETO.pages.dev` pelo endereço do deploy.

```bash
# Cabeçalhos de segurança (CSP diretiva a diretiva)
TEST_BASE_URL=https://SEU-PROJETO.pages.dev npm run nexo:test:csp

# Todas as rotas sem violação de CSP, com service worker
TEST_BASE_URL=https://SEU-PROJETO.pages.dev npm run nexo:test:csp:rotas

# API: sem compra → 404 "sem_licenca"; sem configuração → 503; GET → 405 (JSON, nunca o index.html)
curl -s -X POST https://SEU-PROJETO.pages.dev/api/license -H 'Content-Type: application/json' -d '{"email":"teste@exemplo.com"}'
```

**PWA:** abra no Chrome do celular → menu → **Instalar app**. Entre com o e-mail uma vez com internet; depois funciona em modo avião. No iPhone: Safari → Compartilhar → **Adicionar à Tela de Início**.

## Passo 5 — Webhook na Hotmart

1. Hotmart → **Ferramentas → Webhook (API e notificações)** → **Cadastrar webhook**.
2. **URL:** `https://SEU-PROJETO.pages.dev/api/hotmart-webhook` · **Versão:** 2.0.0 · **Produto:** o NexoProcess.
3. **Eventos:**
   - para liberar: compra aprovada e compra completa;
   - para revogar: compra reembolsada, chargeback, compra cancelada, compra expirada e protesto/disputa.
4. Copie o **Hottok** → variável `HOTMART_HOTTOK` (Secret) → **Retry deployment**.
5. **Enviar teste** → Cloudflare → o projeto → **Deployments → (o deploy) → Functions → Real-time logs**: deve aparecer `hotmart PURCHASE_… → active (a***@…)`.

**A validar com esse teste.** O formato oficial da Hotmart não pôde ser consultado durante o desenvolvimento, então o parser (`api/_lib/hotmart.ts`) aceita as duas formas conhecidas:
- **2.0.0:** JSON com `event` e `data.buyer.email`, token no cabeçalho `X-HOTMART-HOTTOK`;
- **1.0:** formulário com `hottok`, `email`, `status`.

Se o log mostrar `ignorado: sem e-mail` ou `401`, copie o corpo do **Histórico** do webhook na Hotmart e ajuste `parseHotmart`. Os testes ficam em `tests/api/license.test.ts`.

## Passo 6 — Teste de ponta a ponta

1. **Com allowlist:** seu e-mail em `LICENSE_ALLOWLIST` → Retry deployment → `/entrar` → entra.
2. **Com compra real de valor mínimo ou cupom:**
   - confira a linha em `nexo_licenses`;
   - entre em `/entrar` com esse e-mail;
   - reembolse;
   - para ver o efeito na hora, use "Meus processos → Apagar dados locais" (remove também o acesso) e tente entrar de novo: deve aparecer "Não encontramos uma compra ativa".

## Operação

### Troca inicial e retomada após rollback

Execute esta sequência em janela de baixo movimento. Na primeira troca e após rollback, exporte `nexo_licenses` e registre sua impressão digital **antes de qualquer SQL**. Na primeira troca, aplique então `schema-refund-history.sql` e `schema-purchases.sql`, nessa ordem; depois siga os passos 2–6. Após rollback, siga os mesmos passos desde a exportação. Não publique a versão nova até todos os critérios passarem.

1. Exporte `nexo_licenses` em CSV e guarde-o fora do repositório e de conversas. Calcule e registre a impressão digital abaixo; guarde apenas a contagem e o hash no registro da mudança. Faça isso antes de aplicar qualquer SQL.

   ```sql
   select count(*) as linhas,
          md5(coalesce(string_agg(email || '|' || status || '|' || coalesce(transaction, '') || '|' || coalesce(product_id, ''), ',' order by email), '')) as impressao
     from public.nexo_licenses;
   ```

2. Antes de reaplicar `schema-purchases.sql`, consulte a divergência:

   ```sql
   select count(*) as licencas_divergentes
     from public.nexo_licenses l
    where (l.status = 'active') is distinct from
          ((public.nexo_lookup_license(l.email)->>'status') = 'active');
   ```

   Esta consulta só cobre e-mails que ainda têm linha em `nexo_licenses`; não detecta compras que não estejam representadas nessa tabela.

3. Para cada licença `revoked` cujo `nexo_lookup_license(email)` ainda retorne `active`, confira a transação, produto, comprador e evento de reembolso/chargeback no histórico da Hotmart. Este bloco é **somente para reembolso total ou chargeback confirmado**. Só registre o evento se plataforma e transação coincidirem exatamente com a identidade da compra existente. O SQL abaixo é um modelo: substitua os valores uma única vez no topo por dados confirmados antes de executar.

   ```sql
   do $$
   declare
     v_tx text := '<transação>';
     v_email text := lower(btrim('<e-mail>'));
     v_prod text := '<produto>';
     v_event text := '<evento>';
     v_when text := '<timestamp>';
     v_before integer;
     v_after integer;
     v_active boolean;
     v_result jsonb;
   begin
     if v_tx like '<%' or v_email like '<%' or v_prod like '<%'
        or v_event like '<%' or v_when like '<%' then
       raise exception 'Substitua todos os valores-modelo por dados verificados';
     end if;

     if not exists (
       select 1 from public.nexo_purchases
        where platform = 'hotmart' and transaction_id = v_tx and email = v_email
     ) then
       raise exception 'Compra Hotmart correspondente não existe; parar para reconciliação';
     end if;

     select count(*) into v_before from public.nexo_reconciliation_blocks
      where email = v_email and resolved_at is null;
     v_result := public.nexo_revoke_purchase(
       p_platform => 'hotmart', p_transaction => v_tx, p_email => v_email,
       p_product_id => v_prod, p_event => v_event, p_occurred_at => v_when::timestamptz
     );
     select count(*) into v_after from public.nexo_reconciliation_blocks
      where email = v_email and resolved_at is null;
     select access_active into v_active from public.nexo_purchases
      where platform = 'hotmart' and transaction_id = v_tx;
     if v_result ? 'ignored' or v_after <> v_before or coalesce(v_active, true) then
       raise exception 'Evento ignorado ou não aplicado como esperado; nada foi gravado: %', v_result;
     end if;
     raise notice 'Revogação registrada: %', v_result;
   end $$;
   ```

   Marcador não substituído, compra ausente, `ignored`, bloqueio novo ou compra ainda ativa causa erro e reverte o bloco inteiro. Um `result = 'blocked'` pode ser o resultado correto quando a única compra foi revogada; o critério é o estado da compra e a ausência de bloqueio novo.

   Para a divergência inversa (`nexo_licenses.status = 'active'` e lookup não ativo), confira a transação na Hotmart. Uma transação válida, distinta e aprovada durante o rollback será inserida pela reaplicação, se ainda não existir no registro. Se a transação já existir — sobretudo em estado reembolsado, chargeback, cancelado, expirado ou falha — **pare para análise manual**. Não use `nexo_grant_purchase` para reativá-la: a função ignora aprovações para compras em estado terminal, e a projeção pode voltar a revogar a licença.

4. Reaplique `schema-purchases.sql` da mesma tag/commit que será publicado. A reaplicação projeta novamente os acessos e pode alterar `nexo_licenses`.
5. Rode novamente a consulta de divergência. O resultado deve ser **zero**. Confirme também que as linhas, o hash da impressão digital e os bloqueios abertos foram revisados; qualquer diferença inesperada interrompe a troca.
6. Só então publique o build testado e identificado pelo SHA. Depois, execute V3–V6 abaixo.
7. Com o backend novo publicado e recebendo webhooks, repita uma vez os passos 2–5: consulte a divergência, reconcilie os eventos confirmados, reaplique `schema-purchases.sql` e confirme divergência zero. Isso captura compras processadas pelo backend antigo entre a consulta final e a publicação, que podem existir apenas em `nexo_licenses` e não serem vistas pelo lookup baseado em compras. Se restar qualquer divergência, pare e analise antes de encerrar a troca.

### Verificações de liberação V3–V6

- **V3 — rota da API:** `GET https://nexoprocess.pages.dev/api/license` deve responder HTTP `405` com JSON `{"error":"metodo"}`; nunca deve retornar o HTML da aplicação.
- **V4 — sem compra:** em janela anônima, `/entrar` com um e-mail sem compra ativa deve recusar o acesso.
- **V5 — licença ativa:** em sessão privada do fundador, `/entrar` com o e-mail da licença ativa deve liberar o acesso. Não registre nem compartilhe esse e-mail nos logs de revisão.
- **V6 — webhook:** um evento de teste suportado pela Hotmart deve criar/atualizar a licença e aparecer nos logs. Para comprovar também revogação ponta a ponta, use uma compra de teste que possa ser reembolsada; compra real só com aprovação explícita do custo. Verifique a linha/projeção após aprovação e revogação.

Falha em qualquer V3–V6 ou erro 5xx em `/api/*` dispara o rollback do app descrito abaixo. Após rollback, preserve o banco e repita a sequência de retomada antes de publicar novamente.

- **Operações manuais por versão:** na **v2.4.5**, a projeção ainda é `nexo_licenses`; o procedimento direto abaixo só vale nessa versão. Na versão nova, o acesso deriva de `nexo_purchases`/`nexo_lookup_license`: libere apenas registrando uma compra verificada ou usando `LICENSE_ALLOWLIST` como contingência operacional. Uma linha manual sem transação em `nexo_licenses` vira bloqueio de reconciliação na reaplicação; não a use para liberar acesso.

  **Somente v2.4.5 — liberar diretamente:**

  ```sql
  insert into nexo_licenses (email, status, event) values ('pessoa@ex.com', 'active', 'MANUAL')
  on conflict (email) do update set status = 'active', event = 'MANUAL', updated_at = now();
  ```

- **Somente v2.4.5 — revogar diretamente:** `update nexo_licenses set status = 'revoked', updated_at = now() where email = 'pessoa@ex.com';`.
- **Versão nova — revogar:** após confirmar plataforma e transação na Hotmart, use `nexo_revoke_purchase` pelo procedimento validado no passo 3. Sem identidade confiável da compra, crie/trate bloqueio de reconciliação; não altere diretamente a projeção `nexo_licenses`.
- **Criar bloqueio na versão nova:** faça isso somente no SQL Editor com uma sessão administrativa; a função não está disponível às roles da API. Antes de chamar qualquer função, valide os dados e normalize o e-mail exatamente como o banco (`lower(btrim(email))`); rejeite qualquer marcador ainda não substituído. Na mesma transação, chame `public.nexo_add_reconciliation_block(email_normalizado, plataforma, transação_ou_null, produto_ou_null, motivo, evento, timestamp_confirmado)` e depois `public.nexo_refresh_license_access(email_normalizado)`. Confirme que há um bloqueio aberto para o e-mail e que a projeção em `nexo_licenses` reflete o bloqueio; sem esses dois resultados, pare e investigue.
- **Reverter um deploy ruim:** se qualquer verificação V3–V6 falhar ou houver erro 5xx em `/api/*`, Pages → `nexoprocess` → Deployments → deployment `782574b2` (`782574b2.nexoprocess.pages.dev`) → **Rollback to this deployment**. Confirme que o deployment voltou e que `/api/license` e `/api/hotmart-webhook` aparecem em Functions. Esse rollback troca o app/API; não reverte o banco.
- **Banco após rollback do app:** não remova as tabelas de compras nem o histórico de reembolsos. Siga a seção **Troca inicial e retomada após rollback** antes de voltar à versão nova. Não faça reversão destrutiva do esquema sem backup restaurável e revisão explícita.
- **Emergência sem banco:** `LICENSE_ALLOWLIST` com os e-mails que precisam entrar.

## Limites conhecidos (decisões conscientes)

| Limite | Mitigação |
|---|---|
| Quem souber o e-mail de um comprador consegue entrar (login só por e-mail) | Exigir o código da transação (HP…) ou um link mágico por e-mail, se houver abuso |
| Quem alterar o JavaScript contorna o bloqueio (app 100% local) | O token assinado impede forjar acesso pelo `localStorage`; o resto é dissuasão, não DRM |
| Sem limite de tentativas na `/api/license` | Resposta igual para "não existe" e "revogada"; avaliar Rate Limiting do Cloudflare |
| O arquivo único (`nexo:build:single`) fica aberto | **Não distribua o arquivo único aos compradores;** distribua o link do app |

## Desenvolvimento e testes locais

```bash
npm run nexo:build
npm run nexo:test:csp        # cabeçalhos reais (wrangler pages dev)
npm run nexo:test:csp:rotas  # 24 rotas + exportações, zero violações
npm run nexo:test:api        # API no runtime do Pages (workerd) com Supabase falso: 10 verificações
```

Deploy direto, sem Git: `npx wrangler pages deploy apps/nexoprocess/dist --project-name nexoprocess`. Exige `wrangler login`, e as functions precisam ser enviadas a partir de `apps/nexoprocess`.

## Netlify / GitHub Pages

O app existente na raiz continua com `netlify.toml` e `.github/workflows/pages.yml` intactos. O NexoProcess não altera esses fluxos.

## Passo 6 — Entrega ao comprador (Hotmart)

O app não usa a área de membros da Hotmart: o acesso é liberado pelo webhook e o comprador entra com o **mesmo e-mail da compra**. Na configuração do produto, informe ao comprador onde acessar (página de obrigado/URL de acesso e e-mail de confirmação — os nomes exatos dos campos mudam no painel da Hotmart: **TO VALIDATE**).

Texto pronto para a página de obrigado e para a descrição do produto:

> **Seu acesso ao NexoProcess já está liberado.** Abra **https://SEU-DOMINIO/entrar** no celular ou no computador e digite o **mesmo e-mail usado nesta compra**. Na primeira vez é preciso internet; depois o app funciona offline. No iPhone, toque em Compartilhar → Adicionar à Tela de Início; no Android, menu → Instalar app. Seus processos ficam salvos só no seu aparelho. Dúvidas: **SEU-EMAIL-DE-SUPORTE**.

## Checklist de lançamento

1. Supabase com `schema.sql` aplicado (passo 1) e chaves geradas (passo 2).
2. Build de venda publicado (`nexo:build:venda` ou build pelo Git com as variáveis do passo 3).
3. `/app` redireciona para `/entrar` (se abrir direto, o build saiu aberto).
4. `nexo:test:csp` e `nexo:test:csp:rotas` com `TEST_BASE_URL` do deploy (passo 4).
5. Webhook cadastrado, `HOTMART_HOTTOK` configurado, "Enviar teste" com log `→ active` (passo 5).
6. Compra real de teste (ou cupom 100%) → entrar com o e-mail → reembolso → acesso encerrado na próxima renovação.
7. Validação manual em aparelhos reais: [`COMPATIBILIDADE.md`](COMPATIBILIDADE.md).
8. Pendências comerciais e jurídicas: [`COMERCIALIZACAO.md`](COMERCIALIZACAO.md).
