# Variante Paddle dos textos legais EN

Versão 2, 09/11/2026, branch `wip/paddle`. **Os 3 em `status: approved`** (aprovação do fundador, repassada pela sessão do revisor; sem revisão por advogado). Cada ponto antes marcado `TO VALIDATE` foi resolvido por uma de três regras: (1) fato que a doc oficial da Paddle sustenta, escrito com atribuição; (2) o que depende do contrato/conta da Paddle, em redação conservadora que continua verdadeira em qualquer caso (sem prazo, sem promessa de aprovação); (3) lei aplicável mantida como no canal Gumroad (D-L7). Os textos aprovados da Gumroad em `docs/legal-en/` **não foram alterados**.

- Só valem se o canal Paddle for ligado (`PADDLE_ENTITLEMENT.md`, D-P5). `check-sale-env` recusa um build de venda com `VITE_PADDLE_*` se qualquer um destes arquivos voltar a ter `status` diferente de `approved` ou algum `TO VALIDATE`/`DRAFT` (teste em `tests/api/en-site.test.ts`).
- **Não são publicados**: `npm run nexo:site:en` gera páginas só de `docs/legal-en/*.md` (variante Gumroad). A publicação da variante Paddle (páginas `/en/paddle/…` ou troca de links) é decisão futura do fundador.
- Fontes oficiais usadas (lidas em 06/11/2026): https://developer.paddle.com/get-started/how-paddle-works , https://developer.paddle.com/get-started/how-paddle-works/digital-products , https://developer.paddle.com/build/transactions/create-transaction-adjustments , https://developer.paddle.com/webhooks/about/signature-verification (e as demais de `PADDLE_ENTITLEMENT.md` §0).
- **Não consegui ler** os termos do comprador e a política de privacidade da própria Paddle (`paddle.com`, fora da rede liberada). Por isso os textos **não descrevem** o que a Paddle coleta nem afirmam o prazo de reembolso, o caminho de reembolso pelo recibo ou o preço no catálogo; só apontam para a política da Paddle (https://www.paddle.com/legal/privacy). O que o fundador precisa conferir na conta/contrato Paddle antes do live está em `PADDLE_ENTITLEMENT.md` §14.6 item 1b.

## O que muda em relação à variante Gumroad
| Tema | Gumroad (aprovado) | Paddle (rascunho) |
|---|---|---|
| Quem vende | Felipe Del Rio, pessoa física no Brasil (D-L2 evita afirmar o *seller of record*) | Paddle como *merchant of record* (atribuído à doc oficial) |
| Entrada | e-mail + license key | e-mail + id da transação (`txn_…`) |
| Impostos | "podem ser somados pela Gumroad" | calculados e cobrados no checkout pela Paddle (doc oficial) |
| Reembolso | 7 dias; pela Gumroad ou suporte | 7 dias pelo suporte; a Paddle processa os aprovados e, segundo a doc, aprova a maioria na conta live; sem prazo prometido |
| Dados | Gumroad e Stripe | Paddle; o servidor lê o e-mail do cliente na API da Paddle |
