# Privacidade e dados — o que fica onde

Verificado por teste automatizado: durante o tour completo, a jornada E2E e o uso de exportações, **nenhuma requisição saiu da origem do app** (`tests/e2e/helpers.ts`, lista `external`).

## Armazenado no navegador do usuário
| Onde | O quê |
|---|---|
| IndexedDB `nexoprocess` → `workspaces` | Processo AS-IS (atual e original), cópias de segurança, cenários TO-BE e mudanças, decisões sobre recomendações, plano de ação, resultados, riscos, RACI, avaliações de automação e histórico |
| IndexedDB `nexoprocess` → `drafts` | Rascunho do assistente guiado |
| localStorage `nexo.theme` | Preferência de tema claro/escuro |
| localStorage `nexo.license` | Só no build de venda: token de acesso assinado (contém o e-mail da compra e a validade) |
| Cache do service worker | Somente arquivos do app (JS, CSS, HTML, ícones) — **nenhum dado de processo** |

Planilhas importadas são lidas em memória no navegador; o arquivo em si não é armazenado (só os dados extraídos, o nome e o hash SHA-256 para detectar reimportação).

## Comunicação com a hospedagem
O navegador baixa os arquivos estáticos do app da hospedagem (ex.: Cloudflare Pages). Como em qualquer site, a hospedagem recebe metadados técnicos da requisição (IP, user-agent, horário, URL do arquivo). **O conteúdo dos processos não é enviado.** Não há analytics, cookies de terceiros nem fontes externas. A CSP (`public/_headers` e `vercel.json`) restringe `connect-src` à própria origem. A única API é a de acesso do build de venda (abaixo), na mesma origem.

> TO VALIDATE: registros (logs) e políticas da conta de hospedagem escolhida — dependem da configuração do titular.

## Acesso pago (build de venda, `VITE_LICENSE_REQUIRED=true`)
| Momento | O que sai do aparelho | Para onde |
|---|---|---|
| Ativação (tela "Entrar") | **Só o e-mail digitado** | `POST /api/license` (função do servidor na mesma origem: Cloudflare Pages Functions ou Vercel) |
| Renovação, no máximo a cada 7 dias e só com internet | O token salvo (contém o e-mail) | `POST /api/license` |
| Compra, reembolso ou chargeback na Hotmart | Nada do aparelho: a **Hotmart** envia e-mail, produto, transação e evento | `POST /api/hotmart-webhook` |

No servidor fica só a tabela `nexo_licenses` (Supabase): e-mail, situação (`active`/`revoked`), produto, transação, evento e data. **Processos, planilhas e demais dados continuam só no aparelho**, como no build aberto. O log da função mostra o e-mail mascarado (`a***@dominio.com`).

> TO VALIDATE: texto de privacidade/termos na página de venda da Hotmart informando o uso do e-mail para liberar o acesso.

## Controle do usuário
- **Backup/restauração** (JSON) em “Meus processos”; restaurar nunca sobrescreve (ids em conflito recebem novo id).
- **Apagar dados locais** (com confirmação) remove workspaces, rascunhos e preferências `nexo.*` — no build de venda, inclusive o acesso (`nexo.license`): basta entrar de novo com o e-mail.
- Em navegação privada com armazenamento bloqueado, o app opera em memória e avisa.

## IA
Não há IA generativa conectada. Uma integração futura deve: manter a chave em servidor, exigir consentimento explícito por envio e manter o produto funcional sem ela.
