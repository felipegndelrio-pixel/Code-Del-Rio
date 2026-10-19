# Privacidade e dados — o que fica onde

Verificado por teste automatizado: durante o tour completo, a jornada E2E e o uso de exportações, **nenhuma requisição saiu da origem do app** (`tests/e2e/helpers.ts`, lista `external`).

## Armazenado no navegador do usuário
| Onde | O quê |
|---|---|
| IndexedDB `nexoprocess` → `workspaces` | Processo AS-IS (atual e original), cópias de segurança, cenários TO-BE e mudanças, decisões sobre recomendações, plano de ação, resultados, riscos, RACI, avaliações de automação e histórico |
| IndexedDB `nexoprocess` → `drafts` | Rascunho do assistente guiado |
| localStorage `nexo.theme` | Preferência de tema claro/escuro |
| Cache do service worker | Somente arquivos do app (JS, CSS, HTML, ícones) — **nenhum dado de processo** |

Planilhas importadas são lidas em memória no navegador; o arquivo em si não é armazenado (só os dados extraídos, o nome e o hash SHA-256 para detectar reimportação).

## Comunicação com a hospedagem
O navegador baixa os arquivos estáticos do app da hospedagem (ex.: Cloudflare Pages). Como em qualquer site, a hospedagem recebe metadados técnicos da requisição (IP, user-agent, horário, URL do arquivo). **O conteúdo dos processos não é enviado.** Não há analytics, cookies de terceiros, fontes externas ou APIs. A CSP (`public/_headers`) restringe `connect-src` à própria origem.

> TO VALIDATE: registros (logs) e políticas da conta de hospedagem escolhida — dependem da configuração do titular.

## Controle do usuário
- **Backup/restauração** (JSON) em “Meus processos”; restaurar nunca sobrescreve (ids em conflito recebem novo id).
- **Apagar dados locais** (com confirmação) remove workspaces, rascunhos e preferências `nexo.*`.
- Em navegação privada com armazenamento bloqueado, o app opera em memória e avisa.

## IA
Não há IA generativa conectada. Uma integração futura deve: manter a chave em servidor, exigir consentimento explícito por envio e manter o produto funcional sem ela.
