# Antes de comercializar — pendências

| # | Item | Status | Ação |
|---|---|---|---|
| 1 | Nome “NexoProcess” | **TO VALIDATE** (codinome) | Busca no INPI (classes 9 e 42), domínio `.com.br`/`.com`, redes sociais. Trocar em `src/config/brand.ts`, `public/icons/favicon.svg`, `src/components/Logo.tsx` e rodar `node apps/nexoprocess/scripts/make-icons.mjs` |
| 2 | Licença do bpmn-js (marca d'água bpmn.io obrigatória e visível) | **TO VALIDATE** com o jurídico | Aceitar a condição ou trocar o renderizador |
| 3 | Termos de uso, política de privacidade e de reembolso | **Pendente (jurídico)**. O app já mostra, em Ajuda → Privacidade, o que fica onde — inclusive o e-mail da compra no build de venda | Redigir com base em `docs/PRIVACIDADE.md` (no build de venda há tratamento de dado pessoal: o e-mail da compra no servidor). Identificar o controlador (nome/CNPJ) e o canal do titular. Reembolso: seguir a garantia configurada na Hotmart |
| 4 | Preço, plano, checkout | **Implementado via Hotmart** (checkout, webhook, liberação e revogação) | Definir preço e garantia no produto da Hotmart |
| 5 | Login, multiusuário, sincronização | Acesso pelo e-mail da compra implementado; multiusuário e sincronização **não** | Fase futura; hoje os dados ficam no aparelho |
| 6 | Compatibilidade do modelo XLSX no Excel (Windows/Mac) | **TO VALIDATE** | Abrir o modelo no Excel e conferir: abas protegidas, células coloridas editáveis, estrutura travada, listas suspensas |
| 7 | Teste com leitor de tela (NVDA/VoiceOver) | **TO VALIDATE** | axe-core (WCAG A/AA) passa; falta teste humano |
| 8 | Teste em iPhone/Android reais e Safari/Firefox | **TO VALIDATE** | Emulação Chromium passou; WebKit e Gecko não executados. Roteiro em `docs/COMPATIBILIDADE.md` |
| 9 | Depoimentos, clientes, métricas de marketing | Inexistentes (propositalmente) | Só publicar com evidência e autorização |
| 10 | E-mail de suporte | Configurável no build (`VITE_SUPPORT_EMAIL`); **obrigatório** no build de venda | Definir o endereço e responder em prazo razoável |

Os textos comerciais ficam centralizados em `src/config/brand.ts` (`BRAND`, `COMMERCIAL`, `LANDING`).
