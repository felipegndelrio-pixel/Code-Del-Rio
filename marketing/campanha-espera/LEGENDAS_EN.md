# "A espera invisível" v2 — versão em inglês (Gumroad) e ajuste da versão em português

Nada foi publicado. Vídeos em `exports/v2_en/` (inglês) e `exports/v2/` (português, agora com "Também em inglês, na Gumroad.").

## O que mudou e por quê

| Ajuste | Por quê |
|---|---|
| **Telas do app em inglês** (mapa e plano capturados da interface EN, ramo `wip/en-foundation`) | Um vídeo em inglês com tela em português quebra a confiança do comprador internacional |
| **Textos nos termos da interface EN** ("AS-IS map", "bottleneck", "rework", "action plan") | O que a pessoa lê no vídeo é o que ela encontra no app |
| **Números conferidos na tela EN:** 2 h 15 min de trabalho ativo e 11 h de espera por execução, ambos "Calculated" | Os mesmos do português; nada recalculado por mim |
| **Botão final EN: "Get it on Gumroad"** + linha por rede ("Link in bio", "Link on the channel page", "Link in the first comment") | Uma ação clara, e o lugar exato do link em cada rede |
| **Português ganha "Também em inglês, na Gumroad."** abaixo do botão | Sinal de produto internacional, sem tirar o foco da compra na Hotmart |
| **Gumroad só por nome**, sem o logotipo oficial | O arquivo oficial e as regras de uso da marca não foram fornecidos (A VALIDAR) |

## Onde publicar cada versão (recomendação)

| Rede | Português | Inglês |
|---|---|---|
| Instagram | Feed principal | **Não no mesmo feed.** Use Reel de teste (só para não seguidores) ou um perfil em inglês |
| LinkedIn | Post em português | **Post separado em inglês**, de preferência no seu perfil pessoal, onde estão os contatos internacionais |
| YouTube | Short em português | **Short separado em inglês**, com título, descrição e idioma do vídeo em inglês |

- **Por que separar (INFERÊNCIA):** alternar idiomas no mesmo feed confunde quem já segue e dilui o público. Cada vídeo deve ter um idioma só, porque o texto está gravado na imagem.
- **Rótulo de IA:** vale para todas as versões v2, porque a pessoa e o fio foram gerados com IA. Instagram: ative o rótulo de IA. YouTube: "Altered or synthetic content" = **Yes**.
- **Link da Gumroad:** não está no repositório (é uma variável de ambiente). Use o seu link de compra (`https://<você>.gumroad.com/l/<produto>`) na bio, no perfil do canal e no primeiro comentário do LinkedIn.

---

## Instagram (EN)

```
This order spent 11 h waiting. Only 2 h 15 min was actual work.

Sometimes the problem isn’t the work. It’s the wait.

NexoProcess turns a process description or a spreadsheet into a map that flags bottlenecks and rework. It shows how much is work and how much is waiting, with the source of every number, and turns it into an action plan where you set owners and due dates.

The example is fictional. The app screens are real. Scenes with the person and the thread are AI-generated.

Where does work wait the longest in your process?

Now available in English on Gumroad. Link in bio.

#processimprovement #processmapping #leanmanagement #operations #nexoprocess
```

## LinkedIn (EN)

```
An order spent 11 hours waiting. It was worked on for only 2 h 15 min.

The example is fictional. The pattern may feel familiar.

When a process runs late, it’s tempting to push the people doing the work to go faster. But sometimes the work itself is quick. The time disappears between steps: in the approval queue, in the unanswered email, in the check nobody scheduled.

That waiting doesn’t show up in reports. And what doesn’t show up never makes it into the conversation.

That’s what NexoProcess makes visible:

1. Describe the process or import the spreadsheet you already have.
2. The BPMN map is drawn automatically, with bottlenecks and rework flagged, and the reason for each flag.
3. The diagnosis separates work time from waiting time. Every number shows its source: entered, calculated or estimated.
4. It all becomes an action plan, with owners and due dates set by you.

No black box: recommendations follow explicit rules, with no generative AI. Your process data stays on your device.

NexoProcess is now available in English, on Gumroad.

In the video, the app screens are real and the data comes from a fictional sample. Scenes with the person and the thread were generated with AI.

A question for anyone who runs processes: at which step does your team’s work wait the longest?

#ProcessImprovement #OperationalExcellence #Lean #BPMN
```

**Primeiro comentário:** "Get NexoProcess on Gumroad:" seguido do seu link de compra.

## YouTube Shorts (EN)

**Título:**
```
11 h waiting, 2 h of work: where does your process wait?
```

**Descrição:**
```
This order spent 11 h waiting and only 2 h 15 min being worked on. Sometimes the problem isn’t the work. It’s the wait.

NexoProcess turns a process description or your spreadsheet into a map with bottlenecks and rework flagged. It shows how much is work and how much is waiting, with the source of every number, and helps you build an action plan with owners and due dates.

Real app screens. Fictional sample data. Scenes with the person and the thread are AI-generated.

Now in English on Gumroad. The link is on the channel page.

#processimprovement #lean #operations
```

**Ao subir:** idioma do vídeo = English; "Altered or synthetic content" = Yes.

---

## Português: linha nova nas legendas da v2

Acrescente, antes do "Link na bio" (Instagram), do "Siga para acompanhar…" (LinkedIn) e do "Inscreva-se…" (YouTube):

```
Disponível também em inglês, na Gumroad.
```

O restante das legendas em português continua o de `LEGENDAS.md`, incluindo a linha "Cenas com a pessoa e o fio: geradas com IA."

## Fontes no código (FATO)
- Termos e textos da interface EN: `apps/nexoprocess/src/i18n/messages/en.ts`, ramo `wip/en-foundation` ("AS-IS map", "Bottleneck", "Rework", "Action plan", "no generative AI is connected", "Your process data stays on this device and is not sent to our servers.").
- Gumroad: integração da license key em `apps/nexoprocess/api/_lib/gumroad.ts`; link de compra por variável `VITE_GUMROAD_CHECKOUT_URL` (`docs/LANCAMENTO_EN.md`).
