# FocusBrew — Landing page (spec)

Data: 2026-10-13 (revisão 2; revisão 1 de 2026-10-12 trocava o framework por Next.js)
Status: **rascunho para aprovação** — nenhum código foi escrito; este documento só prepara a construção.
Relacionado: [`2026-10-12-google-agenda-design.md`](2026-10-12-google-agenda-design.md) (o que a página pode afirmar sobre a Agenda), spec de auto-update (`2026-10-09-auto-update-design.md`), e a spec da landing do Pacer (`pacer/docs/superpowers/specs/2026-10-09-landing-page-design.md`), usada como modelo de estrutura.

## Histórico

- **Rev. 2 (2026-10-13):** framework trocado de **Next.js** para **Vite + React + TypeScript**, a pedido do Sthevan, e a spec reorganizada na mesma estrutura da landing do Pacer. Próximo passo se aprovada: plano de implementação (fatias L1 a L6, seção 12).
- **Rev. 1 (2026-10-12):** primeira versão, com Next.js, App Router e Vercel.

## 1. Objetivo

Uma página de apresentação do FocusBrew, em **React**, que faça três coisas:

1. **Explicar em 5 segundos** o que o app é: tracker de tarefas do dia no topo da tela, com timer por tarefa, linha de progresso em volta do widget e o seu GitHub no painel.
2. **Mostrar o produto funcionando**, com prints reais do app (vídeo fica para depois, seção 7).
3. **Levar ao download** com um botão que sempre aponta para a versão final mais recente.

Sucesso = quem nunca ouviu falar do FocusBrew entende, vê e instala sem sair da página (ou vai ao GitHub por escolha, não por falta de caminho).

### Público

- Devs Windows que querem um quadro simples do dia, sempre visível, sem abrir outro app.
- Devs que chegam pelo GitHub, LinkedIn ou devlog e querem ver rápido se vale a pena.
- Secundário: quem avalia o Sthevan como dev (código aberto, MIT, Tauri + Rust + React).

### Fora de escopo (desta spec)

- Qualquer mudança no app. As pendências do app que a landing exige estão na seção 10, mas são tarefas separadas.
- Cadastro, login, pagamento, backend próprio. É uma página estática.
- Blog ou changelog dentro da página (as notas continuam no GitHub).
- Versão para macOS/Linux (o app é só Windows).
- Player de música: **não existe no app**. Entra na página só depois de implementado.

## 2. Estado atual (verificado em 2026-10-13)

| Fato | Valor |
|---|---|
| Repositório | `github.com/sthevan027/focusbrew` (público, MIT), `main` em `de5b66f` |
| `homepageUrl` do repo | **a conferir** (apontar para a landing quando existir) |
| Última versão final | `v0.4.1` (*Latest*, 10/10/2026) |
| Pré-release | `v0.5.0-beta.1` (13/10/2026), só no GitHub, não é *Latest* |
| Assets da v0.4.1 | `focusbrew_0.4.1_x64-setup.exe`, `.exe.sig`, `latest.json` |
| Nome do instalador | **inclui a versão** (`focusbrew_<versão>_x64-setup.exe`) |
| Updater no app | **existe** (publicado na v0.4.1, endpoint `releases/latest/download/latest.json`). Falta testar o update real numa versão seguinte |
| Assinatura do updater | chave minisign própria; a variável `TAURI_SIGNING_PRIVATE_KEY` **não está configurada** no PC, então o `tauri build` falha no fim (o instalador é gerado) |
| Authenticode do instalador | **a verificar por release** (`CN=Sthevan.Dev` nas anteriores). Define o texto da seção 5.3 |
| Integração com o Google Agenda | na `main` desde 13/10, **sem credencial no instalador público**: o botão de conexão mostra erro nas builds públicas |
| Player de música | **não implementado** (spec e plano na `main`) |
| Telas existentes p/ mídia | `docs/screenshots/`: widget (minimal, parado, rodando, rgb, lateral), painel (principal, planejar, resumo, GitHub), notas, configurações |
| Cor de destaque padrão | `--accent: #0a84ff` (`src/App.css` e `src/Widget.css`). As demais cores a levantar na L1 |
| Modo demonstração no app | **não existe** |
| Ferramentas de mídia | `ffmpeg` instalado; sem gifski/ImageMagick |

Requisitos reais do produto (para a página não prometer demais): Windows 10/11. Tarefas, tempo e
notas ficam no PC; a aba GitHub usa o login do `gh` CLI (ou um token pessoal).

## 3. Decisões técnicas (recomendação + alternativa)

| Tema | Recomendação | Alternativa | Por quê |
|---|---|---|---|
| Framework | **Vite + React 19 + TypeScript**, gerenciado com **Bun** | Next.js (rev. 1) | Página única estática; sem SSR a manter. Mesmo stack da landing do Pacer, e o app também é React + Vite. Next só compensaria com várias páginas ou blog |
| Versões | As mesmas da landing do Pacer: React ^19.1, Vite ^8, TypeScript ~6, Vitest ^5 | Versões novas na hora | Uma só referência para manter |
| Onde mora | Pasta **`site/`** dentro do repo `focusbrew` | Repo separado | Pedido do Sthevan. `site/` tem `package.json` e `bun.lock` próprios, fora do build do Tauri |
| Hospedagem | **Netlify**, com base `site/` (como o Pacer) | Vercel (rev. 1) | Mesmo fluxo do Pacer. Preview por PR nos dois |
| Estilo | **CSS próprio com variáveis** espelhando o app (`--accent`, `--text`, `--muted`…) | Tailwind | O app usa CSS puro |
| Dados de versão | **API de releases do GitHub** no cliente, com link fixo de fallback | `latest.json` como fonte (seção 6) | Mesma decisão do Pacer (seção 5.2) |
| Idioma | **PT-BR primeiro**, textos num arquivo de strings pronto para EN | PT + EN desde o dia 1 | O repo tem `README.en.md`; EN fica como fatia posterior |
| Domínio | **A decidir** | — | Pergunta aberta (seção 13) |

Identidade visual: **a do produto** (tema escuro, azul `#0a84ff`), não a do portfólio do Sthevan.

## 4. Estrutura da página

Regra: **só afirmar o que é verdade hoje.** Funcionalidade futura ou em teste aparece como "em breve" ou não aparece.

1. **Hero** — título, subtítulo, **botão de download** (seção 5), "Windows 10/11 · grátis · código aberto", e um print do widget no topo da tela ao lado.
   Rascunho de copy (a afinar com a skill `copywriting` na construção):
   - Título: *"O dia do dev, sempre na frente."*
   - Subtítulo: *"O FocusBrew fica no topo da tela com as suas tarefas de hoje, o timer de cada uma e o seu GitHub no painel."*
2. **Como funciona (3 cartões)**, cada um com um print curto:
   - **Tarefas por dia**: planeje o dia, cada tarefa com o seu timer; `#projeto` separa o tempo por projeto.
   - **Widget no notch**: fica colado no topo (ou nas laterais), com linha de progresso em volta; atalhos globais.
   - **GitHub**: PRs e issues entram no painel; um PR pode virar tarefa do dia.
3. **Painel** — os prints de Planejar, Resumo do dia e GitHub, em grade.
4. **Agenda do Google (só quando liberada)** — enquanto a conexão não funciona nas builds públicas, a seção **não aparece**. Ver seção 10, pendência 2.
5. **Privacidade** — lista curta: dados ficam no PC; token do GitHub pelo `gh` CLI, sem armazenar senha; sem telemetria (confirmar antes de publicar); código aberto para conferir.
6. **Instalação** — 3 passos + aviso do SmartScreen (seção 5.3) + requisitos.
7. **Novidades** — últimas 3 versões finais (título + data + link), vindas da mesma chamada da API.
8. **Rodapé** — GitHub, licença MIT, devlog, "feito por Sthevan".

## 5. Botão de download

### 5.1 Comportamento

- Texto: **"Baixar para Windows"** + linha secundária *"v0.4.1 · <tamanho> · instalador .exe"* (versão e tamanho vêm da API).
- Clique inicia o download direto do instalador (`browser_download_url` do asset `focusbrew_*_x64-setup.exe`).
- Em navegador não-Windows (checar `navigator.userAgent`/`userAgentData`): trocar para *"O FocusBrew é só para Windows"* e oferecer "Ver no GitHub". Não esconder, não falhar mudo.
- Estados: carregando (o botão já funciona com o link de fallback), pronto, erro da API (continua funcionando via fallback).
- Acessível por teclado, com `rel="noopener"`; sem pop-up, sem formulário de e-mail.

### 5.2 De onde vem a versão

O instalador se chama `focusbrew_0.4.1_x64-setup.exe`: o número da versão está no nome. Por isso
`releases/latest/download/<nome-fixo>.exe` **não funciona** sem mudar o processo de release. Opções:

| Opção | Como | Prós | Contras |
|---|---|---|---|
| **A (recomendada)** | No cliente, `GET https://api.github.com/repos/sthevan027/focusbrew/releases/latest`; achar o asset `focusbrew_*_x64-setup.exe`; cachear em `sessionStorage` | Sempre atual, sem redeploy, traz notas, data e tamanho | Limite de 60 req/h por IP sem token (suficiente com cache); depende de JS |
| B | `latest.json` do updater como fonte (URL já existe, seção 6) | Um só arquivo, já publicado a cada release | Só se o acesso pelo navegador funcionar (CORS não verificado) |
| C | Build na Netlify + redeploy a cada release | Funciona sem JS | Exige passo extra no release |

**Por que `/releases/latest` serve:** o GitHub não considera pré-release como *Latest*. O beta
`v0.5.0-beta.1` nunca aparece no botão, e isso é o desejado.

**Fallback obrigatório:** o `href` inicial do botão é
`https://github.com/sthevan027/focusbrew/releases/latest` (página da release), então a página funciona
sem JS e se a API falhar.

### 5.3 SmartScreen e certificado — comunicar com honestidade

O texto da seção de Instalação depende de como cada release foi assinada. **Verificar o Authenticode
do instalador antes de publicar a página.** Se for autoassinado (`CN=Sthevan.Dev`), o Windows pode mostrar
"Windows protegeu o computador". Nesse caso a página diz: *Mais informações → Executar assim mesmo*, e
explica que o certificado não é de uma autoridade comercial. Se a release tiver assinatura válida, o texto
muda e o aviso sai.

Extra opcional: publicar o **SHA-256** do instalador nas notas da release e exibi-lo na página.

## 6. Atualizações — relação com a landing

**Situação:** o updater já existe no FocusBrew. A v0.4.1 publica `latest.json` e `.sig`, e o app checa
`releases/latest/download/latest.json` ao abrir. O que falta é a chave de assinatura no PC de build
(`TAURI_SIGNING_PRIVATE_KEY`) e um teste de update real numa versão seguinte.

**O que isso muda para a landing:**

1. **A landing não depende do updater.** Ela funciona só com a API de releases (seção 5). O updater
   mantém quem já tem o app; a landing leva quem ainda não tem.
2. **A regra de nome do instalador deve ser preservada** (`focusbrew_<versão>_x64-setup.exe`), porque a
   landing procura por ela.
3. **`latest.json` como fonte alternativa** (opção B da seção 5.2): só adotar se o acesso por navegador
   funcionar. Testar CORS antes de planejar em cima disso.
4. **Texto "atualiza sozinho" pode entrar na página**, mas só depois de um update real testado
   (v0.4.2 ou seguinte). Hoje, não afirmar.

## 7. Mídia: prints, vídeo e GIFs

### 7.1 Inventário

| Peça | Uso | Formato | Meta |
|---|---|---|---|
| Prints do app | Cards, painel, hero | PNG/WebP, a partir de `docs/screenshots/` | Já existem; conferir se estão atualizados com a versão |
| **Vídeo hero** (8–12 s, loop) | Topo da página | MP4 H.264 + WebM VP9, mudo, `autoplay loop muted playsinline`, com `poster` | ≤ ~1,5 MB cada. **Opcional** (L4) |
| Loops de feature (3–6 s) | Cartões da seção 4 | MP4/WebM mudos | ≤ ~600 KB cada. Opcional |
| **GIFs** (versões dos loops) | README do GitHub, posts, devlog | GIF | ≤ ~3 MB cada |
| Imagem de compartilhamento (OG) | Link no LinkedIn/X/WhatsApp | PNG 1200×630 | 1 |
| Ícone/favicon | Aba do navegador | SVG + PNG (do ícone do app, grão de café) | — |

**Na página, preferir vídeo mudo em loop a GIF.** GIF só onde vídeo não é possível.

### 7.2 Dados de demonstração

Os prints devem usar **dados fictícios** (tarefas e PRs de exemplo), nunca a agenda real do Sthevan.
O README já usa dados de demonstração; reaproveitar esses prints quando forem atualizados.

### 7.3 Como produzir

Caminho recomendado: **captura real com `ffmpeg`** (`gdigrab`) para o vídeo hero, quando existir, e
prints estáticos das telas em `docs/screenshots/` para o resto. Receita de ponto de partida (validar
antes de usar, ajustar região e escala):

```bash
# gravar uma região (x,y,largura,altura) em 30 fps
ffmpeg -f gdigrab -framerate 30 -offset_x 1500 -offset_y 0 -video_size 420x640 -i desktop \
  -c:v libx264 -crf 18 -pix_fmt yuv420p bruto.mp4
# MP4 final leve + WebM
ffmpeg -i bruto.mp4 -an -vf "scale=720:-2" -crf 26 -movflags +faststart hero.mp4
ffmpeg -i bruto.mp4 -an -vf "scale=720:-2" -c:v libvpx-vp9 -crf 34 -b:v 0 hero.webm
# GIF com paleta própria
ffmpeg -i hero.mp4 -vf "fps=15,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" hero.gif
```

Pontos de atenção: o widget fica no topo da tela; gravar com a área de trabalho limpa, ocultar a barra
de tarefas e ícones pessoais, e ter margem para escalar.

## 8. Design e experiência

- **Tokens:** `--accent #0a84ff` (`src/App.css`). Os demais (texto, apoio, fundo escuro, cores de
  alerta) são levantados de `src/App.css` e `src/Widget.css` na L1, e os tokens da página copiam os do app.
- **Tipografia:** o app usa a fonte do sistema. Na web, uma pilha de sistema ou uma fonte carregada de
  forma leve. Definir na construção.
- **Responsivo:** mobile primeiro (16 px de margem lateral, sem rolagem horizontal). No celular o botão
  vira "Só para Windows" + opção de copiar o link para o PC.
- **Movimento:** respeitar `prefers-reduced-motion` (mostra o poster ou o print, sem autoplay).
- **Acessibilidade:** contraste AA no tema escuro, foco visível, imagens com texto alternativo.
- **Tom:** direto, técnico quando precisa, sem enrolação (a voz do Sthevan). Evitar jargão de marketing.

## 9. SEO, medição e desempenho

- `<title>`/descrição, Open Graph e Twitter card, `canonical`, `sitemap.xml`, `robots.txt`, dados
  estruturados `SoftwareApplication` (sistema operacional: Windows; preço: 0; licença MIT).
- **Medição:** o app não tem telemetria. A página não precisa de análise; se houver, deve ser leve e sem
  cookies (decisão pendente). O número de downloads vem do `download_count` dos assets na API de releases.
- **Metas de desempenho (a conferir com Lighthouse):** LCP < 2,5 s em 4G, JS inicial pequeno, imagens
  com `loading="lazy"` abaixo da dobra.

## 10. Pendências no app/release que a landing exige (tarefas separadas)

1. **Chave de assinatura do updater** (`TAURI_SIGNING_PRIVATE_KEY`) configurada para os builds de release.
   Sem ela, o `tauri build` termina com erro e não há `latest.json` assinado.
2. **Google Agenda nas builds públicas:** o `FOCUSBREW_GOOGLE_CLIENT_SECRET` não pode ir no instalador
   público. Antes de anunciar a Agenda na página, é preciso uma forma de conexão que não exponha a chave.
   Até lá, a seção fica fora da página.
3. **Preencher `homepageUrl`** do repositório com a URL da landing.
4. **Manter o padrão de nome** `focusbrew_<versão>_x64-setup.exe` (a landing procura por ele).
5. **Verificar o Authenticode** de cada release final e publicar o SHA-256 nas notas (seção 5.3).
6. **Player de música** só entra na página depois de implementado (spec e plano na `main`).

## 11. Estrutura proposta do projeto

```
focusbrew/
└── site/
    ├── index.html
    ├── package.json            # React 19, Vite 8, TypeScript (bun)
    ├── bun.lock                # próprio, separado do app
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── styles.css          # tokens espelhando o app
    │   ├── content/pt.ts       # todos os textos (pronto para en.ts)
    │   ├── lib/release.ts      # busca/cache da última versão final + escolha do asset
    │   ├── lib/platform.ts     # detecção de Windows
    │   └── components/         # Hero, DownloadButton, Features, Panel, Privacy, Install, Changelog, Footer
    └── public/
        ├── media/              # prints (e vídeo, se houver), posters
        ├── og.png, favicon.svg
        └── robots.txt, sitemap.xml
```

Testes: unitários para `release.ts` (escolha do asset, cache, erro de API, sem asset) e `platform.ts`
(Vitest); verificação manual do botão em Windows e em celular; Lighthouse; checagem sem JS.

## 12. Plano em fatias

| Fatia | Entrega | Depende de |
|---|---|---|
| **L1** | `site/` com Vite+React, tokens, Hero com **botão de download funcionando** (API + fallback), rodapé | — |
| **L2** | Como funciona / Painel / Privacidade / Instalação (com o texto do SmartScreen conferido) / Novidades, com prints | L1 |
| **L3** | Seção de Agenda, **só se** a pendência 10.2 estiver resolvida | pendência 10.2 |
| **L4** | Vídeo hero e loops (opcional) | captura com dados fictícios |
| **L5** | SEO/OG, Lighthouse, deploy na Netlify, `homepageUrl`, devlog/post de lançamento | L1–L2 |
| **L6** | Versão EN; "atualiza sozinho" depois do update real testado | updater testado |

L1 e L2 não dependem de mídia nem de mudança no app: dá para ter a página no ar com prints e o botão
funcionando antes de qualquer vídeo.

## 13. Perguntas em aberto

1. **Domínio/URL** da landing (subdomínio de `sthevan.dev`, `*.netlify.app` ou domínio próprio)?
2. **Hospedagem:** Netlify (como o Pacer, recomendado) ou Vercel (como na rev. 1)?
3. **PT-BR apenas no começo** ou PT + EN já na primeira versão?
4. **Análise de acesso:** nenhuma, ou uma ferramenta leve sem cookies?
5. **Vídeo:** captura real com `ffmpeg` (recomendado) ou só prints no começo?
6. **Assinatura da página:** **Sthevan**, **Virex**, ou os dois?
7. **Opção de download:** A (API de releases, recomendado) ou B (`latest.json`)?

## 14. Critérios de aceite

- O botão baixa o instalador **da versão final mais recente** sem edição manual a cada release, e
  continua funcional (leva à página da release) com a API fora do ar e com JavaScript desligado.
- O beta **nunca** aparece no botão.
- Nada na página afirma funcionalidade que o app ainda não tem (Agenda e player ficam de fora até liberados).
- O SmartScreen e a assinatura são explicados antes do download, conforme a assinatura real da release.
- Mobile 360 px sem rolagem horizontal; `prefers-reduced-motion` respeitado.
- Imagens com dados fictícios, nunca agenda ou tarefas pessoais.
- Lighthouse ≥ 90 em Desempenho, Acessibilidade e SEO (meta a confirmar).
