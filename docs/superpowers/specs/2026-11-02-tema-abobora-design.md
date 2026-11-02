# Sistema de temas + tema Halloween "Abóbora" — design

Data: 2026-11-02 · Autor da direção: Sthevan · Branch: `feat/temas-halloween`
Referência visual (fonte da verdade): canvas Doop https://doop.design/c/s9UFEdADKT (7 frames). Mockup HTML antigo em `docs/themes/mockup-abobora.html` é só apoio; **onde divergir do Doop, vale o Doop.**

## Intenção
Dar ao Focus Brew um sistema de temas e estrear com o tema Halloween/abóbora, para publicar um PR e um post anunciando "sistema de temas" (Halloween de 31/10 já passou: o post vende o sistema, a abóbora é a estreia). O formato do tema já nasce como o formato da futura loja.

## Objetivos
1. Um tema muda cores, fontes, decoração do widget, animações e sons.
2. Tema **Abóbora** completo conforme os frames 1–6 do Doop (frame 7 é só referência da abóbora realista, usada no estado parado).
3. O usuário escolhe o tema em Configurações; escolha persiste em `config`.
4. Pacote de tema com manifesto + CSS + assets + sons, carregado por um loader genérico (nada específico da abóbora no código do app além do pacote).
5. Tema padrão (atual) continua **pixel a pixel igual** quando selecionado.

## Não-objetivos (não fazer nesta entrega)
- Loja/marketplace, upload ou instalação de temas de terceiros, documentação no site.
- Outras variações (só morcegos) e Natal.
- Decorar abas GitHub e Agenda e a janela de Configurações além de trocar cores/fonte (não estão no Doop).
- Executar JS vindo de tema. Tema = só CSS + imagens/SVG + áudio.

## Anti-objetivos (falha mesmo que "funcione")
- Regressão no tema padrão ou em Windows/bordas esquerda/direita.
- Texto ilegível sobre laranja (contraste mínimo AA para texto; o "24:10" pausado do frame 1 deve ficar legível, aumentar o contraste em relação ao Doop).
- Som sem como silenciar, ou som que toca sem ação do usuário (exceto o que o Doop define).
- Animação que ignora `prefers-reduced-motion`.

## Decisões do Sthevan
- Halloween, variação abóbora, laranja fixo.
- Botão de iniciar = abóbora: na ação, pisca duas vezes, abre a boca, com som. A abóbora também é o botão de iniciar de cada tarefa (Painel · Tarefas) e o play do Painel · Música (frames 2 e 4); no widget só de música ela fica no lugar do pause (frame 1).
- Decoração nas "orelhas" (teia de um lado, morcego do outro) em todos os estados fechados; capa de música vira lua (frame 4); janela Nota escura com barra de ferramentas laranja (frame 5).
- Estado parado (barra `kind: "bar"`, 140×6 numa zona `BAR_ZONE` de 14px, em `src/lib/shell.ts`): abóbora espiando atrás da barra, só os olhos; dorme (olhos fechados, "z"), acorda com o mouse na zona, pisca a cada ~5s; versões nas bordas laterais mostram um olho só (frame 6). Mora como irmã de `.shell` dentro de `.shell-frame` com `pointer-events: none`, só no estado parado.
- Usar a abóbora realista (frame 7) só no estado parado; nos tamanhos pequenos (16–22px) usar versão simplificada (silhueta + brilho).

## Decisões minhas (o Sthevan pode trocar; marcadas para revisão)
- **Escolha e armazenamento:** campo novo em `config`: `theme: string` (id do tema, padrão `"default"`). Seletor em Configurações com pré-visualização simples. Um tema não sobrescreve `accent_color` do usuário no tema padrão; no tema abóbora o laranja é fixo.
- **Aplicação:** `data-theme="<id>"` no `.widget-root` + CSS do tema escopado nesse atributo, injetado por `<link>`/`<style>` pelo loader. Variáveis CSS de design (`--accent`, fontes, `--shell-bg`, etc.) são o contrato principal; decoração é CSS + SVG.
- **Pacote do tema** (embutido no app nesta entrega, em `src/themes/<id>/`):
  `theme.json` (id, name, version, author, accent, fonts, css, sounds) · `theme.css` · `assets/` · `sounds/`.
  Loader valida o manifesto (campos obrigatórios, tamanho máx. por arquivo, só extensões permitidas) mesmo para pacotes embutidos, para a validação já existir quando vier a loja.
- **Fontes:** só fontes com licença livre (ex.: Google Fonts OFL), embutidas no pacote (sem CDN em runtime; o app é desktop e pode estar offline). Escolha a critério do dev; prioridade é a legibilidade dos números do timer (fonte display só em títulos curtos).
- **Sons:** sintetizados com Web Audio (sem arquivos, sem licença): piscadas (2 "toc" curtos), boca abrindo, conclusão de ciclo. Volume baixo. **Ligado por padrão no tema abóbora**, com interruptor "Sons do tema" em Configurações (vale para qualquer tema). Respeitar `prefers-reduced-motion` para animação (som segue o interruptor).
- **Acessibilidade:** `prefers-reduced-motion` desliga piscadas/bamboleio (estado final estático); manter `aria-label` nos botões que viram abóbora.

## Entrega esperada (para a PR)
- Código: loader de temas, pacote `halloween-abobora`, seletor em Configurações, módulo de som, abóbora (componente SVG com estados: dormindo, acordada, piscando, boca aberta, pausada), integrações nos pontos do Doop.
- Testes (vitest): validação de manifesto, loader (aplica/remove tema), persistência da escolha em `config`, módulo de som (mock de AudioContext), lógica de estado da abóbora. `bun run test`, typecheck e `bun run build` verdes.
- Regressão: verificação de que sem tema (padrão) o CSS e a marcação não mudam (ex.: snapshot de classes/atributos + conferência visual).
- Evidências: capturas de tela de cada estado do Doop (frames 1–6) lado a lado com o tema padrão; GIF curto da abóbora piscando e abrindo a boca se viável.
- Documentação curta: `docs/themes/FORMATO.md` com o formato do pacote (base da doc pública de depois).

## Restrições de processo
- Trabalhar **somente** no worktree `D:\Projetos\focusbrew-temas` (branch `feat/temas-halloween`). Não tocar `D:\Projetos\focusbrew` (outro agente, captura por voz).
- Bun (`bun install`, `bun run`, `bunx`); não migrar nem trocar lockfile sem perguntar.
- Commits pequenos e em PT-BR (convenção do repo: `feat(temas): ...`). Rebase em `origin/dev` antes de começar. Pode dar `git push origin feat/temas-halloween`; **não** abrir PR, não mergear, não tocar `dev`/`main`.
- Nada de segredos nem de dados pessoais nas capturas.

## Fica a critério do dev
Estrutura interna dos módulos, nomes de arquivo, escolha das fontes, curva exata das animações, como gerar as capturas (app Tauri real, ou Vite + stubs do `src/lib/tauri.ts`). Se algo do Doop for inviável, registrar a divergência em `docs/themes/DIVERGENCIAS.md` em vez de inventar em silêncio.
