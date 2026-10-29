# Design system do focusbrew

Início do design system (28/10/2026). Parte da auditoria do CSS atual; nada em `src/` foi alterado. Os tokens propostos estão em [`tokens.css`](./tokens.css) e ainda não são importados pelo app.

## 1. O que o app é visualmente

Um app Tauri com **três superfícies**, todas escuras e sem tema claro:

| Superfície | Arquivo | Papel |
|---|---|---|
| Widget e Painel (notch colado à borda) | `src/Widget.css` (1436 linhas) | uso diário: timer, tarefas, resumo, GitHub, música |
| Configurações | `src/App.css` (454 linhas) | cartões, switches, selects, atalhos |
| Nota rápida | `src/note/note.css` (135 linhas) | janela de notas e histórico |

A linguagem visual é a **do modo escuro da Apple**: os cinzas lembram o `systemGray` do iOS, as cores de estado são as do sistema (`#0a84ff`, `#30d158`, `#ff9f0a`, `#ff453a`) e os 6 presets de accent em `src/settings/colors.ts` são a mesma família. Isso é uma boa base: o sistema consolida o que já existe e não inventa uma identidade nova.

## 2. Diagnóstico

- **Cores e espaçamentos soltos.** Quase nada é variável. `--accent` é a única cor tokenizada (definida em `App.css`, `Widget.css` e injetada pelo React). As 31 variáveis de `Widget.css` são de geometria e movimento (`--s`, `--ear`, `--rad`, `--k-*`, `--ease`, `--spring`) e de `--shell-bg` e `--row-bg`.
- **Muitos cinzas quase iguais.** Cerca de 20 hex entre `#0b0b0d` e `#3a3a3e`. O mesmo hex serve de fundo, de borda e de divisor (o `#2e2e32` é fundo em 5 lugares e borda em 1).
- **Duas escadas de superfície.** Configurações usa `#1c1c1e`/`#161618`/`#232326`; o painel usa `#0b0b0d`/`#1a1a1d`/`#26262a`. Na prática são o mesmo degrau com valores diferentes.
- **Tipografia: 11 tamanhos** (9 a 21px). A maioria (45 usos) está em 11, 12 e 13px.
- **Raio: 15 valores**, com 6px (19×) e 8px (15×) dominando.
- **Espaçamento (`gap`): 12 valores**, com 6px (12×), 8px (11×) e 4px (9×) dominando.
- **Botão tem 7 implementações** (`update-button`, `github-panel button`, `segmented button`, `note-btn`, `media-controls button`, `move`, `day-nav button`), com hovers diferentes (`#38383c`, `#34343a`, `rgba(255,255,255,.08)`).
- **Botão primário** aparece sob 3 nomes: `.update-button.available`, `.play`, `.nav-item.active`.

## 3. Fundações propostas

### Superfícies: 6 degraus de elevação

| Token | Valor | Onde |
|---|---|---|
| `--fb-bg-0` | `#0b0b0d` | shell do widget, campo de edição embutido |
| `--fb-bg-1` | `#141416` | sidebar, linha do resumo |
| `--fb-bg-2` | `#1a1a1d` | janela de configurações, trilho das abas, linha de tarefa |
| `--fb-bg-3` | `#232326` | cards, grupos, hover de item |
| `--fb-bg-4` | `#2e2e32` | controles, aba ativa, divisores |
| `--fb-bg-5` | `#3a3a3e` | switch desligado, borda e hover de controle |

### Texto: 4 níveis (já existiam)

`--fb-text #f2f2f3` · `--fb-text-2 #c9c9ce` · `--fb-text-muted #8a8a90` · `--fb-text-faint #5a5a60`

### Cor de ação e estado

`--fb-accent` (escolha do usuário, padrão `#0a84ff`) · `--fb-success #30d158` · `--fb-warning #ff9f0a` · `--fb-danger #ff453a` · `--fb-danger-text #ff6961`

### Tipografia, raio e espaçamento

- **Tipografia (6):** 11, 12, 13, 15, 18, 21px. Funde 9/10→11, 14→13, 16→15, 20→21.
- **Raio (5):** 4, 6, 8, 12 e `full`. Funde 1/2/3/3.5/5→4 e 9/10→8.
- **Espaçamento (6):** 2, 4, 6, 8, 12, 16. Funde 3→2, 5→4, 10→12, 14→16. O 6px fica porque é muito usado e dá o ritmo de uma interface densa.
- **Movimento:** `--fb-ease`, `--fb-ease-soft`, `--fb-spring` (já existiam, só ganham nome).

## 4. Inventário de componentes

**Configurações:** item de navegação (com glifo colorido), grupo e linha, switch, controle segmentado, swatch de accent, select, campo de texto/senha/minutos, gravador de atalho, botão (normal, primário, secundário destrutivo), card selecionável do notch, texto de dica, chip de código, linha do GitHub.

**Painel:** abas, navegação de dia, pin, linha de tarefa (parada, ativa, concluída, arrastando, editando), check, botão play, stepper de minutos, alça de arrastar, campo "adicionar tarefa", linha do resumo, grade de atividade, controles de mídia, linha de progresso.

**Nota:** barra de botões, botão de nota, item do histórico, confirmação de exclusão.

## 5. Decisões que são suas

1. **6px no espaçamento:** a proposta mantém (12 usos). Alternativa: ir só de 4/8/12/16 e ajustar os usos de 6px.
2. **Raio de 10px** (linha de tarefa e linha do GitHub): a proposta funde com 8px. Confira no visual se a mudança incomoda.
3. **`#ff6961` vs `#ff453a`:** são dois vermelhos. A proposta mantém os dois (um para texto, um para borda e ícone), mas pode virar um só se o contraste do texto ficar bom.
4. **Superfícies 1c1c1e → 1a1a1d:** a janela de configurações escurece quase nada. Vale checar nas capturas.
5. **Peso da fonte (`font-weight`):** ainda não auditei. Falta decidir os pesos.

## 6. Próximos passos

1. **Quadro:** as fundações e os componentes no Excalidraw ou Whimsical.
2. **Adoção gradual:** importar `tokens.css`, trocar os valores soltos por tokens, uma superfície por vez (nota → configurações → painel), conferindo as capturas de `docs/screenshots/` a cada passo.
3. **Componentes:** unificar os 7 botões em 4 variantes (primário, secundário, ghost, destrutivo) com estados padronizados.
4. **Cobertura:** adicionar um teste ou script que acuse hex fora dos tokens.

## Como foi levantado

`grep` nos três CSS, contando valores e checando a propriedade em que cada cinza aparece. O `Widget.css` tem trechos que não li por inteiro (mídia, atividade, resumo em detalhe); os números de uso são de busca por texto, não de execução do app.
