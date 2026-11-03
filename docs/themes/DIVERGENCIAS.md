# Divergências do Doop e limitações

Fonte visual: canvas Doop `s9UFEdADKT` (frames 1 a 7). Onde algo ficou diferente
ou não foi feito, está aqui com o motivo.

## Ambiente de verificação

- **Rust não compila nesta máquina.** `rustc` falha ao iniciar (`STATUS_DLL_NOT_FOUND`,
  0xc0000135), então `cargo test` não rodou. As mudanças Rust (`config.rs`: campos
  `theme` e `theme_sounds`, normalização do id e testes; `lib.rs`: evento
  `block-finished`) foram revisadas à mão e **não foram verificadas por compilador**.
  Antes do merge: `cargo test` em `src-tauri`.
- **Capturas**: feitas com o Chrome headless sobre o `Widget` real (Vite dev) com
  `mockIPC` e dados fictícios (`tools/capture/`). Não é o app Tauri instalado: a
  janela transparente, a CSP e o posicionamento real não foram testados nele.
- Playwright (MCP) estava fora do ar; a captura foi feita com o Chrome direto.
- **GIF da abóbora piscando**: não feito.
- **Captura da Nota (frame 5)**: não feita; o harness não monta a janela de Nota.
  O CSS da barra de ferramentas está aplicado, mas não há prova visual.
- **Frame 7 (abóbora realista com gradientes)**: não reproduzido. A abóbora usa as
  formas planas dos frames 2 e 4 (`Pumpkin.tsx`), sem o sombreado do frame 7.
  O spec permite versão simplificada nos tamanhos pequenos; aqui ela é usada em
  todos os tamanhos, por falta de tempo para a versão realista.

## Diferenças de visual

- **Fonte**: Nunito (variável, OFL, embutida) em todo o widget. A Pirata One do
  Doop não foi embutida: ela aparece nos títulos das pranchas, não dentro do widget.
- **Frame 1, "24:10" pausado**: o Doop usa `opacity .4` (contraste perto de 2:1).
  Aqui o texto pausado usa a cor normal do tema. Não houve teste automático de
  contraste WCAG nesta entrega.
- **Frame 1, borda lateral**: a caixa lateral não tem as orelhas decoradas (só o
  topo). Nas bordas esquerda e direita a abóbora espiando **fica oculta**
  (`display: none`); a arte lateral não foi feita.
- **Frame 1, "Só música"**: sem capa real, a capa vira lua (gradiente). Com capa
  real, a capa do app é mostrada.
- **Frame 5 (Nota)**: o Doop mostra a barra de ferramentas escura com o botão ativo
  laranja. Foi isso que se fez. O spec fala em "barra de ferramentas laranja"; o
  frame é a fonte da verdade, então a barra fica escura e o ativo fica laranja.
- **Frame 3 (Resumo)**: a coluna de atividade (mapa de calor) do Doop não aparece
  porque o rastreamento de atividade vem desligado no app. O mapa existe no app,
  mas não foi estilizado para o tema nem capturado.
- **Frame 2 (Tarefas)**: no Doop, a linha rodando tem contorno laranja; no app ela
  já usa `--accent`, que é laranja no tema.
- **Frame 6 (parado)**: a abóbora espiando mostra só os olhos (janela de 8 px). A
  versão acordada foi capturada isolada (barra e abóbora montadas diretamente),
  porque o `mouseover` real também abre o painel.

## Comportamento

- **Som de fim de bloco**: depende de o `AudioContext` já ter sido liberado por um
  clique. Um bloco que termina sem nenhum clique antes na janela pode ficar mudo
  (política de áudio do WebView2). Não verificado no app real.
- **Piscadas do estado parado não tocam som** (são ambientais, sem ação do usuário).
  A sequência do clique toca `toc` duas vezes e depois a boca.
- **Botão de iniciar do widget**: o widget não tem um botão de iniciar próprio. A
  abóbora está nos dois lugares que o frame 2 e o frame 4 mostram: o botão de cada
  tarefa e o play da música.
- **Movimento reduzido**: a sequência do clique pula as piscadas e mantém a boca
  aberta por um instante; as piscadas do estado parado somem.
- **Acessibilidade**: os botões que viram abóbora têm `aria-label` ("Iniciar",
  "Pausar", "Tocar").
- **Janelas de Configurações e Nota** recebem `data-theme` no `<html>`, não no
  `.widget-root` (elas não têm esse elemento). O CSS do tema vale nas duas.

## Escopo não entregue

- Decoração das abas GitHub e Agenda e das janelas além de cores e fonte (fora do
  Doop, conforme o spec).
- Sons como arquivos (o conjunto "abobora" é sintetizado).
- Teste automático de contraste e teste de regressão visual pixel a pixel. Há
  snapshot de marcação do tema padrão e capturas.
