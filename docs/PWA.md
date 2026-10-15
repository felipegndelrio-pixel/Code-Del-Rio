# Aplicativo móvel (PWA)

A plataforma é um Progressive Web App: instala na tela inicial e abre em tela
cheia. **Não** está publicada na App Store nem no Google Play.

## iPhone / iPad
1. Abra a URL HTTPS da plataforma no **Safari** (outros navegadores no iOS podem não oferecer a opção).
2. Toque em **Compartilhar** → **Adicionar à Tela de Início** → **Adicionar**.
3. Abra pelo ícone **Projetos**.

## Android
1. Abra a URL no **Chrome** (ou Edge/Samsung Internet).
2. Menu **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).

## Segurança do cache
- O service worker armazena **apenas o app shell estático** (HTML/JS/CSS/ícones).
- Nenhuma resposta da API (`/rest/v1`, `/auth/v1`, `/storage/v1`) é cacheada.
- Não há sincronização offline de dados: sem conexão, o app exibe aviso e não grava.
- A sessão (token do Supabase Auth) fica no `localStorage` do dispositivo,
  padrão do Supabase; use bloqueio de tela e “Sair” em aparelhos compartilhados.
- Atualizações: o app avisa “Nova versão disponível” e atualiza ao confirmar.

Verificado por `tests/e2e/app.spec.ts` (manifesto, ícones, service worker,
aviso offline, layout de 390 px sem rolagem horizontal).
