# focusbrew

App de bandeja (tray) open source que percebe quando você está trabalhando com
IA/editor de código, ativa um modo foco (bloqueia distrações, troca o tema,
liga o Não Perturbe) e te dá um painel com tarefas, PRs/issues do GitHub e um
timer estilo Pomodoro com pausa-café.

Feito com [Tauri](https://tauri.app) (Rust) + React/TypeScript — nativo,
leve, multiplataforma.

## Estado do projeto

MVP funcional no Windows. Linux e macOS têm os hooks de sistema (tema,
Não Perturbe) implementados como *best-effort* — veja [Limitações](#limitações-conhecidas).

## Funcionalidades

- **Detecção de atividade**: monitora processos conhecidos (VS Code, Claude
  Code, Cursor — configurável) e muda o ícone da bandeja entre
  idle / trabalhando / foco / pausa-café.
- **Modo foco**: ao detectar atividade, opcionalmente bloqueia apps de
  distração (fecha processos de uma lista configurável), ativa o Não
  Perturbe do sistema e troca o tema pra escuro. Notifica quando liga/desliga.
- **Timer de café**: ciclos de foco/pausa configuráveis (padrão 50/10min),
  ícone da bandeja vira uma xícara durante a pausa e o modo foco é suspenso
  automaticamente nesse período.
- **GitHub**: conecta via Personal Access Token (guardado no cofre de
  credenciais do SO, nunca em texto plano) e lista PRs/issues abertos onde
  você está envolvido. Dá pra importar qualquer item como tarefa.
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
bloqueados, intervalo de checagem, se bloqueio/DND/tema estão ligados, e as
durações do timer. As configurações ficam em
`%APPDATA%/focusbrew/settings.json` (Windows) — caminho equivalente via
`ProjectDirs` nas outras plataformas.

## Limitações conhecidas

- **Detecção de IA é por processo, não por atividade real**: hoje o app só
  sabe dizer "esse processo está rodando", não "a IA está processando agora".
  Uma integração mais precisa (extensão do VS Code, hook do Claude Code)
  fica como contribuição futura.
- **Não Perturbe do Windows** usa uma chave de registro não documentada
  oficialmente pela Microsoft (a mesma que a flyout do Focus Assist escreve).
  Funciona nas versões testadas, mas pode quebrar em builds futuras do
  Windows — se falhar, o resto do modo foco (tema, bloqueio de apps) continua
  funcionando normalmente.
- **Linux/macOS**: tema (`gsettings`/AppleScript) e DND são best-effort e
  cobrem só os casos mais comuns (GNOME no Linux; no macOS o DND depende de
  você criar manualmente os atalhos `focusbrew-dnd-on`/`focusbrew-dnd-off`
  no app Atalhos). Contribuições pra outras DEs/versões são bem-vindas.

## Recomendado no VS Code

- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Licença

MIT.
