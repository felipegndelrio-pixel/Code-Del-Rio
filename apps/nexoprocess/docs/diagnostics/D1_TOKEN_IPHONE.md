# D1 — "O acesso foi confirmado, mas este aparelho não conseguiu validá-lo" no iPhone (diagnóstico, 09/11/2026)

**Estado: diagnóstico. Nenhuma correção foi feita. A causa NÃO está provada.** Este documento separa o que foi verificado do que não foi.

## O que a mensagem significa (FATO, `src/license/config.ts` linhas 123–143)
A mensagem (`reason: 'chave_invalida'`) aparece quando o servidor respondeu com token **e** `verifyToken(token, LICENSE.publicJwk)` devolveu `null`. Isso acontece em **cinco** casos, não dois:
1. `LICENSE.publicJwk` é `null`: `VITE_LICENSE_PUBLIC_JWK` ausente no build **ou `JSON.parse` falhou** (`parseJwk` devolve `null` em silêncio). O caso clássico é colar a chave do celular com **aspas "inteligentes"**: o servidor aceita (`lenientQuotes`, só no servidor), o bundle não.
2. Chave pública do bundle ≠ par da chave privada do servidor (assinatura não confere) — hipótese (a) do revisor.
3. O motor do navegador rejeita `importKey`/`verify` — hipótese (b).
4. `exp <= agora` no aparelho (relógio do iPhone adiantado em mais do que o prazo do token; padrão 30 dias).
5. Sem `crypto.subtle` (contexto não seguro, http fora de localhost).
Um bundle antigo em cache (hipótese c) cai no caso 1 ou 2 (o app antigo tem a chave que tinha na época).

## O que foi verificado (FATO, executado nesta sessão)
- **Revisão de `src/license/token.ts` contra o comportamento do WebKit (leitura):** não há nada específico de motor. `importKey('jwk', {...pub, key_ops:['verify']}, P-256, false, ['verify'])` é o uso padrão; o `key_ops` repassado coincide com os `usages`; o código descarta `d`; `ext`, `alg`, `kid` e `use` repassados do JWK não são rejeitados pelas regras da especificação (`ext:true` com `extractable:false` é permitido; `use:'sig'` é compatível). A assinatura é IEEE P1363 (r‖s, 64 bytes) nos dois lados, que é o que o WebKit espera. O padding de base64url (`'==='.slice((s.length+3)%4)`) está correto para comprimentos 0, 2 e 3 (mod 4).
- **Teste com o mesmo `token.ts`, token assinado por `signToken`, em Node e em Chromium 153 (Playwright):** `verifyToken` dá `true` para a pública exportada crua (com `ext` e `key_ops`), sem `key_ops/ext` (formato do `license-keys.mjs`), com `alg:'ES256'`, `use:'sig'`, `kid`, `ext:false` e com a privada inteira. Dá `false` para a pública de **outro par** e com o **relógio 31 dias à frente**. `JSON.parse` com aspas "inteligentes" dá `null`.
- **WebKit: NÃO tenho.** Este ambiente só tem Chromium (`/opt/pw-browsers`: chromium, headless shell, ffmpeg). Portanto **não rodei nada no WebKit/Safari**; o S7 continua não verificado por mim.

## Leitura honesta
- A hipótese (b) (WebKit) **não tem apoio na leitura do código**; só um teste no Safari real a fecha.
- Pelos fatos conhecidos (a resposta do servidor tem só token/e-mail/exp; o servidor assinou, ou seja, a **privada de produção é válida**), o mais provável é o **caso 1 ou 2**: a chave que está **dentro do bundle** de produção. **Isto é INFERÊNCIA, não prova.** Ponto que vale conferir primeiro: o bundle de produção foi gerado por `nexo:build:sale` (que roda `check-sale-env` e recusa chave malformada) ou por `nexo:build` direto (que não valida a chave pública)? O `<meta name="nexo-build-id">` da página diz `unversioned` quando não passou pelo build de venda.
- Se o mesmo login funciona no desktop com o mesmo bundle, (a), (1) e (c) ficam quase descartados e sobra (b)/(4); se falha também no desktop, é (1)/(2)/(c).

## Teste mínimo para o fundador (sem dado pessoal)
Arquivo: `apps/nexoprocess/docs/diagnostics/d1-token-safari.html` (uma página, sem rede, sem token, sem e-mail; já testada em Chromium). Como abrir no iPhone **sem deploy em produção**: hospedar só essa página no **staging** (um diretório com esse único arquivo em `wrangler pages deploy … --branch staging-en`, como no roteiro do staging) e abrir a URL no Safari; **não** colocar em `public/` nem na produção. Passos:
1. **Parte 1** (botão): o Safari gera um par, assina e verifica com o MESMO código do app. Tudo `OK` ⇒ hipótese (b) descartada. `FALHOU` ⇒ (b) confirmada, com o nome do erro do Safari.
2. **Parte 2**: colar a linha `VITE_LICENSE_PUBLIC_JWK` (pública, sem `d`) **como está no Cloudflare/build**. Resultado diferencia o caso 1 (aspas "inteligentes"/JSON inválido/x ou y com 42 caracteres) do caso 2 (a impressão digital de 8 hex **tem** que ser igual à do par do servidor: `license-keys.mjs` e o `check-sale-env` imprimem a deles).
3. **Para (c)** (bundle antigo): no iPhone, repetir o login (a) numa **aba privada do Safari** (não usa cache do PWA) e (b) depois de **remover o app da tela de início e adicionar de novo**. Funciona na aba privada e não no PWA ⇒ (c).
4. **Relógio (caso 4):** a Parte 1 mostra a data/hora do aparelho; comparar com a hora real.
5. **No desktop, para ver a chave que está NO bundle de produção** (a pública é pública por natureza): baixar o HTML e o `assets/*.js` do domínio e procurar `kty`; a linha que aparecer (a pública do bundle) é a que se cola na Parte 2 e cuja impressão digital se compara com a do servidor. Também ler o `nexo-build-id` no HTML.

| Resultado | Causa |
|---|---|
| Parte 1 FALHOU | (b) motor do Safari |
| Parte 1 OK, Parte 2 mostra aspas "inteligentes"/JSON inválido/x ou y ≠ 43 | caso 1: chave pública do build malformada ⇒ refazer o build de venda com a linha correta |
| Parte 1 OK, Parte 2 OK, impressão digital ≠ a do servidor | caso 2 (a): par trocado ⇒ alinhar bundle e servidor |
| Tudo OK, aba privada funciona, PWA não | (c) cache do PWA ⇒ remover e reinstalar; depois ver a atualização do service worker |
| Tudo OK em tudo e a hora do aparelho está errada | caso 4 (relógio) |
