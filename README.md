# focusbrew

Um tracker do dia pra quem programa, num widget colado no topo da tela. Você
lista as tarefas, dá play em uma, e uma linha se enche em volta do widget
enquanto o tempo corre. Passou o mouse? Abre o painel com as tarefas de hoje e
a grade dos seus últimos 28 dias.

Feito com [Tauri](https://tauri.app) (Rust) + React/TypeScript. Windows.

<p align="center">
  <img src="docs/screenshots/widget-rodando.png" alt="Widget no topo da tela com a contagem e a tarefa" width="440">
</p>

## Como funciona

- **Parado:** uma barra reta e fina no topo da tela, sem nada dentro.
- **Rodando:** a barra vira uma caixa com a contagem regressiva à esquerda e o
  nome da tarefa à direita; uma linha em volta dela vai se enchendo. No modo
  **Minimal** só a caixa e a linha aparecem.
- **Passou o mouse:** depois de um instante, abre o painel — **To Do** à
  esquerda e **Activity** à direita. Quando o mouse sai, ele fecha.

<p align="center">
  <img src="docs/screenshots/widget-parado.png" alt="Barra parada" width="260">
  <img src="docs/screenshots/widget-minimal.png" alt="Modo minimal" width="260">
  <img src="docs/screenshots/widget-rgb.png" alt="Linha RGB" width="260">
</p>

### O painel

<p align="center">
  <img src="docs/screenshots/painel.png" alt="Painel To Do e Activity" width="560">
</p>

- Cada tarefa tem o **seu tempo** (de 5 a 180 minutos, de 5 em 5), um botão
  **play** e uma alça pra **arrastar** e reordenar. Passando o mouse na linha
  aparece um **×** pra remover.
- Só uma tarefa roda por vez. Dar play em outra encerra a primeira e guarda o
  tempo trabalhado; parar antes do fim, concluir ou fechar o app também guardam.
- Quando o tempo acaba, o Windows avisa ("Bloco concluído"). A tarefa continua
  aberta: quem marca como feita é você.
- **Activity** mostra as últimas 4 semanas, segunda a domingo; quanto mais
  foco no dia, mais forte o azul. Passe o mouse num quadrado pra ver a data e o
  tempo.
- Se o computador dormir, o tempo parado **não** conta.

**Atalho global:** `Ctrl+Shift+Space` pausa e retoma o bloco; com nada rodando,
inicia a primeira tarefa aberta.

## Configurações

Clique no ícone da bandeja (ou use **Abrir configurações** no menu dele).

<p align="center">
  <img src="docs/screenshots/configuracoes.png" alt="Janela de configurações" width="560">
</p>

| Seção | O que muda |
|---|---|
| **Foco** | minutos de uma tarefa nova; aviso quando o bloco termina |
| **Notch** | estilo Standard ou Minimal; linha de progresso; linha RGB; **cor de destaque**; tamanho (Pequeno, Médio, Grande) |
| **Geral** | mostrar ou esconder o widget; versão |
| **GitHub** | conectar pelo login do `gh` (ou um token) e importar PRs e issues como tarefas |

### GitHub

Se o [GitHub CLI](https://cli.github.com) estiver instalado e logado
(`gh auth login`), a aba GitHub mostra **Conectar com o GitHub CLI**, sem token
pra colar. Sem o `gh`, dá pra usar um Personal Access Token (guardado no cofre
de credenciais do Windows). A lista de PRs/issues atualiza ao abrir o app e a
cada 5 minutos; o botão **+ Tarefa** de cada item cria uma tarefa com o
repositório na nota.

## Instalação

Baixe o instalador mais recente em
[Releases](https://github.com/sthevan027/focusbrew/releases)
(`focusbrew_<versão>_x64-setup.exe`).

O instalador é de **um clique**: instala só pro usuário atual (sem pedir
admin), sem telas de assistente, cria atalhos na área de trabalho e no menu
Iniciar e abre o app ao terminar. A setinha no canto do ícone da área de
trabalho é o padrão do Windows pra qualquer atalho.

Se o SmartScreen avisar na primeira execução (o certificado é interno),
clique em **Mais informações → Executar assim mesmo**.

Pra desinstalar: **Configurações → Apps → Apps instalados → focusbrew**.

## Desenvolvimento

Pré-requisitos: [Rust](https://www.rust-lang.org/tools/install) + o Visual
Studio Build Tools com o workload "Desktop development with C++" (veja os
[pré-requisitos do Tauri](https://tauri.app/start/prerequisites/)) e Node.js 18+.

```bash
npm install
npm run tauri dev      # app em desenvolvimento
npm test               # contas do front-end (vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # regras do timer, tarefas e configurações
npm run dist            # instalador em src-tauri/target/release/bundle/nsis/
npm run dist:signed     # o mesmo, assinado (certificado em src-tauri/tauri.signing.conf.json)
```

O instalador usa uma cópia do template NSIS do Tauri
(`src-tauri/windows/installer.nsi`, base `tauri-cli` 2.11.4) que força o modo
passivo; se atualizar o `@tauri-apps/cli`, compare com o template novo.

### Como o código está organizado

```
src-tauri/src/
  tracker/        o coração, sem Tauri: timer por horário final, tarefas, atividade por dia
  widget.rs       tamanho e posição da janela do widget (colada no topo do monitor)
  config.rs       configurações (lê qualquer arquivo, antigo ou quebrado, sem falhar)
  state.rs        o estado e o que a interface recebe
  commands.rs     os comandos que a interface chama
  github.rs       login pelo gh/token, PRs e issues, calendário de contribuições
  lib.rs          bandeja, atalho global, o relógio de 1 s, notificações
src/
  Widget.tsx      a janela do widget (barra, caixa, painel)
  widget/         Notch, ProgressLine, TodoPanel, TaskRow, ActivityGrid
  App.tsx         a janela de configurações
  settings/       as seções
  lib/            contas puras (linha de progresso, grade, reordenar) com testes
```

O backend guarda *qual tarefa está rodando* e *quando ela termina*; a interface
só desenha a partir desse horário, sem contar tempo por conta própria. Os
dados ficam em `%APPDATA%\sthevandev\focusbrew\` (`config\settings.json`,
`data\tasks.json`, `data\activity.json`).

## Licença

MIT.
