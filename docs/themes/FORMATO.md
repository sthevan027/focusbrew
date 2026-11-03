# Formato do pacote de tema

Um tema é dados + CSS + fontes. Não roda JavaScript: o carregador valida o
manifesto e injeta a folha de estilo. Este documento descreve o formato usado
pelos temas embutidos (`src/themes/<id>/`) e serve de base para a loja futura.

## Estrutura

```
src/themes/<id>/
  theme.json              manifesto (obrigatório)
  theme.css               folha de estilo (obrigatória)
  assets/fonts/*.woff2    fontes (opcional)
  assets/fonts/OFL-*.txt  licença das fontes
```

Sons não são arquivos: o app sintetiza os conjuntos que conhece (campo `sounds`).

## theme.json

| campo     | obrigatório | regra |
|-----------|-------------|-------|
| `id`      | sim | 1 a 40 caracteres: minúsculas, números e hífen. Ex.: `halloween-abobora`. |
| `name`    | sim | texto de 1 a 60 caracteres (nome no seletor). |
| `version` | sim | `X.Y.Z`. |
| `author`  | sim | texto de 1 a 80 caracteres. |
| `accent`  | não | cor `#RRGGBB`. Quando existe, substitui a cor de destaque do usuário. |
| `fonts`   | não | lista de `{ "family": "Nunito", "file": "assets/fonts/X.woff2" }`. Formatos: `.woff2`, `.woff`, `.ttf`. |
| `css`     | sim | caminho relativo para o `.css` do pacote. |
| `sounds`  | não | `"none"` (padrão) ou um conjunto embutido (hoje: `"abobora"`). |
| `mascot`  | não | `"none"` (padrão) ou `"pumpkin"`: a abóbora vira o botão de iniciar/play, o relógio da caixa rodando, e espia na barra parada. |

Campos desconhecidos são ignorados (compatibilidade futura). Os erros de
validação são reportados todos de uma vez.

Limites: CSS até 200 KB; cada fonte até 300 KB; caminhos relativos, sem `..`,
sem barra invertida e sem caminho absoluto.

## theme.css

- Escopo obrigatório: toda regra começa em `[data-theme="<id>"]` (ou
  `.widget-root[data-theme="<id>"]`). Sem o atributo, nada casa.
- `data-theme` fica no `.widget-root` do widget e no `<html>` das janelas de
  Configurações e Nota.
- Cor de destaque: `var(--accent)` já vem do tema (quando `accent` existe) ou da
  escolha do usuário. Use a variável em vez de cor fixa no que deve seguir o destaque.
- Desenhos: SVG em data URI. Nada de imagens externas nem `@import` (o app roda
  offline e a CSP é restrita).
- Fontes: declaradas no manifesto, não no CSS. O carregador gera o `@font-face`
  com a URL que o build produziu; no CSS basta usar o nome da família.
- Movimento: animações de CSS respeitam `prefers-reduced-motion`. Animações em
  JavaScript (a sequência da abóbora) também consultam essa preferência.

## Como o app aplica

1. `validateManifest` confere o `theme.json`; `buildPackage` confere o CSS (vazio e tamanho).
2. `applyTheme` cria um único `<style id="focusbrew-theme-css">`. Trocar de tema troca
   o texto; voltar ao padrão remove o elemento.
3. A raiz recebe `data-theme`. Com o tema padrão não há atributo, `<style>` nem
   classe nova: a marcação é a de antes.

## Configuração do usuário

`config.theme` (padrão `"default"`) e `config.theme_sounds` (padrão `true`; só toca
quando o tema tem sons). Um id malformado vira `"default"` ao salvar.

## Testes

`src/lib/themeManifest.test.ts`, `src/lib/themeLoader.test.ts`,
`src/themes/themes.test.ts`, `src/lib/sound.test.ts`, `src/widget/pumpkinState.test.ts`
e `src/widget/defaultMarkup.test.tsx` (regressão de marcação do tema padrão).
