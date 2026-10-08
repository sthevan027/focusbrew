# focusbrew — Notas rápidas

**Data:** 2026-10-08 · **Branch:** `feat/widget-bordas-e-fluidez` (o mesmo PR)
**Base:** [spec do widget nas bordas](2026-10-08-widget-bordas-design.md) e a spec
da v0.3. Tudo que não é dito aqui continua valendo de lá.

## 1. Objetivo

**Dito pelo Sthevan:** um bloco de notas para **escrever e desenhar**, para quando
a pessoa pensa em algo ou quer explicar algo. Tem que ser **fácil e rápido de
acessar**, e as notas ficam **guardadas**, numa aba da configuração, no lugar do
Projetos (que sai). O rabisco ganha **formas** (quadrado, círculo, triângulo),
linha e seta, dá para **colar e arrastar imagens**, **copiar a nota como imagem**,
e abrir a nota de **duas formas**: sobre o painel do widget (padrão) ou numa
janela no meio do monitor, as duas na proporção 560×380.

**Sucesso:** apertar `Ctrl+Alt+N` em qualquer app, escrever e rabiscar uma ideia,
apertar `Esc`, e achá-la de novo no histórico (dentro da nota ou na aba Notas),
sem ter "salvo" nada.

**Fica de fora da v1:** busca além do filtro por texto, pastas e tags, mais espaço
na folha (zoom, rolagem), botão de escolher arquivo de imagem, texto formatado,
anexar nota a uma tarefa.

## 2. Acesso

- **Atalho global** novo `shortcut_note`, padrão `CommandOrControl+Alt+N`
  (3 teclas; `Ctrl+Shift+N` ficou de fora porque roubaria o "nova pasta" do
  Explorer e a "janela anônima" do navegador). Configurável em Geral, junto dos
  outros dois. Fechada, abre numa **nota nova**. Já aberta, **só foca** a nota
  (traz para frente) e a borda dela **pisca ~0,4 s**; não cria nota nova.
- Botão **"Nota"** no cabeçalho do painel do widget.
- Aba **Notas** na configuração (seção 7).
- Dentro da nota: **"+"** ou `Ctrl+N` cria outra; **☰** ou `Ctrl+H` abre o
  histórico; `Esc` fecha (já está salva).

## 3. Onde abre

A folha é sempre **560×380** (unidades da folha), nas duas formas:

1. **Sobre o painel** (padrão, `note_placement = "overlay"`): é uma forma nova
   do widget, `note`, 560×380, pendurada na borda da tela como o painel (no topo
   centralizada na largura; nas laterais, centralizada na altura). Cobre o painel.
2. **Em janela** (`note_placement = "window"`): janela Tauri própria, label
   `note`, 560×380, não redimensionável, centralizada no monitor onde está o
   mouse, com a barra nativa do Windows.

A escolha fica na aba Notas ("Abrir a nota: Sobre o painel / Em janela") e num
botão dentro da nota que troca na hora (a nota atual passa de um modo para o
outro sem perder nada). Com o widget escondido (`widget_visible` desligado), abre
em janela.

**Sobre o painel, o comportamento** (como o painel fixado, com diferenças):
- Não fecha ao clicar fora nem ao perder o foco; fecha com `Esc` ou ✕.
- Se o painel estava aberto, a nota o cobre e, ao fechar, **volta ao painel**;
  se não, volta ao estado que o widget tinha (barra ou caixa).
- O auto-close do painel fixado não conta enquanto a nota está aberta.
- **A janela do widget passa de 560×300 para 560×380** (`OPEN_SIZE`): continua
  transparente e com o mouse atravessando; o painel segue com 300 de altura (a
  forma anima o próprio tamanho). Os testes de geometria do pacote A são
  atualizados para a nova altura.

## 4. A folha

Três camadas, de baixo para cima: **imagens**, **texto**, **desenho** (traços e
formas). Dois modos:

- **Aa (texto):** texto puro, uma fonte, sem formatação. `Ctrl+Z` é o desfazer do
  próprio campo.
- **✎ (desenho):** ferramentas **caneta** (6 cores, 3 espessuras), **formas**
  (quadrado, círculo, triângulo, linha, seta; arrasta da quina até a quina
  oposta; **Shift** deixa quadrado e círculo proporcionais e trava a linha e a
  seta em ângulos de 45°), **borracha** (apaga o traço ou a forma tocada) e
  **seleção** (clicar seleciona; arrastar move; as alças dos cantos
  redimensionam; `Delete` apaga; vale para formas e imagens). Formas são só
  contorno; um botão **"preencher"** liga o preenchimento da cor com ~25% de
  opacidade.
- `Ctrl+Z` / `Ctrl+Shift+Z` no modo desenho desfazem e refazem a última ação do
  desenho (traço, forma, imagem, mover, redimensionar, apagar, limpar). Cada modo
  tem a sua pilha.
- **Copiar como imagem:** botão que desenha a folha inteira (imagens, texto e
  desenho, fundo escuro igual ao da folha) num PNG e o põe no clipboard.

## 5. Imagens

- Entram por **`Ctrl+V`** (por exemplo um print) ou **arrastando um arquivo**
  (PNG, JPG, WebP, GIF) para a nota. Chegam ao centro da folha (ou onde foram
  soltas), já selecionadas, para mover e redimensionar.
- Ao entrar, a imagem é reduzida para no máximo **1600 px** no lado maior,
  regravada como PNG ou JPEG e guardada como **arquivo** em
  `<data>/notes/images/<hash>.<ext>` (o hash dedupe a mesma imagem). O JSON só
  guarda o nome do arquivo, a posição e o tamanho.
- Máximo de **10 imagens por nota**. Ao apagar uma nota (ou a imagem de uma
  nota), os arquivos que nenhuma nota usa mais são apagados.

## 6. Histórico e organização

- **Histórico dentro da nota:** a lista lateral (☰ / `Ctrl+H`) desliza por cima da
  folha, mais recentes primeiro, cada item com miniatura e a primeira linha, e um
  campo para **filtrar por texto**. Clicar abre a nota na hora; o "+" cria nova.
- **Título** = primeira linha não vazia do texto. Nota só com desenho/imagem
  aparece como "Desenho" + a data.
- **Apagar:** o botão de apagar do item ou cartão vira uma **confirmação sutil**
  no próprio lugar ("Apagar? Sim / Não"), sem janela nem "desfazer".

## 7. Aba "Notas" na configuração (no lugar do Projetos)

Grade de cartões (miniatura do desenho e das imagens, primeiras linhas do texto,
data), mais recentes primeiro; clicar abre a nota na forma escolhida; apagar com
a confirmação sutil; botão "Nova nota"; e a opção "Abrir a nota: Sobre o painel /
Em janela". Ícone novo no mesmo estilo dos outros (traço 2, 24 de grade, só
`currentColor`), em roxo `#bf5af2` (a cor que o Projetos usava).

## 8. Dados

**`<data>/notes.json`:** `{ "version": 1, "notes": [ ... ] }`. Cada nota:
`id`, `created_ms`, `updated_ms`, `text` e `objects` (lista ordenada):

| `type` | campos |
|---|---|
| `stroke` | `color` ("#RRGGBB"), `width`, `points` (`[[x,y],...]`) |
| `shape` | `kind` (`rect`/`ellipse`/`triangle`/`line`/`arrow`), `color`, `width`, `fill`, `x1`,`y1`,`x2`,`y2` |
| `image` | `file`, `x`, `y`, `w`, `h` |

Coordenadas em unidades da folha (560×380), com 1 casa decimal.

- **Gravação atômica** (temporário + renomear). Arquivo corrompido: é renomeado
  para `notes.corrupt-<hora>.json` e o app começa vazio; nunca apaga em silêncio.
- **Autosave** ~0,4 s depois da última mudança e ao fechar. **Nota vazia** (sem
  texto, objetos nem imagens) não é guardada.
- **Limites:** texto 20 000 caracteres; 3 000 objetos por nota; 2 000 pontos por
  traço (pontos a menos de ~1,5 unidade do anterior são descartados enquanto se
  desenha); 10 imagens por nota; 1 000 notas. No limite, avisa e não deixa passar.

**Config nova** (`config.rs`): `shortcut_note` (texto) e `note_placement`
(`"overlay"` padrão ou `"window"`); arquivo antigo, sem os campos, carrega com os
padrões.

**Comandos (Rust):** `list_notes`, `save_note`, `delete_note`,
`save_note_image` (recebe bytes e extensão, devolve o nome do arquivo e o
tamanho), `read_note_image` (devolve a imagem para exibir), `open_note(id?)`.
**Eventos:** `notes-changed` (a lista mudou), `open-note` (qual nota o editor
mostra) e `note-flash` (piscar).

## 9. Impacto no que já existe

- **Atalhos** (`shortcuts.rs`): hoje fixo em 2 (arrays de 2 posições, conflito
  "contra o outro"). Passa a 3 ações (`Toggle`, `Panel`, `Note`), com o conflito
  checado contra as outras duas.
- **Capacidades** (`capabilities/default.json`): a janela `note` entra na lista.
- **`pickShape`** ganha o degrau `note` (escondido > nota > painel > caixa > barra).
- **Projetos sai:** a aba, o `ProjectsSection`, o comando `project_totals` e o
  que só ele usava já foram removidos (commit `ab86770`); o `#projeto` e o resumo
  do dia continuam.
- **Roteamento** (`main.tsx`): janela `widget` → Widget; `note` → editor; resto →
  configuração. O editor é um componente único usado no overlay e na janela.
- **Arrastar arquivo:** na janela Tauri o arquivo chega pelo evento de
  drag-and-drop do Tauri (caminho do arquivo), lido pelo Rust; **colar** usa o
  evento `paste` da própria página.

## 10. Testes e entrega

- **Rust** (`notes.rs`): gravar e ler; ordenar por mais recente; vazia não grava;
  limites; corrupção vira `.corrupt`; imagens órfãs apagadas; config nova
  (`shortcut_note`, `note_placement`) com padrões e arquivo antigo; geometria
  atualizada para 560×380; atalhos com 3 ações e conflitos.
- **Vitest:** simplificar pontos, achar o objeto sob a borracha e sob o clique,
  mover e redimensionar, travar ângulos com Shift, título pela primeira linha,
  filtro, miniatura em SVG, `pickShape` com `note`, ícone novo no teste de família.
- **Teste de usuário por subagente** no fim (escrever, desenhar, formas, colar e
  arrastar imagem, histórico, apagar, as duas formas de abrir, atalho com a nota
  já aberta).
- **Entrega:** commits por tarefa na branch do PR (sem push, sem PR; o Sthevan
  abre depois).
