# Progresso, evidências e pendências

Atualizado em 2026-10-15. Branch: `claude/plataforma-gestao-projetos-vni4py`.

## Evidências (execução local, stack limpo)
| Verificação | Resultado |
|---|---|
| ESLint / TypeScript | 0 erros |
| Vitest (unitários + integração via API real) | 7 arquivos, **78/78** testes passando |
| Playwright (Chromium) | **14/14** testes passando |
| Build de produção | OK; PWA com 32 arquivos de app shell em precache |
| Varredura do bundle | nenhuma chave service_role / segredo local |
| Restauração | 19 tabelas + `auth.users` idênticas, checksum de ações igual, 68 políticas RLS e privilégios restaurados |

Ambiente de teste: Postgres 16.15 + Supabase Auth v2.170.0 + PostgREST v12.2.3
locais (sem credenciais de produção, banco `gestao_test` isolado).

## Status por item
| Item | Status | Evidência |
|---|---|---|
| Interface | Concluído | Build OK; telas em `docs/screenshots/`; E2E desktop e celular |
| Banco de dados | Concluído (local) | 5 migrations aplicadas do zero; restauração verificada |
| Autenticação | Concluído (local) | Login/cadastro/recuperação; bcrypt verificado; login inválido recusado (E2E) |
| Permissões | Concluído (local) | 41 testes positivos/negativos via API + E2E de observador |
| Plano de ação | Concluído | Criação, Kanban persistido, conclusão com autoria (E2E + SQL) |
| Dashboard | Concluído | Indicadores recalculados após alterações reais (E2E) |
| Excel | Concluído | Template → importação; rejeição controlada; ida e volta XLSX/CSV sem alterações |
| Histórico | Concluído | Auditoria campo a campo, imutável até para o dono do banco |
| PWA | Concluído (local) | Manifesto, ícones, service worker, offline, 390 px sem rolagem |
| Publicação | **Pendente** | Sem credenciais Supabase/Netlify neste ambiente — ver docs/IMPLANTACAO.md |
| Backup | Concluído (local) | `verify-restore.sh`: RESTAURAÇÃO VERIFICADA |
| Custos | **Pendente de validação** | Páginas oficiais inacessíveis daqui; números de fontes secundárias (TO VALIDATE) |

## Limitações conhecidas
- Storage HTTP não foi testado de ponta a ponta (não emulado localmente); políticas
  testadas em SQL. Validar upload/download após criar o projeto Supabase.
- Validação de assinatura binária de anexos ocorre no navegador; no servidor valem
  extensão, tamanho (banco) e MIME/tamanho (bucket). Validação binária no servidor
  exigiria Edge Function (não implementada para manter custo e superfície mínimos).
- E-mails de recuperação dependem do SMTP do Supabase (limite baixo no Free).
- Sem sincronização offline (decisão de segurança).
- Datas exibidas conforme o idioma do navegador nos campos de data nativos.
- Retentativas automáticas do cliente fazem a mensagem de “serviço indisponível”
  aparecer após ~7–10 s.
- Repositório GitHub está público (recomenda-se torná-lo privado).

## Próximos passos exatos (intervenção humana)
1. Tornar o repositório privado (opcional, recomendado).
2. Criar projeto Supabase Free e aplicar `supabase/migrations/` (docs/IMPLANTACAO.md §1).
3. Criar site Netlify Free a partir do repositório, definir `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`, confirmar auto recharge desligado (§2).
4. Promover o primeiro administrador via SQL (§1.5).
5. Validar na URL HTTPS real: login, criar projeto, anexar e baixar documento,
   instalar o PWA no celular; conferir Billing/Usage dos dois serviços.
6. Agendar backup semanal com `scripts/backup/backup.sh` para destino externo.
