# focusbrew

App de bandeja (tray) open source que percebe quando você está trabalhando com
IA/editor de código, ativa um modo foco (bloqueia distrações, liga o Não
Perturbe) e te dá um painel com tarefas, PRs/issues do GitHub e um timer
estilo Pomodoro com pausa-café.

Feito com [Tauri](https://tauri.app) (Rust) + React/TypeScript — nativo,
leve, multiplataforma.

## Estado do projeto

MVP funcional no Windows. Linux e macOS têm o hook de sistema (Não Perturbe)
implementado como *best-effort* — veja [Limitações](#limitações-conhecidas).

## Funcionalidades

- **Detecção de atividade**: monitora processos conhecidos (VS Code, Claude
  Code, Cursor — configurável) e muda o ícone da bandeja entre
  idle / trabalhando / foco / pausa-café.
- **Modo foco**: ao detectar atividade, opcionalmente bloqueia apps de
  distração (fecha processos de uma lista configurável) e ativa o Não
  Perturbe do sistema. Notifica quando liga/desliga.
- **Timer de café**: ciclos de foco/pausa configuráveis (padrão 50/10min),
  ícone da bandeja vira uma xícara durante a pausa e o modo foco é suspenso
  automaticamente nesse período. Dá pra pausar o timer sem encerrar a sessão
  (congela a contagem, retoma de onde parou).
- **Widget flutuante**: janela estilo "notch", fixa no topo-centro da tela,
  sempre visível. Colapsada mostra só ícone de status + timer; ao clicar,
  expande num painel com controles rápidos, anel de progresso da sessão
  atual (cor customizável ou seguindo o accent color do sistema) e o
  heatmap de streak.
- **Atalho global**: `Ctrl+Shift+Space` liga/desliga o modo foco de
  qualquer lugar, sem precisar focar a janela.
- **GitHub**: conecta via Personal Access Token (guardado no cofre de
  credenciais do SO, nunca em texto plano) e lista PRs/issues abertos onde
  você está envolvido. Dá pra importar qualquer item como tarefa. O widget
  também puxa sua contribution calendar real (via GraphQL) pra mostrar
  streak e heatmap dos últimos dias.
- **Quadro de tarefas**: checklist simples e local, persistido em disco.

## Rodando localmente

Pré-requisitos: [Rust](https://www.rust-lang.org/tools/install) + toolchain
de build da sua plataforma (no Windows, o Visual Studio Build Tools com o
workload "Desktop development with C++"; veja os
[pré-requisitos do Tauri](https://tauri.app/start/prerequisites/)), Node.js 18+.

```bash
npm install
npm run tauri dev
```

Build de produção (gera o instalador):

```bash
npm run tauri build
```

## Configuração

Tudo é ajustável na aba **Config** do app: processos monitorados, apps
bloqueados, intervalo de checagem, se bloqueio/DND estão ligados, cor do
anel de progresso do widget, e as durações do timer. As configurações
ficam em `%APPDATA%/focusbrew/settings.json` (Windows) — caminho
equivalente via `ProjectDirs` nas outras plataformas.

## Limitações conhecidas

- **Detecção de IA é por processo, não por atividade real**: hoje o app só
  sabe dizer "esse processo está rodando", não "a IA está processando agora".
  Uma integração mais precisa (extensão do VS Code, hook do Claude Code)
  fica como contribuição futura.
- **Não Perturbe do Windows** usa uma chave de registro não documentada
  oficialmente pela Microsoft (a mesma que a flyout do Focus Assist escreve).
  Funciona nas versões testadas, mas pode quebrar em builds futuras do
  Windows — se falhar, o resto do modo foco (bloqueio de apps) continua
  funcionando normalmente.
- **Linux/macOS**: DND é best-effort e cobre só os casos mais comuns (GNOME
  no Linux; no macOS depende de você criar manualmente os atalhos
  `focusbrew-dnd-on`/`focusbrew-dnd-off` no app Atalhos). Contribuições pra
  outras DEs/versões são bem-vindas.

## Recomendado no VS Code

- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Licença

MIT.
