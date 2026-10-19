# Antes de comercializar — pendências

| # | Item | Status | Ação |
|---|---|---|---|
| 1 | Nome “NexoProcess” | **TO VALIDATE** (codinome) | Busca no INPI (classes 9 e 42), domínio `.com.br`/`.com`, redes sociais. Trocar em `src/config/brand.ts`, `public/icons/favicon.svg`, `src/components/Logo.tsx` e rodar `node apps/nexoprocess/scripts/make-icons.mjs` |
| 2 | Licença do bpmn-js (marca d'água bpmn.io obrigatória e visível) | **TO VALIDATE** com o jurídico | Aceitar a condição ou trocar o renderizador |
| 3 | Termos de uso e política de privacidade | Não existem | Redigir com base em `docs/PRIVACIDADE.md` (LGPD: app não coleta dados pessoais no servidor) |
| 4 | Preço, plano, checkout | **Não implementado** (nenhuma simulação) | Definir modelo; integração de pagamento exige backend |
| 5 | Login, multiusuário, sincronização | **Não implementado** | Fase futura; hoje os dados ficam no aparelho |
| 6 | Compatibilidade do modelo XLSX no Excel (Windows/Mac) | **TO VALIDATE** | Abrir o modelo no Excel e conferir: abas protegidas, células coloridas editáveis, estrutura travada, listas suspensas |
| 7 | Teste com leitor de tela (NVDA/VoiceOver) | **TO VALIDATE** | axe-core (WCAG A/AA) passa; falta teste humano |
| 8 | Teste em iPhone/Android reais (instalação PWA) | **TO VALIDATE** | Emulação Chromium passou; Safari real não testado |
| 9 | Depoimentos, clientes, métricas de marketing | Inexistentes (propositalmente) | Só publicar com evidência e autorização |
| 10 | CTA secundário/contato | Vazio (oculto) | Preencher `COMMERCIAL` em `src/config/brand.ts` |

Os textos comerciais ficam centralizados em `src/config/brand.ts` (`BRAND`, `COMMERCIAL`, `LANDING`).
