# Deploy na Vercel — NexoProcess com acesso pela compra na Hotmart

Guia passo a passo do build de venda: PWA instalável, acesso liberado pelo e-mail da compra, revogado em reembolso ou chargeback.

## ⚠️ Antes de começar: custo

**O plano gratuito da Vercel (Hobby) é só para uso pessoal não comercial.** A política de uso justo da Vercel diz que todo uso comercial exige o plano Pro ou Enterprise, e cita como exemplo anunciar a venda de um produto ([Fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines)). Vender pelo Hotmart é uso comercial. Por isso:

- **Vercel para vender = plano Pro (pago).** Confira o preço atual em vercel.com/pricing (não confirmado aqui).
- **Alternativa sem mensalidade:** Cloudflare Pages. O projeto já tem `public/_headers` e o teste de CSP via `wrangler`. As funções de `api/` são `Request → Response` padrão e se adaptam ao Cloudflare Pages Functions com dois arquivos de poucas linhas. A permissão de uso comercial no plano gratuito do Cloudflare é **a validar** nos termos atuais.
- **Supabase** (banco das licenças): o plano gratuito atende ao volume inicial. Projetos gratuitos pausam por inatividade; confira os limites atuais.

## Como funciona

```
Comprador ──compra──▶ Hotmart ──webhook──▶ /api/hotmart-webhook ──grava──▶ Supabase (nexo_licenses)
    │                                                                          ▲
    └─▶ app (PWA) /entrar ──e-mail──▶ /api/license ──consulta───────────────────┘
                     ◀── token assinado (ECDSA, 30 dias) ──
        token salvo no aparelho → app abre offline; renova a cada 7 dias (reembolso revoga)
```

- **Processos e planilhas nunca saem do aparelho.** Só o e-mail vai ao servidor (`docs/PRIVACIDADE.md`).
- **Sem configuração, ninguém entra:** a API responde 503.
- **O mesmo código** do app roda aberto (arquivo único, testes) ou fechado (Vercel com `VITE_LICENSE_REQUIRED=true`).

## O que você precisa

| Conta | Para quê | Custo |
|---|---|---|
| GitHub (`felipedelrii`) | Repositório `Code-Del-Rio` | gratuito |
| Vercel | Hospedagem do app e das funções `/api` | **Pro para uso comercial** |
| Supabase | Tabela de licenças | gratuito (limites atuais a validar) |
| Hotmart | Venda, checkout e webhook | taxa por venda (conforme a Hotmart) |

## Passo 1 — Supabase (banco das licenças)

1. supabase.com → **New project**. Guarde a senha do banco.
2. **SQL Editor** → cole o conteúdo de [`api/_lib/schema.sql`](../api/_lib/schema.sql) → **Run**. Isso cria `nexo_licenses` com RLS ligado e sem políticas: a chave pública não acessa nada.
3. **Project Settings → API**: copie a **Project URL** (`SUPABASE_URL`) e a chave **service_role** (`SUPABASE_SERVICE_ROLE_KEY`). A `service_role` é secreta: só vai na Vercel, nunca no app nem no repositório.

## Passo 2 — Chaves do token de acesso

Na sua máquina, com o repositório clonado e `npm ci` feito:

```bash
node apps/nexoprocess/scripts/license-keys.mjs
```

A saída tem duas linhas:
- **`LICENSE_PRIVATE_JWK`**: secreta, só na Vercel, marcada como *Sensitive*. Guarde uma cópia no seu gerenciador de senhas.
- **`VITE_LICENSE_PUBLIC_JWK`**: pública, vai no build.

Trocar o par depois desconecta todos os compradores (cada um entra de novo com o e-mail).

## Passo 3 — Projeto na Vercel

1. vercel.com → **Add New → Project** → importe `felipedelrii/Code-Del-Rio`.
2. **Root Directory:** `apps/nexoprocess`. Deixe ligado "Include files outside the root directory": o build usa o `package.json` da raiz.
3. **Framework Preset:** *Other*. Instalação, build e saída já estão em [`vercel.json`](../vercel.json): `npm ci` e `npm run nexo:build` na raiz, saída em `dist`.
4. **Environment Variables** (Production; repita em Preview se quiser testar lá):

| Variável | Valor | Tipo |
|---|---|---|
| `VITE_LICENSE_REQUIRED` | `true` | build |
| `VITE_LICENSE_PUBLIC_JWK` | linha pública do passo 2 | build |
| `VITE_HOTMART_CHECKOUT_URL` | link do checkout da Hotmart (ex.: `https://pay.hotmart.com/…`) | build |
| `LICENSE_PRIVATE_JWK` | linha secreta do passo 2 | **Sensitive** |
| `SUPABASE_URL` | Project URL do passo 1 | servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role do passo 1 | **Sensitive** |
| `HOTMART_HOTTOK` | Hottok do passo 5 (pode adicionar depois) | **Sensitive** |
| `HOTMART_PRODUCT_ID` | ID do produto na Hotmart (opcional; filtra outros produtos) | servidor |
| `LICENSE_ALLOWLIST` | opcional, sem Supabase: e-mails separados por vírgula com acesso liberado | servidor |
| `LICENSE_TTL_DAYS` | opcional (padrão 30): dias de uso offline sem revalidar | servidor |

5. **Deploy.** Variáveis `VITE_*` entram no build: depois de mudar alguma, faça **Redeploy**.

## Passo 4 — Conferir o deploy (5 minutos)

Troque `https://SEU-APP.vercel.app` pelo endereço do deploy.

```bash
# 1) Cabeçalhos de segurança (a Vercel usa o vercel.json; o teste confere a CSP diretiva a diretiva)
TEST_BASE_URL=https://SEU-APP.vercel.app npm run nexo:test:csp

# 2) Todas as rotas sem violação de CSP, com service worker
TEST_BASE_URL=https://SEU-APP.vercel.app npm run nexo:test:csp:rotas

# 3) API de acesso responde (sem compra → 404 "sem_licenca"; sem configuração → 503)
curl -s -X POST https://SEU-APP.vercel.app/api/license -H 'Content-Type: application/json' -d '{"email":"teste@exemplo.com"}'
```

Observações:
- O teste 2 entra em `/app`. No build de venda, isso redireciona para `/entrar`, o que é esperado. Ele continua valendo para a CSP.
- **A validar no primeiro deploy:** as funções usam a assinatura padrão `export function POST(request: Request)`. Se o `curl` devolver o `index.html` ou 404 da Vercel em vez de JSON, confira em **Deployments → Functions** se `api/license` e `api/hotmart-webhook` aparecem.
- **PWA:** abra no Chrome do celular → menu → **Instalar app**. Abra uma vez com internet, entre com o e-mail; depois funciona em modo avião.

## Passo 5 — Webhook na Hotmart

1. Hotmart → **Ferramentas → Webhook (API e notificações)** → **Cadastrar webhook**.
2. **URL:** `https://SEU-APP.vercel.app/api/hotmart-webhook` · **Versão:** 2.0.0 · **Produto:** o NexoProcess.
3. **Eventos:**
   - para liberar: compra aprovada e compra completa;
   - para revogar: compra reembolsada, chargeback, compra cancelada, compra expirada e protesto/disputa.
   - Os outros eventos (boleto impresso, atrasada…) são ignorados com 200.
4. Copie o **Hottok** (aba de autenticação) → Vercel `HOTMART_HOTTOK` → **Redeploy**.
5. Clique em **Enviar teste** e confira em Vercel → **Logs** uma linha `hotmart PURCHASE_… → active (a***@…)`.

**A validar com esse teste.** O formato oficial não pôde ser consultado durante o desenvolvimento, então o parser (`api/_lib/hotmart.ts`) aceita as duas formas conhecidas:
- **2.0.0:** JSON com `event` e `data.buyer.email`, Hottok no cabeçalho `X-HOTMART-HOTTOK`;
- **1.0:** formulário com `hottok`, `email`, `status`.

Se o log mostrar `ignorado: sem e-mail` ou `401`, abra o **Histórico** do webhook na Hotmart, copie o corpo recebido e ajuste os caminhos em `parseHotmart`. Há testes em `tests/api/license.test.ts` para cobrir o novo formato.

## Passo 6 — Teste de ponta a ponta

1. **Com allowlist:** coloque seu e-mail em `LICENSE_ALLOWLIST` → Redeploy → `/entrar` → entra.
2. **Com compra real de teste:** compre o produto com valor mínimo ou cupom → confira a linha em `nexo_licenses` → `/entrar` com esse e-mail → entra → reembolse → em até 7 dias, com internet, o acesso sai. Para testar na hora, use "Meus processos → Apagar dados locais" (remove também o acesso) e tente entrar de novo.

## Operação

- **Liberar manualmente:**

  ```sql
  insert into nexo_licenses (email, status, event) values ('pessoa@ex.com', 'active', 'MANUAL')
  on conflict (email) do update set status = 'active', event = 'MANUAL', updated_at = now();
  ```

- **Revogar:** `update nexo_licenses set status = 'revoked', updated_at = now() where email = 'pessoa@ex.com';`
- **Reverter um deploy ruim:** Vercel → Deployments → deploy anterior → **Promote to Production**. É instantâneo.
- **Emergência sem banco:** defina `LICENSE_ALLOWLIST` com os e-mails que precisam entrar.

## Limites conhecidos (decisões conscientes)

| Limite | Por quê | Mitigação |
|---|---|---|
| Quem souber o e-mail de um comprador consegue entrar | Login só por e-mail, sem envio de código: zero custo e zero atrito | Exigir também o código da transação (HP…) ou um link mágico por e-mail (tem custo de envio). A decidir conforme o volume de abuso. |
| O app roda no navegador; quem alterar o JavaScript contorna o bloqueio | Inerente a app 100% local e offline | O token assinado impede forjar acesso editando o `localStorage`; o resto é dissuasão, não DRM |
| Sem limite de tentativas na `/api/license` | A Vercel não tem limite por IP no plano básico sem um armazenamento extra | Resposta igual para "não existe" e "revogada" (não confirma e-mails); avaliar Vercel Firewall ou contador no Supabase |
| O arquivo único (`nexo:build:single`) fica aberto | É o modo demonstração/offline, sem servidor | **Não distribua o arquivo único aos compradores;** distribua o link do app |

## Desenvolvimento local

- `npm run nexo:dev`: app aberto (sem licença).
- **Testes:**
  - `npm run nexo:test:unit` inclui a API (`tests/api/`);
  - `npm run nexo:e2e` inclui o projeto `licenca`, um build com licença ligada e chave **só de teste**, em que a API real roda em memória.
- **Funções reais localmente:** `npx vercel dev` (exige login na Vercel).
