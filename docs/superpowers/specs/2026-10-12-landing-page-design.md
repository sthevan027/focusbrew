# focusbrew — Landing page

**Data:** 2026-10-12 · **Branch:** a definir no plano de implementação.

## 1. Objetivo

**Dito pelo Sthevan:** quer uma landing page pro FocusBrew, dentro do
próprio repositório (pasta `site/`), focada em apresentar o app e levar
pro download — vitrine, não portfólio técnico.

**Sucesso:** página única em `focusbrew.<domínio>` (ou subdomínio do
Vercel enquanto não tem domínio próprio) mostrando o que o app faz, com
prints/gif do widget, e um botão de download que sempre baixa a versão
mais recente publicada no GitHub Releases — sem precisar atualizar a
página a cada release.

**Fica de fora desta spec:** blog/changelog na própria página (release
notes continuam só no GitHub), analytics além do básico do Vercel,
internacionalização (só português, igual ao README).

## 2. Stack e estrutura

- Pasta `site/` na raiz do repo do FocusBrew, projeto Next.js próprio
  (`create-next-app`, App Router, TypeScript, Tailwind) — isolado do
  `package.json`/`src-tauri` do app: `site/package.json`,
  `site/bun.lock` separados, sem compartilhar dependências com o app Tauri.
- Deploy no Vercel, como projeto independente apontando pra pasta `site/`
  dentro do mesmo repo (Vercel suporta "Root Directory" — só esse projeto
  builda/deploya, o app Tauri não entra no build do Vercel e vice-versa).
- `site/README.md` curto documentando `bun install` + `bun run dev`
  dentro da pasta, pra não confundir com o dev do app principal.

## 3. Conteúdo da página

Seções, nessa ordem, uma página só (scroll, sem rotas internas):

1. **Hero:** nome + tagline curta, screenshot/gif do widget em ação
   (notch no topo da tela), botão de download em destaque.
2. **Features:** 3-4 blocos curtos — tracker de tarefas por dia, streak do
   GitHub, atalhos globais, (quando prontos) sync com Google Agenda e
   player de música — cada um com ícone + 1-2 frases, sem textão.
3. **Screenshots/demo:** 2-3 prints reais do app (painel expandido, widget
   compacto, config) — os mesmos já usados no README/divulgação, não
   precisa gerar novo material pra essa spec.
4. **Download:** botão que busca a release mais recente via
   `https://api.github.com/repos/sthevan027/focusbrew/releases/latest`
   (build-time, ISR com revalidação periódica — não client-side a cada
   visita) e linka direto pro instalador `.exe`/`.msi` do Windows;
   texto pequeno com a versão atual embaixo do botão.
5. **Rodapé:** link pro repo GitHub (open source, MIT), link pro LinkedIn
   do Sthevan.

## 4. Dados: puxando a release do GitHub

Rota/`fetch` server-side (Next.js `fetch` com `revalidate`, ex.: 1h) pra
`releases/latest` do repo — pega `tag_name` (versão) e o `browser_download_url`
do asset `.exe`/`.msi` (filtra por extensão/nome do asset, igual ao que o
updater já identifica em `tauri.conf.json`). Falha na busca (API fora, rate
limit) cai num link fixo pra página de Releases do GitHub como fallback —
nunca quebra o botão de download.

## 5. Testes

- Build do Next.js limpo (`bun run build` dentro de `site/`) sem erros de
  tipo/lint.
- Verificação manual: abrir a página publicada no Vercel, clicar no botão
  de download e confirmar que baixa o instalador da release mais recente
  de verdade; simular a API do GitHub fora do ar (bloquear a URL) e
  confirmar que o fallback pra página de Releases aparece em vez de
  quebrar a página.
- Responsivo: checar em largura de celular (375px) e desktop — página
  única, sem necessidade de teste de navegação entre rotas.
