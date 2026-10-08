# focusbrew — widget nas bordas da tela (pacote A)

**Data:** 2026-10-08 · **Branch:** `main`
**Base:** [spec da etapa 1](2026-10-05-daily-notch-design.md) e
[spec da v0.3](2026-10-05-v0.3-o-dia-design.md). Tudo que não é dito aqui
continua valendo de lá.

## 1. Objetivo

**Dito pelo Sthevan:** poder colocar o widget nas laterais da tela, canto
esquerdo e direito; "coladinho na lateral, na vertical". Com a tarefa rodando,
a caixa continua **horizontal** (texto normal) saindo da borda. Na lateral o
widget fica **centralizado na altura**. Mais fluidez nas transições.

**Sucesso:** na configuração, trocar entre Topo / Esquerda / Direita e ver o
widget grudado na borda escolhida, com barra parada, caixa rodando e painel
aberto funcionando igual ao topo, sem engasgar.

**Do estudo da Ilha do Niko** (só conceito, sem copiar código — licença
proprietária): estado bruto vs efetivo, tamanho por cascata de prioridade,
transição assimétrica mola/fechar rápido e "orelhinhas" de notch em CSS puro.

**Fica de fora:** fluidez da lista/hover, digitar o tempo e auto-close do
painel (pacote B); ícones da configuração (pacote C); colisão geométrica com
outras janelas e fila de notificações (backlog); arrastar o widget para
qualquer ponto da tela; posição vertical configurável; texto girado.

## 2. Configuração e geometria (Rust)

**`AppConfig.widget_edge`**: `WidgetEdge { Top, Left, Right }`, serde
`snake_case`, padrão `Top`, com `#[serde(default)]`. Arquivo antigo, sem o
campo, carrega como `Top`. Na tela de configuração (`NotchSection`) é um
seletor de 3 opções: Topo / Esquerda / Direita.

**Janela** (`widget.rs`): segue com o tamanho fixo do painel (560×300 ×
escala). Redimensionar uma WebView faz pular ~100 ms de quadros, então o que
muda é só onde ela é colocada. `physical_bounds` passa a receber a altura do
monitor e a borda:

| Borda | x | y |
|---|---|---|
| `top` | centralizado no monitor | topo do monitor |
| `left` | borda esquerda do monitor | centralizado na altura |
| `right` | borda direita do monitor menos a largura da janela | centralizado na altura |

Sem monitor conhecido, usa o fallback atual (largura 1280) e altura 720.

**Zona do mouse** (`hot_zone`): recebe a borda. Na lateral, a barra parada é
**vertical** (14×140 em vez de 140×14); a caixa rodando mantém 320×44. A zona
é posicionada pela mesma função da janela, então as duas continuam alinhadas.

## 3. Front-end: forma, ancoragem e orelhinhas

`Widget.tsx` lê `widget_edge` do estado e põe `data-edge="top|left|right"` em
`.widget-root`.

**Ancoragem (CSS):**

| Borda | `.hit` e `.shell-frame` |
|---|---|
| `top` | `top:0; left:50%; translateX(-50%)` (como hoje) |
| `left` | `left:0; top:50%; translateY(-50%)`, cresce para a direita |
| `right` | `right:0; top:50%; translateY(-50%)`, cresce para a esquerda |

**Cantos:** o lado que encosta na tela fica reto. `top`: `0 0 14px 14px`;
`left`: `0 14px 14px 0`; `right`: `14px 0 0 14px`. Barra parada com 4 px e
painel aberto com 18 px, como hoje. O contorno de destaque do painel (`::after`)
não desenha o lado colado na borda.

**Barra parada:** 6×140 nas laterais (6 de largura, colada na borda).

**Linha de progresso:** `uPath` (em `lib/progress.ts`) ganha o parâmetro de
borda e desenha um "U" aberto para o lado da tela: `top` percorre esquerda,
base e direita (como hoje); `left` percorre topo, direita e base; `right`
percorre topo, esquerda e base. Em todos enche começando pela ponta de cima.

**Orelhinhas de notch:** duas curvas côncavas, uma de cada lado de onde a
caixa/painel encosta na borda, feitas com `::before`/`::after` e
`radial-gradient` de raio 14 px, na cor de fundo da forma. Só aparecem na caixa
e no painel (não na barra parada), com fade. Como `.shell` tem `overflow:hidden`
e o `::after` dela já é o contorno, entra uma **moldura** nova: `.shell-frame`
(anima largura/altura e leva as orelhinhas) com `.shell` dentro a 100%. É a
única mudança estrutural no DOM.

## 4. Estado efetivo, cascata e transição

**Estado bruto vs efetivo:** `Widget.tsx` guarda só fatos (`phase`, `pinned`,
status do timer). A forma exibida é derivada, sem estado novo.

**Cascata de prioridade:** `pickShape(ctx)` em `lib/shell.ts`, pura, substitui
`shellSize`/`hitSize`. Ordem:

1. widget escondido (`widget_visible` desligado) → nada
2. painel aberto (fixado ou não) → painel; ao fechar, a forma já encolhe
   para a caixa ou a barra, como hoje (`phase === "closing"` cai nos degraus 3/4)
3. timer rodando ou pausado → caixa
4. senão → barra

Devolve `{ kind, shell: Size, hit: Size }` considerando a borda. Sem tipos
extras: uma futura notificação entraria como um degrau a mais.

**Transição assimétrica:** postos barra < caixa < painel. O front compara o
posto anterior com o novo e põe `grow` ou `shrink` na moldura.

- `grow`: ~480 ms, curva de mola via `linear()` com estouro de ~2%. O painel
  tem o tamanho da janela, então o estouro dele é cortado pela borda da janela
  e só se vê de barra para caixa.
- `shrink`: ~200 ms, cubic-bezier de saída rápida, sem estouro.
- `prefers-reduced-motion`: sem mola, só a curva curta.
- A duração de `shrink` vira uma constante única em `lib/shell.ts`, entregue ao
  CSS por uma variável (`--shrink-ms`), no lugar do `CLOSE_MS` que hoje precisa
  bater com o CSS à mão.

## 5. Casos de borda e limitações

- **Barra de tarefas do Windows na mesma lateral:** o widget usa os limites
  inteiros do monitor (como já faz no topo), então pode ficar por baixo/por cima
  dela. Limitação conhecida; usar a área útil fica para depois.
- **Trocar a borda com o app aberto:** `apply` recalcula; o front muda o
  `data-edge`. A forma "pula" para o novo lugar, sem animação entre bordas.
- **Monitor secundário, origem negativa, escala 150%/200%:** cobertos pelo
  `physical_bounds`, agora com a altura.
- **Painel na lateral:** conteúdo (560×300) inalterado; só a ancoragem. Na
  direita cresce para a esquerda.

## 6. Testes e verificação

- **Rust** (`layout_tests`): as 3 bordas em escala 1×/1.5×/2×, monitor com
  origem negativa, zona vertical nas laterais, topo idêntico ao de hoje
  (regressão), `widget_edge` ausente no JSON antigo → `Top`.
- **Vitest:** `pickShape` (cada degrau, nas 3 bordas), `uPath` por borda,
  direção da transição pelo posto, constante de duração.
- **No app real:** 3 bordas × 3 escalas, barra parada, caixa rodando e painel
  aberto, mais um monitor secundário; build e app aberto.

## 7. Entrega

Esta spec e o código vão para a `main`, sem PR (pedido do Sthevan). Cada
passo da implementação em commit próprio.
