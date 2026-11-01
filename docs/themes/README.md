# Temas do Focus Brew — rascunho (2026-11-01)

Estado: **brainstorm em andamento, nada aprovado, nenhum código de produto escrito.**
O único arquivo útil aqui é o mockup interativo: `mockup-abobora.html` (abre direto no navegador).

## O que o Sthevan decidiu
- Um tema muda **tudo**: cores, fontes, estilo do widget (decorado, não só preto), animações e **sons**.
- Primeiro tema: **Halloween**, variação **abóbora** (laranja como cor fixa). Depois outras variações (ex.: só morcegos) e o Natal.
- O botão de iniciar é uma abóbora: ao clicar, pisca duas vezes e abre a boca, com som.
- Foco em **um tema** primeiro. A loja/marketplace de temas (HTML + CSS publicados por outras pessoas) vem depois, com a documentação no site.
- Meta: publicar numa terça-feira, com post anunciando. Atenção: o Halloween (31/10) já passou, então o post pode vender "sistema de temas" com a abóbora de estreia.

## Sugestões minhas (não confirmadas)
- Construir a abóbora já como **pacote de tema** (`theme.json` + `theme.css` + `assets/` + `sounds/`), que é o formato que a loja vai usar depois.
- Cores e fonte valem em todas as telas; decoração só nos estados principais (fechado/orelhas, música, aba Tarefas, aba Resumo). Config e Nota só com cores na estreia.
- A decoração mora nas "orelhas" (curvas onde a ilha encontra a borda da tela): morcego pendurado de um lado, teia do outro.

## O que o código tem hoje (levantado em 2026-11-01, `dev` @ b050221)
- Visual do widget: `src/Widget.css` (~1500 linhas). Cor de destaque entra por `--accent` (vem de `config.accent_color`, definido em `src/Widget.tsx`). Não existe sistema de temas.
- Orelhas: variável `--ear` (14px; 22px quando só há música), desenhadas com `radial-gradient` nos pseudo-elementos da `.shell-frame`.
- Estados do widget: fechado sem timer (invisível), fechado com timer (`Notch.tsx`: caixa centro/lateral/padrão, rodando/pausado), caixa só de música (`MediaBox`), painel aberto (`Panel.tsx`) com abas Tarefas, Resumo, GitHub, Agenda, Música. Bordas suportadas: topo, esquerda, direita (`data-edge`).
- Janelas extras: Configurações (`src/settings/`) e Nota (`src/NoteWindow.tsx`, `src/note/`). Ambas carregam o mesmo bundle; o CSS do widget é escopado em `.widget-root`.
- **Som:** o app não toca nenhum áudio hoje. É uma capacidade nova (Web Audio ou `<audio>` no frontend).

## Perguntas em aberto
- Recorte de decoração: só estados principais ou todos (inclui GitHub, Agenda, Config, Nota)?
- Como o usuário escolhe o tema (Configurações) e onde a escolha é guardada (`config`)?
- Segurança do formato de tema para a loja: permitir só CSS e assets (sem JS), validar manifesto, limitar tamanho.
- Sons: arquivos próprios com licença livre; botão de silenciar obrigatório; som ligado por padrão ou não?
- Acessibilidade: respeitar `prefers-reduced-motion`; manter contraste do texto sobre o laranja.
