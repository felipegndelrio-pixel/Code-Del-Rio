# Suporte EN: modelos de resposta (canal Gumroad)

Versão 1, de 06/11/2026, branch `wip/paddle`. Documento **interno**: não vai para o site nem para o app. As respostas ao cliente estão em inglês; as notas para quem responde, em português.
Uso: copie o modelo, preencha os campos `<entre sinais>` e remova o que não se aplica. Nada aqui é enviado automaticamente.

## 0. Regras de ouro

- **Só fatos do produto.** Cada modelo cita no fim a fonte (arquivo e trecho). Se a pergunta do cliente não estiver coberta, responda só o que está coberto e leve o resto ao fundador (decisão dele).
- **Nenhum prazo de resposta é prometido ao cliente.** O único prazo escrito é o da política de privacidade: pedido de dados respondido em até 30 dias (`PRIVACY_EN.md` §7).
- **Reembolso:** 7 dias a partir da compra (`REFUND_EN.md` §1). Fora disso, não prometa nem negue: a decisão é do fundador, e a política diz que não limita direitos legais do país do cliente (§5).
- **Não peça a license key completa** nem dados de cartão. O e-mail da compra e o número do pedido/recibo da Gumroad bastam para localizar a compra no painel (RECOMENDAÇÃO operacional, não regra do produto).
- **Responda sempre para o e-mail da compra.** Não envie dados da compra para outro endereço.
- **Não afirme resultado de negócio** (Termos §7).
- **Este documento cobre o canal Gumroad** (o único que os textos legais EN descrevem hoje). Se a Paddle virar canal, `TERMS_EN`, `REFUND_EN` e `PRIVACY_EN` precisam ser reabertos antes (D-P5 de `PADDLE_ENTITLEMENT.md`); estes modelos não valem para ela.

Assinatura sugerida em todos: `NexoProcess support`.

---

## 1. Ativação (não consigo entrar)

**Quando:** o cliente comprou e não sabe como entrar, ou o app mostra erro genérico de entrada.
**Fatos:** entra-se com o **e-mail da compra** e a **license key do recibo** (`login.gumroad.intro`, `login.key.hint`); precisa de internet na ativação (`license.error.offline`); a chave tem 4 blocos de 8 caracteres hexadecimais maiúsculos separados por hífen (FATO do fundador, `GUMROAD_ENTITLEMENT.md` §11), ou seja, só dígitos 0–9 e letras A–F.

> Hi <first name>,
>
> Thanks for buying NexoProcess. To sign in, open the app and enter:
>
> 1. the **email address you used at checkout**, and
> 2. the **license key** from your Gumroad receipt email (you can also find it in your Gumroad library).
>
> You need an internet connection to sign in. The key has four blocks of eight characters separated by hyphens (digits 0–9 and letters A–F only), so an "O" is really a zero.
>
> If it still doesn't work, reply with the email you used at checkout and the Gumroad order number from your receipt (please don't send the full license key), and I'll look into it.
>
> NexoProcess support

---

## 2. "We couldn't find an active purchase" (chave não encontrada)

**Quando:** o app mostra `license.error.notFound`: "We couldn't find an active purchase matching this email address and license key."
**Fatos:** a resposta é **a mesma** para chave inexistente, e-mail diferente do da compra, chave de outro produto e compra reembolsada ou contestada (`GUMROAD_ENTITLEMENT.md` §2, passo 3). Por isso o modelo não diz qual foi a causa.
**Antes de responder (fundador):** `GUMROAD_ENTITLEMENT.md` §13.1 (consulta no Supabase pelo e-mail) e o painel da Gumroad. Motivos de rejeição nos logs: `id_fora_do_formato`, `sem_email`, `email_diferente`, `outro_produto`, `compra_de_teste`, `assinatura`. Se a compra está `refunded` ou `charged_back`, use o modelo 3.

> Hi <first name>,
>
> That message appears when the email address and license key don't match an active purchase. Please check two things:
>
> - The email must be the **same one used at checkout** (if you have more than one address, try the others).
> - The key must be copied from your Gumroad receipt or library, without extra spaces. It uses only digits 0–9 and letters A–F.
>
> If both look right, reply with the email you used at checkout and your Gumroad order number (not the full license key), and I'll check your purchase.
>
> NexoProcess support

---

## 3. Reembolso (pedido, status e fim do acesso)

**Fatos (`REFUND_EN.md`):** 7 dias após a compra (§1); pede-se pela Gumroad (link no e-mail do recibo) ou por e-mail ao suporte com o e-mail da compra (§2); reembolso **total** encerra o acesso nos aparelhos **na próxima verificação** (§3); reembolso **parcial** mantém o acesso; chargeback ou disputa em aberto encerra o acesso, e disputa ganha pelo vendedor devolve o acesso; os projetos ficam no aparelho e o app não os apaga sozinho (§4); a política não limita direitos legais do país (§5). A tela de acesso encerrado diz: "This purchase is no longer active. This may happen after a refund or chargeback. If you believe this is an error, contact support." (`login.revoked.body`).
**Operação (fundador):** o reembolso é feito no painel da Gumroad. A Gumroad não revoga sozinha; o app detecta na próxima verificação online. Se o reembolso ou a disputa não chegou ao banco, revogue manualmente (`GUMROAD_ENTITLEMENT.md` §13.3). Fora dos 7 dias: decisão do fundador.

**3a. Pedido dentro de 7 dias**

> Hi <first name>,
>
> Yes, you can get a refund within 7 days of purchase. You can request it from the link in your Gumroad receipt email, or just confirm here and tell me the email you used at checkout.
>
> What happens next: after a full refund, access to NexoProcess ends on your devices at the next time the app checks your license online. Your projects stay stored on your device, and the app does not delete them by itself. If you want to keep them, download a backup from the app before the refund.
>
> NexoProcess support

**3b. Pedido fora de 7 dias**  *(só depois de o fundador decidir; o texto abaixo não promete nem recusa)*

> Hi <first name>,
>
> Thanks for writing. Our refund policy covers requests made within 7 days of purchase, and it does not limit any refund rights you may have under the law of your country. I've passed your request to <name> and will come back to you with an answer.
>
> NexoProcess support

**3c. "Perdi o acesso" depois de reembolso, chargeback ou disputa**

> Hi <first name>,
>
> The purchase linked to this email is no longer active, which happens after a full refund or a chargeback. Access ended on your devices at the next license check. Your projects are still stored on your device, and you can download a backup from the app.
>
> If you believe this is a mistake, reply with your Gumroad order number and I'll check it.
>
> NexoProcess support

*Nota:* se a disputa foi **ganha** pelo vendedor, o acesso volta na verificação seguinte (`REFUND_EN.md` §3); não prometa data.

---

## 4. Acesso depois de 30 dias offline

**Fatos:** o app guarda um token assinado no aparelho e o renova em segundo plano quando há internet (`TERMS_EN.md` §3; `PRIVACY_EN.md` §3: no máximo uma vez por hora, só online). O token vale 30 dias (`LICENSE_TTL_DAYS`, padrão do servidor; `LANCAMENTO_EN.md` linha da variável). É preciso reconectar **ao menos uma vez a cada 30 dias** (`login.gumroad.intro`, `license.error.offline`). Os projetos ficam no aparelho (`login.signedOut.body`). Apagar os dados do navegador ou usar navegação privada pode apagar o trabalho (`TERMS_EN.md` §4).

> Hi <first name>,
>
> NexoProcess keeps you signed in with a token stored on your device. It renews itself in the background whenever you're online, and it needs to renew at least once every 30 days. If the device stays offline for longer, the app asks you to sign in again.
>
> To get back in: connect to the internet and sign in with the email you used at checkout and your license key. Your projects are stored on your device and are still there.
>
> If the sign-in screen says it couldn't find an active purchase, reply with your Gumroad order number and I'll check it.
>
> NexoProcess support

---

## 5. Troca de aparelho

**Fatos:** a licença é pessoal, **sem limite fixo de aparelhos para uso pessoal**; uso excessivo ou compartilhado pode levar à desativação da chave (`TERMS_EN.md` §2). Em outro aparelho entra-se com e-mail da compra + chave. **Os projetos não sincronizam**: ficam no navegador do aparelho onde foram criados (`PRIVACY_EN.md` §2). O app tem **Download backup** e **Restore backup** (`home.backup.download`, `home.shortcut.restoreBackup`). No iPhone, o app instalado na Tela de Início pode guardar os dados separados do Safari (`install.ios.note`). Não existe, no código, função de "desativar aparelho": não ofereça.

> Hi <first name>,
>
> You can use your license on a new device. Sign in there with the email you used at checkout and your license key; there is no fixed device limit for personal use.
>
> Your projects are not synced: they're stored in the browser of the device where you created them. To move them, open the app on the old device, choose **Download backup**, then open the app on the new device and use **Restore backup**.
>
> On iPhone, if you install the app to your Home Screen, its data can be kept separate from Safari. Download the backup before installing, and restore it inside the installed app.
>
> NexoProcess support

---

## 6. Ativação manual (422: "We found your Gumroad purchase but couldn't activate it automatically")

**Quando:** o app mostra `license.error.manual`: "We found your Gumroad purchase but couldn't activate it automatically. Please contact support and we'll activate it for you."
**Fatos:** o servidor respondeu 422 `ativacao_manual`; **nada foi gravado** e o bloqueio não afeta o e-mail (`GUMROAD_ENTITLEMENT.md` §11). Causas: `id_fora_do_formato` (a chave é válida e o e-mail confere, mas o id da venda veio fora do formato esperado) ou `sem_email`.
**Operação (fundador), em ordem:**
1. Confirmar a compra no painel da Gumroad (e-mail e número do pedido).
2. Conceder pelo runbook `GUMROAD_ENTITLEMENT.md` §13.2 (`platform 'gumroad_manual'`; resultado esperado `{"result": "active", "status": "active"}`).
3. Avisar o cliente e pedir que entre de novo.
4. Anotar `id_fora_do_formato`/`sem_email` e o **comprimento** do id (nunca o valor): é o que a 1ª venda real precisa validar (`HANDOFF_EN.md`, teste de fumaça).

> Hi <first name>,
>
> Thanks for your patience. We found your purchase, but the app couldn't activate it automatically. I've activated it for you manually.
>
> Please open the app again and sign in with the email you used at checkout and your license key. If the screen still doesn't let you in, reply here with a screenshot of the message.
>
> NexoProcess support

*Se a compra não for encontrada no painel:* peça o e-mail da compra e o número do pedido (modelo 2) e **não ative** sem confirmação.

---

## 7. Pedido de dados ou exclusão (privacidade)

**Fatos (`PRIVACY_EN.md`):** direitos de acesso, correção, exclusão e oposição por e-mail; resposta em **até 30 dias** (§7). O servidor guarda um **registro de compra**: e-mail, produto, identificador da venda, status, valor e moeda pagos, evento e data; **não** guarda processos nem planilhas (§4). O registro é mantido **enquanto a licença for válida e por até 5 anos para fins fiscais e contábeis** (§4). Os dados de pagamento e a chave ficam com a **Gumroad** e a **Stripe**, terceiros (§5). No aparelho: **My processes → Erase local data** apaga projetos, rascunhos e preferências, e também o token e a license key (`hp.erase`, `home.backup.wipe`; `storage/db.ts` `clearAll` apaga as chaves `nexo.*`, entre elas `nexo.license` e `nexo.license.key`; `PRIVACY_EN.md` §6). Controlador: Felipe Del Rio (`TERMS_EN.md` §1).
**Operação (fundador):** responda **só ao e-mail da compra** (é a prova de identidade; não há outro procedimento definido no repositório). **A VALIDAR (decisão do fundador, antes de executar qualquer exclusão):** o procedimento de apagar o registro de compra não existe no repositório e apagá-lo encerra o acesso e perde o histórico de reembolso; o prazo de 5 anos da política também limita a exclusão imediata. O modelo abaixo só confirma o recebimento e informa o que a política já diz; não promete a exclusão.

**7a. Confirmação de recebimento (pedido de acesso, correção, exclusão ou oposição)**

> Hi <first name>,
>
> We received your request about your personal data. Under our Privacy Policy we reply within 30 days.
>
> For reference: the only personal data our server keeps is a purchase record (your email, the product, the sale identifier, status, amount and currency paid, event and date). It is kept while your license is valid and for up to 5 years for tax and accounting purposes. Your projects and spreadsheets are never sent to us: they stay on your device. Payment details are handled by Gumroad and Stripe, which are separate services.
>
> NexoProcess support

**7b. "Como apago meus dados do aparelho?"**

> Hi <first name>,
>
> Your projects are stored only on your device. To erase them, open **My processes** in the app and choose **Erase local data**. This removes your projects, drafts and preferences from that browser, and also the access token and the license key stored there, so you'll need to sign in again afterwards. It can't be undone, so download a backup first if you want to keep anything.
>
> NexoProcess support

---

## 8. O que este documento NÃO cobre (A VALIDAR)

- Prazo de primeira resposta ao cliente: não existe política escrita; **não prometer**.
- Procedimento de exclusão do registro de compra e sua relação com o prazo de 5 anos (decisão do fundador, §7).
- Pedidos de nota fiscal/fatura e impostos: os Termos só dizem que a Gumroad pode somar impostos no checkout (`TERMS_EN.md` §2). Encaminhe à Gumroad; não afirme nada além disso.
- Versão maior futura ("larger future versions may have their own rules", landing e Termos): sem regra definida; não prometer upgrade gratuito.
- Canal Paddle: ver regra de ouro final.
- Os textos acima são rascunho em inglês sem revisão por falante nativo (mesma ressalva dos textos EN do app, `HANDOFF_EN.md` §7).
