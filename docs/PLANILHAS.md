# Importação e exportação de planilhas

## Template oficial
`docs/template-importacao.xlsx` (regerar com `npm run template`) ou botão
**Template oficial** em *Planilhas*. A aba **Instruções** lista cada coluna,
campo técnico, tipo, obrigatoriedade e valores aceitos.

## Identificadores e relacionamentos
| Entidade (aba) | Prefixo do código | Referências |
|---|---|---|
| Projetos | `PRJ-` | e-mail do sponsor / gerente |
| Cronograma (EAP) | `EAP-` | Código do projeto, Código do item pai, Predecessoras |
| Marcos | `MAR-` | Código do projeto, Código EAP |
| Ações | `ACT-` | Código do projeto, Código EAP, Código do marco, Depende de, e-mail do responsável |
| Riscos | `RSK-` | Código do projeto, e-mail do responsável |
| Problemas | `PRB-` | Código do projeto |
| Decisões | `DEC-` | Código do projeto |
| Mudanças | `MUD-` | Código do projeto |
| Stakeholders | `STK-` | Código do projeto |
| Lições | `LIC-` | Código do projeto |

- **Código em branco** → cria registro (código gerado pelo sistema).
- **Código preenchido e existente** → atualiza **somente as colunas presentes**.
- **Código preenchido e novo** → cria com esse código (útil para referenciar no
  mesmo arquivo, ex.: ação que depende de outra nova).
- Mover registro entre projetos por código é recusado.
- E-mails precisam ser de usuários cadastrados e visíveis (membros dos seus projetos).

## Fluxo de importação (tudo-ou-nada)
1. Upload `.xlsx` ou `.csv` (até 10 MB, 5.000 linhas).
2. Detecção automática das abas e mapeamento de colunas (editável).
3. Validação local por linha: tipos, obrigatórios, datas inexistentes, enums,
   referências, duplicidades, regras (bloqueio exige descrição etc.).
4. Pré-visualização: novo / alterado (campo: antes → depois) / sem alteração.
   Opção padrão: células vazias **não apagam** valores existentes.
5. **Simular no servidor**: a RPC `import_records` executa tudo com as permissões
   do usuário e desfaz (staging real), devolvendo erros por linha.
6. **Confirmar**: grava somente se nenhuma linha falhar; qualquer erro desfaz o lote.
7. Relatório final com inseridos / atualizados / sem alteração por entidade.

## Exportação
XLSX com abas: Resumo, Projetos, Ações, Cronograma, Marcos, Riscos, Problemas,
Stakeholders, Decisões, Mudanças, Lições, Indicadores, Histórico e Instruções.
CSV por entidade (separador `;`, UTF-8 com BOM, decimal com vírgula — abre
direto no Excel pt-BR). Respeita a seleção de projetos e as permissões.

## Ida e volta verificada
`tests/db/import-export.test.ts`: exportar → reimportar resulta em **zero**
inserções/alterações (XLSX e CSV); uma célula alterada na planilha exportada é
aplicada e auditada.
