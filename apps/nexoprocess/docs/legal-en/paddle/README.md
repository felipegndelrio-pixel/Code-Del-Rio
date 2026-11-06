# Variante Paddle dos textos legais EN (RASCUNHO)

Versão 1, 06/11/2026, branch `wip/paddle`. **Todos `status: draft`, sem revisão por advogado e sem aprovação do fundador.** Os textos aprovados da Gumroad em `docs/legal-en/` **não foram alterados**.

- Só valem se o canal Paddle for ligado (`PADDLE_ENTITLEMENT.md`, D-P5). `check-sale-env` recusa um build de venda com `VITE_PADDLE_*` enquanto qualquer um destes arquivos tiver `status` diferente de `approved` ou algum `TO VALIDATE`/`DRAFT`.
- **Não são publicados**: `npm run nexo:site:en` gera páginas só de `docs/legal-en/*.md` (variante Gumroad). A publicação da variante Paddle (páginas `/en/paddle/…` ou troca de links) é decisão futura do fundador.
- Fontes oficiais usadas (lidas em 06/11/2026): https://developer.paddle.com/get-started/how-paddle-works , https://developer.paddle.com/get-started/how-paddle-works/digital-products , https://developer.paddle.com/build/transactions/create-transaction-adjustments , https://developer.paddle.com/webhooks/about/signature-verification (e as demais de `PADDLE_ENTITLEMENT.md` §0).
- **Não consegui ler** os termos do comprador e a política de privacidade da própria Paddle (`paddle.com`, fora da rede liberada). Tudo que depende deles está marcado `TO VALIDATE`.

## O que muda em relação à variante Gumroad
| Tema | Gumroad (aprovado) | Paddle (rascunho) |
|---|---|---|
| Quem vende | Felipe Del Rio, pessoa física no Brasil (D-L2 evita afirmar o *seller of record*) | Paddle como *merchant of record* (doc oficial); TO VALIDATE no contrato do vendedor |
| Entrada | e-mail + license key | e-mail + id da transação (`txn_…`) |
| Impostos | "podem ser somados pela Gumroad" | calculados e cobrados no checkout pela Paddle (doc oficial) |
| Reembolso | 7 dias; pela Gumroad ou suporte | 7 dias (política do vendedor); a Paddle aprova a maioria dos reembolsos (doc oficial); TO VALIDATE |
| Dados | Gumroad e Stripe | Paddle; o servidor lê o e-mail do cliente na API da Paddle |
