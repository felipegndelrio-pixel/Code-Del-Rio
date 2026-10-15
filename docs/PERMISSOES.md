# Matriz de permissões

Toda regra abaixo é aplicada **no banco de dados** (PostgreSQL RLS + gatilhos em
`supabase/migrations/20261015000002_security_rls.sql`). Esconder botões na
interface é só conveniência; chamadas diretas à API recebem a mesma recusa.
Comprovação: `tests/db/security.test.ts` (41 testes, incluindo negativos).

| Operação | Admin plataforma | Sponsor | Gerente | Responsável | Observador | Não membro |
|---|---|---|---|---|---|---|
| Ver projeto e registros | ✅ todos | ✅ | ✅ | ✅ | ✅ | ❌ |
| Criar projeto | ✅ | só com "pode criar projetos" | só com "pode criar projetos" | idem | idem | idem |
| Editar dados do projeto / encerrar | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Excluir projeto | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Incluir/alterar/remover membros | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Alterar o próprio vínculo | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Criar/excluir ações | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Editar qualquer campo de ação | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Atualizar status, avanço, bloqueios, evidências, próximo passo, início real da **própria** ação | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Concluir ação (registra autor e data) | ✅ | ✅ | ✅ | própria | ❌ | ❌ |
| Comentar ações | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| EAP, marcos, riscos, mudanças, decisões, stakeholders, RACI, status reports | ✅ | ✅ | ✅ | leitura | leitura | ❌ |
| Registrar problemas / lições | ✅ | ✅ | ✅ | ✅ (edita os seus) | ❌ | ❌ |
| Anexar documentos | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Baixar documentos | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Excluir documento | ✅ | ✅ | ✅ | os próprios | ❌ | ❌ |
| Ler auditoria do projeto | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Alterar/apagar auditoria | ❌ (imutável) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Conceder admin / criação de projetos / desativar usuário | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Importar planilha | conforme as permissões acima, linha a linha (RPC roda como o usuário) |||||
| Exportar | somente registros visíveis ao usuário |||||

Regras adicionais no servidor:
- `completed_by`/`completed_at`, `decided_by`/`decided_at`, `closed_by`/`closed_at`,
  `created_by`, autor de comentários/anexos e o snapshot de métricas dos relatórios
  são definidos pelo banco e **não podem ser forjados** pelo cliente.
- Ação bloqueada exige descrição do bloqueio; marco atingido exige data real.
- O projeto mantém ao menos um gerente; o último administrador não pode se remover.
- Usuário desativado (`active = false`) perde acesso a todos os projetos.
- Registros filhos só podem referenciar registros do mesmo projeto (FKs compostas).
- Papel `anon` não tem nenhum privilégio nas tabelas.
