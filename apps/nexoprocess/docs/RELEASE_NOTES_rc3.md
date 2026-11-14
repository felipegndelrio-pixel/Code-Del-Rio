# NexoProcess v2.6.0-rc3 (candidata): o que entra desde v2.6.0-rc2

**Estado:** candidata. Ramo `wip/paddle`. **Sem tag** até o fundador autorizar. Esta lista foi escrita a partir do histórico do Git (`git log v2.6.0-rc2..wip/paddle`) e dos testes; nada abaixo foi executado contra Paddle ou Supabase reais, exceto onde dito.
Fixe o commit real antes de taguear: `git rev-parse HEAD` no ramo, com o G3 do commit em `G3 válido: passed=…, failed=0, pending=0, todo=0`.

## O que entra
1. **Correção do schema (obrigatória antes de qualquer reaplicação).** `schema-purchases.sql` da rc1 e da rc2 criava compra `hotmart` fantasma ativa para cada compra `gumroad`/`paddle` a cada reaplicação (furava a D3 e sobrevivia a reembolso) e bloqueios `legacy_*` fantasmas. Corrigido; a 1ª migração dá o mesmo resultado de antes (comparado linha a linha); reaplicar é estável. `OPERACAO_EN.md` §7 (detecção 7.1 e limpeza 7.2).
2. **Canal Paddle (opcional, desligado sem as variáveis `VITE_PADDLE_*`/`PADDLE_*`).** Webhook assinado (`Paddle-Signature`), eventos canônicos, ativação por e-mail + id da transação, compra na landing `/en/` por Paddle.js, entrada EN, build de staging em sandbox, textos legais da variante Paddle aprovados, modelos de suporte em inglês. `PADDLE_ENTITLEMENT.md`.
3. **R1–R3 (Paddle).** Tolerância da assinatura 300 s; ajuste de compra recente ainda desconhecida responde 503 (a Paddle reenvia) e, com 48 h ou mais, 200 + registro; tabela `nexo_webhook_rejections` (sem e-mail e sem corpo) com função só do `service_role`; `outro_produto` também registrado.
4. **Poka-yoke da chave:** `GET /api/license-key-fingerprint` e `npm run nexo:check-deploy -- <url>` (impressão digital do bundle × a do servidor). Passo obrigatório depois de todo deploy (`LANCAMENTO_EN.md` §4.3).
5. **Windows:** caminhos com `fileURLToPath` (check-bundle, build-en-site, make-icons, configs e testes); **CRLF**: o build normaliza `_headers`/`_redirects`/HTML para LF, valida o resultado e o repositório ganha `.gitattributes` (`eol=lf`).
6. **CSP:** `VITE_PADDLE_CSP_STYLE` (style-src só de `/en/*`); origens do sandbox de 13/11 registradas em `PADDLE_ENTITLEMENT.md` §14.5 (as do live são A VALIDAR).
7. **Build de venda:** `VITE_HOTMART_CHECKOUT_URL` precisa ser `https://pay.hotmart.com/<código>` (recusa `go.hotmart.com`).
8. **Documentação:** lições de 13–14/11 (`PADDLE_ENTITLEMENT.md` §14.8), checklist único "Paddle LIVE" (§14.9), diagnóstico D1 (`docs/diagnostics/`), critério de aceite "entrou no app".

## O que NÃO muda
PT e Hotmart em runtime; textos legais da Gumroad; regras D3 (Gumroad e Paddle não concedem só por e-mail) e C1.

## Ordem de produção (cada passo só com o GO do fundador)
1. **Tag** da rc3 no commit com G3 verde (`v2.6.0-rc3`). Sem tag antes disso.
2. **`OPERACAO_EN.md` §7.1 em produção** (só leitura; confira o Reference ID do projeto). Qualquer linha em (A) ou (B): **parar** e chamar a engenharia.
3. **Schema da tag** no banco de produção (`schema-purchases.sql` **do commit da rc3**, nunca o da rc1/rc2; `PADDLE_ENTITLEMENT.md` §14.6 item 0; roda uma vez).
4. **§7.1 de novo** (zero linhas; contagens iguais às de antes).
5. **Deploy** do build de venda feito no clone limpo da tag (`core.autocrlf=false` ou clone novo com a rc3).
6. **`npm run nexo:check-deploy -- https://<domínio>`** terminando em `OK` (é o C1).
7. **Testes de liberação C1–C6** (definidos em `LANCAMENTO_EN.md` §4.5): C1 = `nexo:check-deploy` (passo 6); C2 = login PT no Chrome do PC (janela anônima) entra no app e continua aberto ao recarregar; C3 = o mesmo no Safari do iPhone (aba privada); C4 = `/entrar?lang=en` com chave inventada mostra "We could not find…"; C5 = login EN pela Gumroad com compra real entra no app; C6 = link da bio do Instagram → site → "Comprar na Hotmart" abre o checkout `pay.hotmart.com` (não "Oferta não encontrada" nem loop). Critério: "entrou no app", nunca só HTTP 200.
8. Só se a Paddle for ligar em produção: `PADDLE_ENTITLEMENT.md` §14.9 (checklist "Paddle LIVE").

## Reversão
Reverter o deploy (rollback do Pages) não desfaz o schema; ele é aditivo e reaplicável. `DEPLOY_CLOUDFLARE.md` ("Rollback") e `PADDLE_ENTITLEMENT.md` §14.6 item 5 (remover as `VITE_PADDLE_*` e refazer o build).

## Limites conhecidos (honestos)
- Paddle: só sandbox testado pelo fundador; **live não testado**; hosts de CSP do live a descobrir; janela de reembolso, preço live e recibo com `txn_` a conferir na conta.
- Sem WebKit/Safari neste ambiente de desenvolvimento; D1 (token no iPhone) foi resolvido em produção com par de chaves novo, causa raiz não identificada com certeza.
- Nada foi rodado em Windows real pelo desenvolvimento; CRLF e caminhos estão provados por simulação e build a partir de fontes CRLF.
