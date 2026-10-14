export const pt = {
  nav: { home: "Início", features: "Como funciona", about: "Privacidade", github: "GitHub", download: "Download" },
  hero: {
    badge: "Widget para Windows",
    titleA: "O dia do dev, ",
    titleB: "sempre na frente.",
    subtitle: "O FocusBrew fica no topo da tela com as suas tarefas de hoje, o timer de cada uma e o seu GitHub no painel.",
    cta: "Baixar para Windows",
    ctaWindowsOnly: "O FocusBrew é só para Windows",
    ctaGithub: "Ver no GitHub",
    metaBefore: "Windows 10/11 · Grátis",
    metaAfter: " · Código aberto",
    videoLabel: "Vídeo de 27 segundos mostrando o FocusBrew em uso: a barra no topo da tela, o painel de tarefas, o play com a linha de progresso, os PRs e issues do GitHub virando tarefa, a nota rápida com Ctrl+Alt+N e a grade de atividade, com narração em português",
    videoCaption: "● Veja o FocusBrew em ação (0:27) · com som",
  },
  how: {
    title: "Como funciona",
    subtitle: "Menos abas. Mais tarefa feita.",
    cards: [
      {
        title: "Tarefas por dia",
        text: "Planeje o dia, cada tarefa com o seu timer. Use #projeto para separar o tempo por projeto.",
        img: "media/painel-planejar.png",
        alt: "Painel do FocusBrew na aba Tarefas, com tarefas planejadas e seus timers",
      },
      {
        title: "Widget no notch",
        text: "Fica colado no topo ou nas laterais, com linha de progresso em volta. Atalhos globais configuráveis por você.",
        img: "media/widget-rodando.png",
        alt: "Widget do FocusBrew no topo da tela com uma tarefa rodando e o timer contando",
      },
      {
        title: "GitHub no painel",
        text: "PRs e issues entram no painel. Um PR pode virar tarefa do dia, sem copiar e colar.",
        img: "media/painel-github.png",
        alt: "Aba GitHub do painel do FocusBrew com PRs e issues",
      },
      {
        title: "Notas rápidas",
        text: "Ctrl+Alt+N: escreva, desenhe à mão livre, adicione formas e imagens. Histórico de notas sempre à mão.",
        img: "media/nota-painel.png",
        alt: "Nota rápida do FocusBrew com texto e desenhos à mão livre",
      },
    ],
  },
  panel: {
    title: "O painel",
    subtitle: "Planejar o dia, ver o resumo, acompanhar o GitHub — tudo num lugar só.",
    shots: [
      { title: "Planejar", img: "media/painel-planejar.png", alt: "Aba Tarefas do painel, planejando o dia seguinte" },
      { title: "Resumo do dia", img: "media/painel-resumo.png", alt: "Aba Resumo do painel, com tarefas concluídas e tempo do dia" },
      { title: "GitHub", img: "media/painel-github.png", alt: "Aba GitHub do painel, com PRs e issues" },
    ],
  },
  activity: {
    title: "Seu streak, sempre visível",
    text: "A grade de atividade acompanha os últimos dias de trabalho — estilo GitHub — e o streak atual fica logo ao lado, puxado de verdade do seu uso e do seu GitHub.",
  },
  privacy: {
    title: "Privacidade, sem asterisco",
    items: [
      "Tarefas, tempo e notas ficam só no seu PC",
      "GitHub pelo login do gh CLI — sem guardar senha",
      "Sem telemetria",
      "Código aberto para conferir",
    ],
  },
  install: {
    title: "Instalação",
    subtitle: "Três passos, uns dois minutos.",
    steps: [
      { title: "Baixe o instalador", text: "Um único arquivo .exe para Windows 10/11." },
      { title: "Rode o instalador", text: "O Windows pode mostrar um aviso antes de abrir — a explicação está logo ao lado." },
      { title: "Abra o FocusBrew", text: "O widget aparece no topo da tela e já fica pronto para a primeira tarefa." },
    ],
    warnTitle: "Sobre o aviso do Windows",
    warnText:
      "O instalador é assinado com um certificado próprio (CN=Sthevan.Dev), não de uma autoridade comercial. Por isso o Windows pode mostrar “O Windows protegeu o computador”. O app não foi bloqueado: o Windows só não reconhece o autor do certificado.",
    smartTitle: "O Windows protegeu o computador",
    smartText: "O Windows SmartScreen impediu a inicialização de um aplicativo não reconhecido.",
    smartMore: "Mais informações",
    smartRun: "Executar assim mesmo",
    smartCancel: "Não executar",
    requirements: "Requisitos",
    reqs: ["Windows 10/11"],
  },
  news: {
    title: "Novidades",
    subtitle: "As últimas releases, direto do GitHub.",
    all: "Ver todas as releases →",
    expand: "ver o que mudou",
    fullNotes: "Notas completas no GitHub →",
    empty: "Sem resumo para esta versão.",
    // usado só se a API do GitHub falhar
    fallback: [
      {
        version: "v0.4.1",
        title: "FocusBrew 0.4.1: atualização automática",
        date: "2026-10-09T12:00:00Z",
        highlights: [
          "**Updater do Tauri** — o app checa por atualizações ao abrir, com botão em Geral → Atualizações",
        ],
      },
      {
        version: "v0.4.0",
        title: "FocusBrew 0.4.0: notas rápidas",
        date: "2026-10-08T12:00:00Z",
        highlights: [
          "**Notas rápidas** — Ctrl+Alt+N, com texto, caneta, formas e imagens, histórico e aba própria",
          "**Aba Projetos** saiu, substituída pelas notas",
        ],
      },
      {
        version: "v0.3.0",
        title: "FocusBrew 0.3.0: tracker do dia no notch",
        date: "2026-10-05T23:30:00Z",
        highlights: [
          "**Tarefas por dia**, cada uma com o seu timer, mais **resumo do dia** e **Activity** útil",
          "**Aba GitHub** — PRs e issues viram tarefa do dia direto do painel",
          "**#projeto, meta do dia, alertas e atalhos configuráveis**",
        ],
      },
    ],
  },
  footer: {
    made: "Feito por Sthevan · MIT",
    disclaimer: "Projeto pessoal e código aberto. Não afiliado a nenhuma empresa.",
  },
};
