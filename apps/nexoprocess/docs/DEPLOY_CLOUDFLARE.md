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

```bash
export VITE_LICENSE_PUBLIC_JWK='<linha pública do passo 2>'
export VITE_HOTMART_CHECKOUT_URL='https://pay.hotmart.com/SEU-PRODUTO'
export VITE_SUPPORT_EMAIL='suporte@seudominio.com.br'
npm ci && npm run nexo:build:venda
cd apps/nexoprocess && npx wrangler pages deploy dist --project-name SEU-PROJETO --branch main
```

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

- **Liberar manualmente:**

  ```sql
  insert into nexo_licenses (email, status, event) values ('pessoa@ex.com', 'active', 'MANUAL')
  on conflict (email) do update set status = 'active', event = 'MANUAL', updated_at = now();
  ```

- **Revogar:** `update nexo_licenses set status = 'revoked', updated_at = now() where email = 'pessoa@ex.com';`
- **Reverter um deploy ruim:** Deployments → deploy anterior → **Rollback to this deployment**.
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
