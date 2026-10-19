# Plano de PRs por fase — release do NexoProcess

Base: [`baseline.md`](baseline.md). Cada PR sai de uma branch nova a partir de `claude/plataforma-gestao-projetos-vni4py` (branch padrão do repositório) e volta para ela.
Antes de cada PR: `npm run nexo:typecheck && npm run lint && npm run nexo:test && npm run nexo:build`, com a saída anexada à descrição do PR.

Legenda: **Implementar** · **Adaptar** (o objetivo vale, a forma proposta não serve ao código real) · **Já atendido** · **Rejeitar** (com motivo).

---

## PR 1 — `perf(build)`: tirar o Recharts do carregamento inicial

| Item do prompt | Decisão | Motivo |
|---|---|---|
| 1.1 Sair do single-file | **Já atendido** | Produção já é multiarquivo. Mantenho o single-file como `nexo:build:single` (alias do atual `nexo:build:preview-file`) para demos offline. |
| 1.1 `manualChunks` por biblioteca | **Implementar** | É a correção da causa raiz: grupos explícitos `react` (react, react-dom, scheduler, react-router), `charts` (recharts e só as dependências dele), `bpmn`, `exceljs`, `jszip`. |
| `build.target: 'es2020'` | **Rejeitar por ora** | O padrão do Vite 8 já gera código moderno; mudar o alvo sem dado de navegador-alvo não melhora nada mensurável. |
| `sourcemap: true` em staging | **Adaptar** | `sourcemap: 'hidden'` só via variável (`VITE_SOURCEMAP=hidden`), para não publicar mapas em produção. |
| `assetsInlineLimit` ~4 KB | **Já atendido** | É o padrão do Vite. |
| 1.2 Rotas pesadas em `lazy` | **Já atendido** | Todas as abas, assistente, formulário, importação e ajuda já são `lazy`. |
| Garantir que bpmn/exceljs/xlsx/jszip não estão no chunk inicial | **Implementar como teste** | Script `nexo:check-bundle` que falha o CI se `recharts`, `bpmn-js`, `exceljs` ou `jszip` aparecerem nos arquivos referenciados pelo `index.html`, e se o inicial passar de **150 KB gzip**. |
| 1.3 `modulepreload` | **Já atendido** | O Vite já emite. |
| 1.4 SRI | **Rejeitar** | Todos os assets são da mesma origem e a CSP já restringe `script-src 'self'`; SRI não acrescenta proteção relevante aqui e exige plugin extra. |
| Script `analyze` | **Implementar** | `nexo:analyze` com o comando de análise do baseline. |

**Meta do PR:** carregamento inicial de 228,7 KB gzip para **≤ 130 KB gzip** (estimativa: −110 KB do Recharts). Lighthouse mobile da home ≥ 90.
**Check:** `nexo:check-bundle` verde; Lighthouse home antes/depois; E2E completo verde.

---

## PR 2 — `sec`: cabeçalhos verificáveis, noscript e entrada maliciosa

| Item do prompt | Decisão | Motivo |
|---|---|---|
| CSP por cabeçalho | **Já atendido** | `public/_headers`. |
| CSP também por `<meta>` | **Rejeitar** | Duplicaria a política em dois lugares (risco de divergência); `frame-ancestors` não funciona em meta. Fonte única: `_headers`. |
| `base-uri 'none'`, `font-src 'self'` | **Implementar** | Endurecimento sem custo: o app não usa `<base>` nem fontes em `data:` (confirmar no teste). |
| Preview aplicar os mesmos cabeçalhos | **Implementar** | O `vite preview` passa a ler `public/_headers`. Assim `curl -I` mostra a CSP real e o E2E deixa de injetá-la manualmente. |
| HSTS | **Adaptar** | Documentar em `docs/security-headers.md`; quem aplica é o Cloudflare (HTTPS automático). Sem `preload`. |
| `<meta name="referrer">` | **Implementar** | Reforço do cabeçalho existente. |
| `<noscript>` com privacidade | **Implementar** | Texto atual não fala de privacidade. |
| Sanitização / `javascript:` | **Adaptar** | Não há `href` vindo de dado. O risco real é o SVG do relatório via `dangerouslySetInnerHTML`. Troco para `<img src="blob:…">` (o navegador não executa script em SVG carregado como imagem) e crio E2E com atividade chamada `<img src=x onerror=alert(1)>`, `<script>` e `=cmd|' /C calc'!A0` em CSV e XLSX. |

**Check:** `curl -I` no preview com os cabeçalhos; nenhum erro de CSP no console em todas as rotas; E2E de entrada maliciosa verde.

---

## PR 3 — `feat(pwa)`: ajustes finos (PWA já existe)

| Item do prompt | Decisão | Motivo |
|---|---|---|
| Manifesto, ícones 192/512/maskable, apple-touch-icon, service worker | **Já atendido** | Gerados pelo `vite-plugin-pwa`; testados no E2E (inclusive offline). |
| `orientation: "portrait-primary"` | **Rejeitar** | Travaria o mapa e as tabelas na vertical em tablet e celular deitado; o uso desktop/tablet precisa de paisagem. Mantém `any`. |
| "Installable" no Lighthouse | **Adaptar** | O Lighthouse 12 removeu a categoria PWA. Verificação pelos critérios de instalação do Chrome (manifesto válido + SW + HTTPS) e, em aparelho real, pelo usuário. |

Provavelmente **não gera PR**: só documentação no checklist de release.

---

## PR 4 — `feat(seo)`: robots, compartilhamento e descrição

| Item do prompt | Decisão | Motivo |
|---|---|---|
| `robots.txt` | **Implementar** | Corrige os 29 erros do Lighthouse. Inclui `Disallow: /app` para a área do app não competir com a landing. |
| `noindex` em `/app/*` | **Adaptar** | SPA sem renderização no servidor não troca meta por rota de forma confiável; `robots.txt` resolve. |
| `canonical`, Open Graph, Twitter Card | **Implementar com condição** | Só são emitidos se `VITE_SITE_URL` estiver definida no build, para não publicar domínio errado. |
| `og.png` 1200×630 | **Implementar** | Gerado localmente com a identidade atual, sem serviço externo. |
| Descrição alinhada ao título da landing | **Implementar** | Fonte única em `brand.ts`. |

**Check:** `curl` no preview mostra as tags; Lighthouse SEO ≥ 90; validação de OG documentada com captura (validadores externos dependem de URL pública, que ainda não existe).

---

## PR 5 — `chore`: boot e projeto

| Item do prompt | Decisão | Motivo |
|---|---|---|
| `#root` com `min-height: 100dvh` (fallback `100vh`) | **Implementar** | Evita salto de layout no boot. |
| `<meta name="color-scheme" content="light dark">`, `dir="ltr"`, `format-detection` | **Implementar** | Baixo risco. |
| `preconnect`/`dns-prefetch` | **Rejeitar** | Não há domínio externo. |
| `.nvmrc` + `engines` | **Implementar** | Node 22. |
| Scripts claros | **Adaptar** | Mantenho o prefixo `nexo:` (o repositório tem outro app na raiz): `nexo:build:single`, `nexo:analyze`, `nexo:lint`, `nexo:check-bundle`. |

---

## PR 6 — `test`: cobrir o que a linha de base mostrou faltar

Já existem 102 unitários e 52 E2E. Os 5 fluxos críticos do prompt já têm teste (demonstração→mapa, CSV→validação→mapa, TO-BE→comparação, exportar `.nexoprocess.json`, interceptação de rede). Lacunas a cobrir:

- **axe em largura de celular** (390 px) nas telas principais — teria pego o `link-name`.
- **Um `<h1>` por rota** (teste automatizado).
- **Lighthouse do mapa** com perfil pré-carregado (meta ≥ 80).
- **Prettier:** **Rejeitar** como obrigatório agora. Formatar o projeto inteiro gera um diff enorme sem ganho funcional; ESLint já está verde. Posso propor em PR separado.
- `docs/ci.md` com o pipeline (o workflow de CI já existe).

---

## PR 7 — `fix(a11y)` / UX

- **Corrigir `link-name`** dos links do cabeçalho no celular (defeito real).
- Revisar foco visível, hierarquia de títulos e estados vazio/erro com o teste do PR 6.
- **Importação grande:** medir uma planilha de 3.000 linhas no celular simulado. Mover a leitura para Web Worker **só se** travar a interface.
- Teste em iOS Safari e Chrome Android reais: **depende de você**.

---

## PR 8 — `docs`: release

- `README.md` revisado, `docs/architecture.md`, `docs/privacy.md` (a partir do `PRIVACIDADE.md` atual), `docs/security-headers.md`, `docs/release-checklist.md`, `CHANGELOG.md`.
- Versão em fonte única: `src/config/brand.ts` (o NexoProcess não tem `package.json` próprio; o da raiz é do outro app).
- **Tag `v0.5.0`**: só com a sua autorização, porque é publicada no repositório.

---

## Ordem e riscos

1. PR 1 (maior ganho medido) → 2 → 4 → 5 → 7 → 6 → 8. O PR 3 vira item de checklist.
2. **Risco do PR 1:** agrupar chunks à mão pode criar dependência circular entre chunks ou duplicar React. Mitigação: o `nexo:check-bundle` verifica que React aparece em um só chunk; E2E completo antes do merge.
3. **Publicação no Cloudflare:** continua dependente do seu token e autorização; nenhum PR publica nada.
