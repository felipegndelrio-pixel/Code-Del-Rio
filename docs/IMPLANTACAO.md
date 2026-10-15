# Implantação (Supabase Free + Netlify Free)

> Estado: **não publicado**. Este ambiente não possui credenciais de Supabase nem
> de Netlify. Os passos abaixo exigem login do titular das contas.

## 0. Pré-requisito de segurança
O repositório `felipegndelrio-pixel/Code-Del-Rio` está **público** no GitHub.
Não há segredos no código, mas recomenda-se torná-lo privado
(GitHub → Settings → General → Danger Zone → Change visibility).

## 1. Supabase (≈10 min)
1. https://supabase.com → **New project** (organização no plano **Free**; não
   informe cartão; não habilite add-ons). Região sugerida: São Paulo (sa-east-1).
2. Aplicar as migrations, em ordem — escolha uma opção:
   - **SQL Editor**: cole e execute cada arquivo de `supabase/migrations/` em ordem numérica; ou
   - **CLI**: `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`.
3. **Authentication → URL Configuration**: Site URL = URL do Netlify; Redirect
   URLs = `https://<site>.netlify.app/**`.
4. **Authentication → Providers → Email**: manter “Confirm email” ligado.
   **Authentication → Policies/Passwords**: tamanho mínimo 8.
   (O envio de e-mails do plano Free tem limite baixo por hora; para uso real,
   configure SMTP próprio em Authentication → SMTP.)
5. Crie sua conta pela tela **Criar conta** da aplicação e, no SQL Editor:
   ```sql
   update public.profiles set is_platform_admin = true, can_create_projects = true
   where email = 'seu-email@empresa.com';
   ```
6. **Project Settings → API**: copie a URL e a chave **anon/publishable**.
   **Nunca** use a `service_role`/secret no front-end.

## 2. Netlify (≈5 min)
1. https://app.netlify.com → **Add new site → Import from Git** → este repositório.
2. Build: `npm run build`, publish `dist` (já em `netlify.toml`).
3. **Site settings → Environment variables**:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Conferir em `https://<site>.netlify.app`: login, manifesto
   (`/manifest.webmanifest`) e HTTPS.
5. **Billing**: confirme plano Free e que **auto recharge está desligado**.
6. Para economizar créditos: desative “Deploy Previews”/“Branch deploys” se não
   usar, evite publicar produção a cada commit (Build settings → Stop builds, e
   publique manualmente) e teste localmente antes.

Se o domínio do Supabase for diferente de `*.supabase.co`, ajuste
`connect-src` na CSP do `netlify.toml`.

## 3. Serviços, cotas e custos
Classificação: **TO VALIDATE** — as páginas oficiais de preço não puderam ser
acessadas deste ambiente; valores abaixo vêm de fontes secundárias (2026) e
devem ser confirmados nas páginas oficiais antes do uso.

| Serviço | Plano | Limites relevantes (TO VALIDATE) | O que pode gerar custo / bloqueio |
|---|---|---|---|
| Supabase | Free | 500 MB de banco; ~1 GB de Storage; 50.000 MAU; 2 projetos ativos; **pausa após 7 dias sem atividade**; sem backup gerenciado | Upgrade para Pro só se você contratar; sem cartão não há cobrança. Ao estourar cota, serviço é restringido |
| Netlify | Free | 300 créditos/mês; deploy de produção ≈ 15 créditos; banda cobrada em créditos/GB; previews não consomem | Ao zerar créditos, sites são **pausados** até o próximo ciclo (fonte secundária). Auto recharge existe em planos pagos — manter desligado |
| GitHub | Free | Repositório e Actions (público: ilimitado; privado: cota mensal de minutos) | CI curto (~2 min por push) |

Estimativa de consumo Netlify (INFERENCE): 4 deploys de produção/mês ≈ 60
créditos; app shell ≈ 2 MB por primeiro acesso (depois servido do cache do
service worker). Uso interno de algumas dezenas de usuários tende a caber no
Free; **monitore Billing → Usage** no primeiro mês.

Termos de uso: confirme na página oficial do Netlify se o plano Free permite o
seu uso (comercial/interno). Não use o plano “Open Source” para app privado.

Risco operacional: projeto Supabase Free pausado por inatividade fica fora do ar
até ser restaurado no painel — mitigue com uso regular ou rotina de acesso semanal.
