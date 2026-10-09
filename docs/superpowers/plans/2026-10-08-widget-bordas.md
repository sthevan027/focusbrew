# Widget nas bordas da tela — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o widget do focusbrew ser colado no topo (como hoje), na lateral esquerda ou na lateral direita da tela, com a barra parada em pé, a caixa horizontal saindo da borda, orelhinhas de notch e uma transição de mola ao crescer e rápida ao encolher.

**Architecture:** A janela do widget continua com tamanho fixo (560×300 × escala); só a posição dela muda, por uma nova opção `widget_edge` (`top`/`left`/`right`). A forma animada fica numa moldura (`.shell-frame`) ancorada pela borda via CSS (`data-edge`), a cascata `pickShape` decide a forma, a linha de progresso é um "U" aberto para o lado da borda e a direção da transição (`grow`/`shrink`) vem do posto da forma (barra < caixa < painel).

**Tech Stack:** Rust + Tauri v2 (testes com `cargo test`), React 19 + TypeScript + Vite (testes com vitest via `bun run test`), CSS puro.

**Spec:** `docs/superpowers/specs/2026-10-08-widget-bordas-design.md`

## Global Constraints

- A janela do widget **nunca muda de tamanho** durante o uso (`OPEN_SIZE` 560×300 lógicos); só a posição muda por borda.
- Tamanhos lógicos (escala Média): barra parada 140×6 (zona do mouse 140×14) no topo e **6×140 (zona 14×140) nas laterais**; caixa 320×44; painel 560×300.
- Valores de `widget_edge` na config e no JSON: `"top"` (padrão), `"left"`, `"right"` (serde `lowercase`).
- Arquivo de configuração sem `widget_edge` carrega como `top`; nada mais é resetado.
- Nas laterais a caixa e o painel crescem **para dentro da tela** e ficam **centralizados na altura** do monitor.
- A linha de progresso é um "U" aberto para o lado da tela: `top` percorre esquerda, base e direita; `left` percorre topo, direita e base; `right` percorre topo, esquerda e base.
- Orelhinhas de notch: raio 14 px, só na caixa e no painel (não na barra parada), feitas com `radial-gradient` em pseudo-elementos da moldura.
- Transição: `grow` ≈ 480 ms com curva de mola (`linear()`, estouro ≈ 2%); `shrink` ≈ 200 ms com cubic-bezier de saída rápida; `prefers-reduced-motion` desliga a mola.
- Só conceito da Ilha do Niko (licença proprietária): nunca copiar código dela.
- Gerenciador de pacotes: **Bun** (`bun run test`, `bun run build`). Não rodar `bun install` (o projeto tem `package-lock.json`; não trocar o lockfile).
- Commits na `main`, sem PR, mensagens em português no estilo `feat:`/`test:`/`docs:`. **Não dar push.** Não adicionar linha `Co-Authored-By`.

## Review Focus

1. Configuração de uma versão antiga, sem `widget_edge`, abre no topo e não reseta mais nada (Task 1).
2. Monitor secundário à esquerda do principal, com origem negativa, com o widget na borda direita ou esquerda (Task 2).
3. Escala do Windows em 150% e 200% nas laterais: posições sempre em pixel inteiro, sem meio pixel (Task 2).
4. A zona do mouse da barra parada precisa ficar **dentro** da janela em toda borda, escala e estado — se escapar, o mouse nunca alcança a barra (Task 2).
5. Trocar a borda com o app aberto precisa mover a janela de verdade, e a linha de progresso numa caixa minúscula não pode gerar `NaN` em nenhuma borda (Tasks 2 e 3).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src-tauri/src/config.rs` | `WidgetEdge` + campo `widget_edge` |
| `src-tauri/src/widget.rs` | `MonitorArea`, `physical_bounds` por borda, `hot_zone` por borda, `apply` com a borda |
| `src-tauri/src/lib.rs` | `sync_ui` passa a borda para `widget::apply` |
| `src/lib/types.ts` | `WidgetEdge` e `AppConfig.widget_edge` |
| `src/lib/progress.ts` | `uPath`/`uLength` por borda |
| `src/lib/shell.ts` | `pickShape`, postos e `motionBetween`, constantes de duração |
| `src/widget/ProgressLine.tsx` | repassa a borda ao `uPath`/`uLength` |
| `src/widget/hooks.ts` | `useMotion` |
| `src/Widget.tsx` | `data-edge`, moldura, `pickShape`, classe de movimento |
| `src/Widget.css` | ancoragem por borda, cantos, contorno, painel, orelhinhas, transições |
| `src/settings/NotchSection.tsx` | seletor "Posição" |
| `README.md` | frase sobre a posição |

---

### Task 1: `WidgetEdge` na configuração (Rust)

**Files:**
- Modify: `src-tauri/src/config.rs` (struct `AppConfig` ~linha 9-44, enums ~56-83, `Default` ~97-119, módulo `tests` ~182)

**Interfaces:**
- Produces: `pub enum WidgetEdge { Top, Left, Right }` (`Debug, Clone, Copy, Default=Top, PartialEq, Eq, Serialize, Deserialize`, serde `lowercase`) e `AppConfig.widget_edge: WidgetEdge`. Tasks 2 usa `config.widget_edge`.

- [ ] **Step 1: Escrever os testes que falham**

No módulo `tests` de `src-tauri/src/config.rs`, antes do `}` final, adicionar:

```rust
    #[test]
    fn the_widget_defaults_to_the_top_edge() {
        assert_eq!(AppConfig::default().widget_edge, WidgetEdge::Top);
    }

    // Review focus: a file written before this setting existed.
    #[test]
    fn a_file_without_widget_edge_opens_on_the_top_and_keeps_the_rest() {
        let c = parse(r##"{"accent_color":"#112233","daily_goal_mins":90}"##);
        assert_eq!(c.widget_edge, WidgetEdge::Top);
        assert_eq!(c.accent_color, "#112233");
        assert_eq!(c.daily_goal_mins, 90);
    }

    #[test]
    fn the_edge_is_written_in_lower_case_and_read_back() {
        for (edge, text) in
            [(WidgetEdge::Top, "top"), (WidgetEdge::Left, "left"), (WidgetEdge::Right, "right")]
        {
            let raw = format!(r#"{{"widget_edge":"{text}"}}"#);
            assert_eq!(parse(&raw).widget_edge, edge);
            let json = serde_json::to_string(&AppConfig { widget_edge: edge, ..AppConfig::default() }).unwrap();
            assert!(json.contains(&format!("\"widget_edge\":\"{text}\"")), "{json}");
        }
    }
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config::tests`
Expected: erro de compilação `cannot find type WidgetEdge in this scope`.

- [ ] **Step 3: Implementar**

Em `src-tauri/src/config.rs`:

1. Logo depois do enum `WidgetScale` (e do `impl WidgetScale`), adicionar:

```rust
/// Which screen edge the widget is glued to.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WidgetEdge {
    /// Top of the screen, centered (the original placement).
    #[default]
    Top,
    /// Left edge, centered in height.
    Left,
    /// Right edge, centered in height.
    Right,
}
```

2. Na struct `AppConfig`, logo depois de `pub widget_visible: bool,` adicionar:

```rust
    /// The screen edge the widget is glued to.
    pub widget_edge: WidgetEdge,
```

3. No `impl Default for AppConfig`, logo depois de `widget_visible: true,` adicionar:

```rust
            widget_edge: WidgetEdge::default(),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config::tests`
Expected: todos passam, incluindo os 3 novos.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat: opção widget_edge (topo, esquerda, direita) na configuração"
```

---

### Task 2: Geometria por borda (Rust)

**Files:**
- Modify: `src-tauri/src/widget.rs` (imports; constantes; `apply`; `physical_bounds`; `hot_zone`; módulo `layout_tests`)
- Modify: `src-tauri/src/lib.rs:87-98` (`sync_ui`)

**Interfaces:**
- Consumes: `crate::config::WidgetEdge`, `AppConfig.widget_edge` (Task 1).
- Produces:
  - `pub struct MonitorArea { pub x: i32, pub y: i32, pub width: u32, pub height: u32, pub scale: f64 }`
  - `pub fn physical_bounds(area: MonitorArea, layout: &Layout, edge: WidgetEdge) -> Bounds`
  - `pub fn hot_zone(config: &AppConfig, status: TimerStatus) -> Layout` (a barra parada sai 14×140 nas laterais)
  - `pub fn apply(app, window_layout, zone, monitor_name, edge: WidgetEdge)`

- [ ] **Step 1: Reescrever os testes (falham por não compilar)**

Em `src-tauri/src/widget.rs`, substituir **todo** o módulo `layout_tests` (do `#[cfg(test)]` até o fim do arquivo) por:

```rust
#[cfg(test)]
mod layout_tests {
    use super::*;
    use crate::config::{AppConfig, WidgetEdge, WidgetScale};

    const EDGES: [WidgetEdge; 3] = [WidgetEdge::Top, WidgetEdge::Left, WidgetEdge::Right];

    fn cfg(scale: WidgetScale) -> AppConfig {
        AppConfig { widget_scale: scale, ..AppConfig::default() }
    }

    fn cfg_edge(edge: WidgetEdge) -> AppConfig {
        AppConfig { widget_edge: edge, ..AppConfig::default() }
    }

    fn size(l: Layout) -> (f64, f64) {
        (l.width, l.height)
    }

    fn area(x: i32, y: i32, width: u32, height: u32, scale: f64) -> MonitorArea {
        MonitorArea { x, y, width, height, scale }
    }

    fn inside(outer: Bounds, inner: Bounds) -> bool {
        inner.0 >= outer.0
            && inner.1 >= outer.1
            && inner.0 + inner.2 <= outer.0 + outer.2
            && inner.1 + inner.3 <= outer.1 + outer.3
    }

    #[test]
    fn the_window_is_always_the_panel_size() {
        assert_eq!(size(window_layout(&cfg(WidgetScale::Medium))), (560.0, 300.0));
        assert_eq!(size(window_layout(&cfg(WidgetScale::Small))), (476.0, 255.0));
        assert_eq!(size(window_layout(&cfg(WidgetScale::Large))), (700.0, 375.0));
    }

    #[test]
    fn the_mouse_zone_follows_the_state() {
        let c = cfg(WidgetScale::Medium);
        assert_eq!(size(hot_zone(&c, TimerStatus::Idle)), (140.0, 14.0));
        assert_eq!(size(hot_zone(&c, TimerStatus::Running)), (320.0, 44.0));
        assert_eq!(size(hot_zone(&c, TimerStatus::Paused)), (320.0, 44.0));
    }

    #[test]
    fn the_mouse_zone_follows_the_scale() {
        assert_eq!(size(hot_zone(&cfg(WidgetScale::Small), TimerStatus::Idle)), (119.0, 12.0));
        assert_eq!(size(hot_zone(&cfg(WidgetScale::Small), TimerStatus::Running)), (272.0, 37.0));
        assert_eq!(size(hot_zone(&cfg(WidgetScale::Large), TimerStatus::Running)), (400.0, 55.0));
    }

    #[test]
    fn the_parked_bar_stands_up_on_the_sides() {
        for edge in [WidgetEdge::Left, WidgetEdge::Right] {
            let c = cfg_edge(edge);
            assert_eq!(size(hot_zone(&c, TimerStatus::Idle)), (14.0, 140.0), "{edge:?}");
            assert_eq!(size(hot_zone(&c, TimerStatus::Running)), (320.0, 44.0), "{edge:?}");
            assert_eq!(size(hot_zone(&c, TimerStatus::Paused)), (320.0, 44.0), "{edge:?}");
        }
        assert_eq!(size(hot_zone(&cfg_edge(WidgetEdge::Top), TimerStatus::Idle)), (140.0, 14.0));
        let small = AppConfig { widget_edge: WidgetEdge::Left, widget_scale: WidgetScale::Small, ..AppConfig::default() };
        assert_eq!(size(hot_zone(&small, TimerStatus::Idle)), (12.0, 119.0));
    }

    #[test]
    fn visibility_follows_the_setting() {
        let hidden = AppConfig { widget_visible: false, ..AppConfig::default() };
        assert!(!window_layout(&hidden).visible);
        assert!(window_layout(&AppConfig::default()).visible);
    }

    #[test]
    fn the_zone_and_the_window_share_the_same_top_center() {
        let c = cfg(WidgetScale::Medium);
        let a = area(0, 0, 1920, 1080, 1.0);
        let window = physical_bounds(a, &window_layout(&c), WidgetEdge::Top);
        let zone = physical_bounds(a, &hot_zone(&c, TimerStatus::Running), WidgetEdge::Top);
        assert_eq!(window, (680, 0, 560, 300));
        assert_eq!(zone, (800, 0, 320, 44));
    }

    #[test]
    fn the_left_edge_is_glued_to_the_screen_and_centered_in_height() {
        let c = cfg_edge(WidgetEdge::Left);
        let a = area(0, 0, 1920, 1080, 1.0);
        assert_eq!(physical_bounds(a, &window_layout(&c), WidgetEdge::Left), (0, 390, 560, 300));
        assert_eq!(physical_bounds(a, &hot_zone(&c, TimerStatus::Running), WidgetEdge::Left), (0, 518, 320, 44));
        assert_eq!(physical_bounds(a, &hot_zone(&c, TimerStatus::Idle), WidgetEdge::Left), (0, 470, 14, 140));
    }

    #[test]
    fn the_right_edge_is_glued_to_the_screen_and_centered_in_height() {
        let c = cfg_edge(WidgetEdge::Right);
        let a = area(0, 0, 1920, 1080, 1.0);
        assert_eq!(physical_bounds(a, &window_layout(&c), WidgetEdge::Right), (1360, 390, 560, 300));
        assert_eq!(physical_bounds(a, &hot_zone(&c, TimerStatus::Running), WidgetEdge::Right), (1600, 518, 320, 44));
        assert_eq!(physical_bounds(a, &hot_zone(&c, TimerStatus::Idle), WidgetEdge::Right), (1906, 470, 14, 140));
    }

    #[test]
    fn contains_is_inclusive_left_top_exclusive_right_bottom() {
        let zone = (800, 0, 320, 44);
        assert!(contains(zone, 800, 0));
        assert!(contains(zone, 1119, 43));
        assert!(!contains(zone, 1120, 10));
        assert!(!contains(zone, 900, 44));
        assert!(!contains(zone, 799, 10));
    }

    #[test]
    fn the_window_is_centered_on_top_of_the_monitor() {
        let run = Layout { width: 320.0, height: 44.0, visible: true };
        assert_eq!(physical_bounds(area(0, 0, 1920, 1080, 1.0), &run, WidgetEdge::Top), (800, 0, 320, 44));
        // odd leftover pixel: never a half pixel
        assert_eq!(physical_bounds(area(0, 0, 1367, 1080, 1.0), &run, WidgetEdge::Top), (523, 0, 320, 44));
        assert_eq!(physical_bounds(area(0, 0, 1920, 1081, 1.0), &run, WidgetEdge::Left), (0, 518, 320, 44));
    }

    // Review focus: a second monitor to the left of the main one has a
    // negative origin; the widget must follow the monitor, not (0, 0).
    #[test]
    fn a_monitor_with_a_negative_origin_keeps_the_widget_on_it() {
        let open = Layout { width: 470.0, height: 230.0, visible: true };
        let a = area(-1920, 0, 1920, 1080, 1.0);
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Top), (-1195, 0, 470, 230));
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Left), (-1920, 425, 470, 230));
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Right), (-470, 425, 470, 230));
        let b = area(-2880, 120, 2880, 1620, 1.5);
        assert_eq!(physical_bounds(b, &open, WidgetEdge::Top), (-1793, 120, 705, 345));
        assert_eq!(physical_bounds(b, &open, WidgetEdge::Left), (-2880, 757, 705, 345));
        assert_eq!(physical_bounds(b, &open, WidgetEdge::Right), (-705, 757, 705, 345));
    }

    // Review focus: at 150 % sizes and position are all in physical px.
    #[test]
    fn a_scaled_monitor_gets_physical_sizes_on_every_edge() {
        let open = Layout { width: 470.0, height: 230.0, visible: true };
        let a = area(0, 0, 2880, 1620, 1.5);
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Top), (1087, 0, 705, 345));
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Left), (0, 637, 705, 345));
        assert_eq!(physical_bounds(a, &open, WidgetEdge::Right), (2175, 637, 705, 345));
    }

    #[test]
    fn a_zero_or_negative_scale_factor_is_treated_as_one() {
        let run = Layout { width: 320.0, height: 44.0, visible: true };
        assert_eq!(physical_bounds(area(0, 0, 1000, 1000, 0.0), &run, WidgetEdge::Top), (340, 0, 320, 44));
        assert_eq!(physical_bounds(area(0, 0, 1000, 1000, -2.0), &run, WidgetEdge::Top), (340, 0, 320, 44));
        assert_eq!(physical_bounds(area(0, 0, 1000, 1000, 0.0), &run, WidgetEdge::Left), (0, 478, 320, 44));
    }

    // Review focus: changing the edge while the app runs must move the window
    // (`apply` skips a repeat of the same bounds).
    #[test]
    fn each_edge_places_the_window_somewhere_different() {
        let a = area(0, 0, 1920, 1080, 1.0);
        let l = window_layout(&AppConfig::default());
        let spots: Vec<Bounds> = EDGES.iter().map(|e| physical_bounds(a, &l, *e)).collect();
        assert_ne!(spots[0], spots[1]);
        assert_ne!(spots[0], spots[2]);
        assert_ne!(spots[1], spots[2]);
    }

    // Review focus: a zone that sticks out of the window can never be hovered.
    #[test]
    fn the_mouse_zone_is_always_inside_the_window() {
        let a = area(0, 0, 1920, 1080, 1.0);
        for edge in EDGES {
            for scale in [WidgetScale::Small, WidgetScale::Medium, WidgetScale::Large] {
                for status in [TimerStatus::Idle, TimerStatus::Running, TimerStatus::Paused] {
                    let c = AppConfig { widget_edge: edge, widget_scale: scale, ..AppConfig::default() };
                    let window = physical_bounds(a, &window_layout(&c), edge);
                    let zone = physical_bounds(a, &hot_zone(&c, status), edge);
                    assert!(inside(window, zone), "{edge:?} {scale:?}: zone {zone:?} outside window {window:?}");
                }
            }
        }
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml widget::layout_tests`
Expected: erro de compilação (`MonitorArea` não existe / `physical_bounds` com argumentos errados).

- [ ] **Step 3: Implementar em `widget.rs`**

1. Trocar `use crate::config::AppConfig;` por:

```rust
use crate::config::{AppConfig, WidgetEdge};
```

2. Depois de `const FALLBACK_MONITOR_WIDTH: u32 = 1280;` adicionar:

```rust
const FALLBACK_MONITOR_HEIGHT: u32 = 720;
```

3. Substituir a função `physical_bounds` (e o comentário dela) por:

```rust
/// A monitor in physical px.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MonitorArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

/// Where a layout goes on a monitor, in physical px: glued to `edge` —
/// centered on the top edge, or centered in height on the left/right edge.
pub fn physical_bounds(area: MonitorArea, layout: &Layout, edge: WidgetEdge) -> Bounds {
    let s = if area.scale > 0.0 { area.scale } else { 1.0 };
    let w = (layout.width * s).round() as i32;
    let h = (layout.height * s).round() as i32;
    let centered_x = area.x + (area.width as i32 - w).div_euclid(2);
    let centered_y = area.y + (area.height as i32 - h).div_euclid(2);
    match edge {
        WidgetEdge::Top => (centered_x, area.y, w, h),
        WidgetEdge::Left => (area.x, centered_y, w, h),
        WidgetEdge::Right => (area.x + area.width as i32 - w, centered_y, w, h),
    }
}
```

4. Substituir a função `hot_zone` por:

```rust
/// The area that catches the mouse while the panel is closed. On the side
/// edges the parked bar stands up (14 wide, 140 tall).
pub fn hot_zone(config: &AppConfig, status: TimerStatus) -> Layout {
    let (w, h) = if status == TimerStatus::Idle { IDLE_ZONE } else { RUNNING_ZONE };
    let size = match (status, config.widget_edge) {
        (TimerStatus::Idle, WidgetEdge::Left | WidgetEdge::Right) => (h, w),
        _ => (w, h),
    };
    scaled(config, size)
}
```

5. Na assinatura de `apply`, adicionar o parâmetro e trocar o bloco `let place = ...` por:

```rust
pub fn apply(
    app: &AppHandle,
    window_layout: Layout,
    zone: Layout,
    monitor_name: Option<&str>,
    edge: WidgetEdge,
) {
```

e, no corpo, substituir

```rust
    let place = |layout: &Layout| match &monitor {
        Some(monitor) => {
            let pos = monitor.position();
            physical_bounds(pos.x, pos.y, monitor.size().width, monitor.scale_factor(), layout)
        }
        None => physical_bounds(0, 0, FALLBACK_MONITOR_WIDTH, 1.0, layout),
    };
```

por

```rust
    let place = |layout: &Layout| {
        let area = match &monitor {
            Some(monitor) => {
                let pos = monitor.position();
                let size = monitor.size();
                MonitorArea {
                    x: pos.x,
                    y: pos.y,
                    width: size.width,
                    height: size.height,
                    scale: monitor.scale_factor(),
                }
            }
            None => MonitorArea {
                x: 0,
                y: 0,
                width: FALLBACK_MONITOR_WIDTH,
                height: FALLBACK_MONITOR_HEIGHT,
                scale: 1.0,
            },
        };
        physical_bounds(area, layout, edge)
    };
```

Também atualizar o comentário de `apply` para: `/// Pins the window to the chosen screen edge of the chosen monitor and records the mouse area for \`zone\`...`.

- [ ] **Step 4: Ligar em `lib.rs`**

Em `src-tauri/src/lib.rs`, dentro de `sync_ui`, depois de `let monitor = state.config.monitor.clone();` adicionar `let edge = state.config.widget_edge;` e trocar a chamada por:

```rust
        widget::apply(&handle, window_layout, zone, monitor.as_deref(), edge);
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: todos os testes do crate passam (incluindo `widget::layout_tests` e `config::tests`).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/widget.rs src-tauri/src/lib.rs
git commit -m "feat: janela e zona do mouse do widget por borda (topo, esquerda, direita)"
```

---

### Task 3: Linha de progresso por borda (TypeScript)

**Files:**
- Modify: `src/lib/types.ts` (tipo e campo)
- Modify: `src/lib/progress.ts` (`UShape`, `safeRadius`, `uPath`, `uLength`)
- Modify: `src/lib/progress.test.ts`
- Modify: `src/widget/ProgressLine.tsx`

**Interfaces:**
- Produces: `export type WidgetEdge = "top" | "left" | "right"` e `AppConfig.widget_edge: WidgetEdge` em `src/lib/types.ts`; `uPath(shape: UShape, edge?: WidgetEdge): string` e `uLength(shape: UShape, edge?: WidgetEdge): number` (borda padrão `"top"`); `ProgressLine` ganha a prop `edge: WidgetEdge`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/progress.test.ts`, dentro do `describe("the U-shaped progress line", ...)`, antes do `});` final, adicionar:

```ts
  it("opens to the left on the left edge: along the top, down the right side, back along the bottom", () => {
    expect(uPath(shape, "left")).toBe(
      "M 0 1 L 305 1 A 14 14 0 0 1 319 15 L 319 29 A 14 14 0 0 1 305 43 L 0 43",
    );
  });

  it("opens to the right on the right edge: along the top, down the left side, back along the bottom", () => {
    expect(uPath(shape, "right")).toBe(
      "M 320 1 L 15 1 A 14 14 0 0 0 1 15 L 1 29 A 14 14 0 0 0 15 43 L 320 43",
    );
  });

  it("measures the side edges: two long arms, the short base and two quarter circles", () => {
    expect(uLength(shape, "left")).toBeCloseTo(2 * 305 + 14 + Math.PI * 14, 5);
    expect(uLength(shape, "right")).toBeCloseTo(2 * 305 + 14 + Math.PI * 14, 5);
  });

  it("keeps the top edge exactly as before when no edge is given", () => {
    expect(uPath(shape)).toBe(uPath(shape, "top"));
    expect(uLength(shape)).toBe(uLength(shape, "top"));
  });

  // Review focus: a tiny box on any edge must never produce NaN.
  it("never breaks on a tiny box, whatever the edge", () => {
    const tiny = { width: 20, height: 10, radius: 14, inset: 1 };
    for (const edge of ["top", "left", "right"] as const) {
      expect(uPath(tiny, edge)).not.toContain("NaN");
      const length = uLength(tiny, edge);
      expect(Number.isFinite(length)).toBe(true);
      expect(length).toBeGreaterThanOrEqual(0);
    }
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test -- src/lib/progress.test.ts`
Expected: FAIL (o `uPath` ignora a borda; falham os testes `left`/`right`/`length`).

- [ ] **Step 3: Implementar**

Em `src/lib/types.ts`, na primeira linha antes de `export type NotchStyle`, adicionar `export type WidgetEdge = "top" | "left" | "right";` e, no `AppConfig`, depois de `widget_visible: boolean;`, adicionar:

```ts
  /** The screen edge the widget is glued to. */
  widget_edge: WidgetEdge;
```

Em `src/lib/progress.ts`:

1. Trocar a primeira linha por `import type { TimerView, WidgetEdge } from "./types";`.
2. Substituir tudo a partir do comentário `/** The "U" the progress line follows ...` até o fim do arquivo por:

```ts
/**
 * The "U" the progress line follows: it hugs three sides of the box and leaves
 * open the side that touches the screen edge.
 */
export interface UShape {
  width: number;
  height: number;
  radius: number;
  /** Half the stroke width, so the line stays inside the box. */
  inset: number;
}

/** How deep the U is (open end to base) and how wide it spans, per edge. */
function dims(shape: UShape, edge: WidgetEdge): { depth: number; span: number } {
  return edge === "top"
    ? { depth: shape.height, span: shape.width }
    : { depth: shape.width, span: shape.height };
}

/** A radius that fits the box, so a tiny box never produces a broken path. */
function safeRadius(shape: UShape, edge: WidgetEdge): number {
  const { depth, span } = dims(shape, edge);
  return Math.max(0, Math.min(shape.radius, depth - shape.inset, (span - 2 * shape.inset) / 2));
}

/**
 * `top`: down the left, along the bottom, up the right. `left`: along the top,
 * down the right, back along the bottom. `right`: the same, mirrored. The fill
 * always starts at the top tip.
 */
export function uPath(shape: UShape, edge: WidgetEdge = "top"): string {
  const { width, height, inset } = shape;
  const r = safeRadius(shape, edge);
  const x0 = inset;
  const x1 = width - inset;
  const y0 = inset;
  const y1 = height - inset;
  if (edge === "left") {
    return `M 0 ${y0} L ${x1 - r} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y0 + r} L ${x1} ${y1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${y1} L 0 ${y1}`;
  }
  if (edge === "right") {
    return `M ${width} ${y0} L ${x0 + r} ${y0} A ${r} ${r} 0 0 0 ${x0} ${y0 + r} L ${x0} ${y1 - r} A ${r} ${r} 0 0 0 ${x0 + r} ${y1} L ${width} ${y1}`;
  }
  return `M ${x0} 0 L ${x0} ${y1 - r} A ${r} ${r} 0 0 0 ${x0 + r} ${y1} L ${x1 - r} ${y1} A ${r} ${r} 0 0 0 ${x1} ${y1 - r} L ${x1} 0`;
}

export function uLength(shape: UShape, edge: WidgetEdge = "top"): number {
  const { depth, span } = dims(shape, edge);
  const r = safeRadius(shape, edge);
  const side = depth - shape.inset - r;
  const base = span - 2 * shape.inset - 2 * r;
  return 2 * side + base + Math.PI * r;
}
```

Em `src/widget/ProgressLine.tsx`:

1. Importar o tipo: trocar `import type { TimerView } from "../lib/types";` por `import type { TimerView, WidgetEdge } from "../lib/types";`.
2. Na interface `Props`, depois de `visible: boolean;`, adicionar:

```ts
  /** The screen edge the widget touches; the line leaves that side open. */
  edge: WidgetEdge;
```

3. Na assinatura: `export default function ProgressLine({ timer, now, rgb, visible, edge }: Props) {`.
4. Trocar `const length = ready ? uLength(shape) : 0;` por `const length = ready ? uLength(shape, edge) : 0;` e `const path = ready ? uPath(shape) : "";` por `const path = ready ? uPath(shape, edge) : "";`.
5. Atualizar o comentário do componente: `A thin line that follows three sides of the box (never the one touching the screen edge) and fills as the block runs.`

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test -- src/lib/progress.test.ts`
Expected: PASS. (`bun run build` ainda vai falhar no `Widget.tsx` por faltar a prop `edge`; isso é resolvido na Task 5. Não rode o build agora.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/progress.ts src/lib/progress.test.ts src/widget/ProgressLine.tsx
git commit -m "feat: linha de progresso em U aberto para o lado da borda"
```

---

### Task 4: Cascata `pickShape` (TypeScript)

**Files:**
- Modify: `src/lib/shell.ts`
- Modify (rewrite): `src/lib/shell.test.ts`

**Interfaces:**
- Consumes: `WidgetEdge`, `TimerStatus` de `src/lib/types.ts`.
- Produces: `ShapeKind = "hidden" | "bar" | "box" | "panel"`; `ShapeContext { visible: boolean; status: TimerStatus; phase: PanelPhase; edge: WidgetEdge }`; `Shape { kind: ShapeKind; shell: Size; hit: Size }`; `pickShape(ctx: ShapeContext): Shape`. **Remove** `shellSize` e `hitSize`. `nextTickDelay` e `PanelPhase`/`Size` permanecem.

- [ ] **Step 1: Reescrever o teste (falha)**

Substituir **todo** `src/lib/shell.test.ts` por:

```ts
import { describe, expect, it } from "vitest";
import { nextTickDelay, pickShape } from "./shell";
import type { PanelPhase, ShapeContext } from "./shell";
import type { TimerStatus, WidgetEdge } from "./types";

const ctx = (over: Partial<ShapeContext> = {}): ShapeContext => ({
  visible: true,
  status: "idle",
  phase: "closed",
  edge: "top",
  ...over,
});

const EDGES: WidgetEdge[] = ["top", "left", "right"];
const STATUSES: TimerStatus[] = ["idle", "running", "paused"];

// Must match IDLE_ZONE / RUNNING_ZONE / OPEN_SIZE in src-tauri/src/widget.rs.
describe("pickShape", () => {
  it("is nothing when the widget is hidden, whatever else is going on", () => {
    for (const edge of EDGES) {
      const shape = pickShape(ctx({ visible: false, status: "running", phase: "open", edge }));
      expect(shape).toEqual({
        kind: "hidden",
        shell: { width: 0, height: 0 },
        hit: { width: 0, height: 0 },
      });
    }
  });

  it("is the panel when open, whatever the timer or the edge do", () => {
    for (const edge of EDGES) {
      for (const status of STATUSES) {
        const shape = pickShape(ctx({ phase: "open", status, edge }));
        expect(shape.kind).toBe("panel");
        expect(shape.shell).toEqual({ width: 560, height: 300 });
        expect(shape.hit).toEqual({ width: 560, height: 300 });
      }
    }
  });

  it("is the box while a block runs or is paused", () => {
    for (const edge of EDGES) {
      for (const status of ["running", "paused"] as const) {
        const shape = pickShape(ctx({ status, edge }));
        expect(shape.kind).toBe("box");
        expect(shape.shell).toEqual({ width: 320, height: 44 });
        expect(shape.hit).toEqual({ width: 320, height: 44 });
      }
    }
  });

  it("is the flat bar over its mouse strip when parked on the top", () => {
    const shape = pickShape(ctx());
    expect(shape.kind).toBe("bar");
    expect(shape.shell).toEqual({ width: 140, height: 6 });
    expect(shape.hit).toEqual({ width: 140, height: 14 });
  });

  it("stands the parked bar up on the side edges", () => {
    for (const edge of ["left", "right"] as const) {
      const shape = pickShape(ctx({ edge }));
      expect(shape.kind).toBe("bar");
      expect(shape.shell).toEqual({ width: 6, height: 140 });
      expect(shape.hit).toEqual({ width: 14, height: 140 });
    }
  });

  it("already shrinks back while closing, before the window does", () => {
    const closing: PanelPhase = "closing";
    expect(pickShape(ctx({ status: "running", phase: closing })).kind).toBe("box");
    expect(pickShape(ctx({ status: "paused", phase: closing })).shell).toEqual({ width: 320, height: 44 });
    expect(pickShape(ctx({ phase: closing })).kind).toBe("bar");
    expect(pickShape(ctx({ phase: closing })).shell).toEqual({ width: 140, height: 6 });
  });
});

describe("nextTickDelay", () => {
  // The countdown shows ceil((deadline - now) / 1000): it changes exactly when
  // now lines up with the deadline's millisecond phase.
  it("waits until the next whole second before the deadline", () => {
    expect(nextTickDelay(10_000, 50_000)).toBe(1000);
    expect(nextTickDelay(10_250, 50_000)).toBe(750);
    expect(nextTickDelay(10_999, 50_000)).toBe(1);
  });

  it("follows a deadline that is not on a whole second", () => {
    expect(nextTickDelay(10_000, 50_400)).toBe(400);
    expect(nextTickDelay(10_500, 50_400)).toBe(900);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test -- src/lib/shell.test.ts`
Expected: FAIL (`pickShape` não é exportado).

- [ ] **Step 3: Implementar em `src/lib/shell.ts`**

Substituir o arquivo inteiro por:

```ts
import type { TimerStatus, WidgetEdge } from "./types";

/** "closing": the shape is already shrinking but the window is still big. */
export type PanelPhase = "closed" | "open" | "closing";

export interface Size {
  width: number;
  height: number;
}

/**
 * The visible shape, in Medium px. The window sizes in widget.rs must fit
 * these: the bar sits in a 14 px tall window that catches the mouse.
 */
export const BAR: Size = { width: 140, height: 6 };
export const BOX: Size = { width: 320, height: 44 };
export const PANEL: Size = { width: 560, height: 300 };

/** The strip over the bar that reacts to the mouse. */
export const BAR_ZONE: Size = { width: 140, height: 14 };

const NONE: Size = { width: 0, height: 0 };

/** The same rectangle on its side (the parked bar on the left/right edges). */
function turned(size: Size): Size {
  return { width: size.height, height: size.width };
}

export type ShapeKind = "hidden" | "bar" | "box" | "panel";

export interface ShapeContext {
  /** The "widget visible" setting. */
  visible: boolean;
  status: TimerStatus;
  phase: PanelPhase;
  edge: WidgetEdge;
}

export interface Shape {
  kind: ShapeKind;
  /** The visible shape. */
  shell: Size;
  /** The area that takes the mouse — the backend lets it through everywhere else. */
  hit: Size;
}

/**
 * What the widget shows right now, decided in one place by priority:
 * hidden > open panel > running/paused box > parked bar. While closing, the
 * shape is already the closed one (it shrinks before the window does).
 */
export function pickShape({ visible, status, phase, edge }: ShapeContext): Shape {
  if (!visible) return { kind: "hidden", shell: NONE, hit: NONE };
  if (phase === "open") return { kind: "panel", shell: PANEL, hit: PANEL };
  if (status !== "idle") return { kind: "box", shell: BOX, hit: BOX };
  if (edge === "top") return { kind: "bar", shell: BAR, hit: BAR_ZONE };
  return { kind: "bar", shell: turned(BAR), hit: turned(BAR_ZONE) };
}

/** Ms until the countdown (whole seconds left before `deadlineMs`) changes. */
export function nextTickDelay(nowMs: number, deadlineMs: number): number {
  const rest = (((deadlineMs - nowMs) % 1000) + 1000) % 1000;
  return rest === 0 ? 1000 : rest;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test -- src/lib/shell.test.ts`
Expected: PASS. (`Widget.tsx` ainda importa `shellSize`/`hitSize`; isso é corrigido na Task 5. Não rode o build agora.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell.ts src/lib/shell.test.ts
git commit -m "feat: pickShape decide a forma do widget por prioridade e por borda"
```

---

### Task 5: Moldura, ancoragem por borda e `data-edge` (Widget)

**Files:**
- Modify: `src/Widget.tsx`
- Modify: `src/Widget.css` (bloco `.hit`/`.shell` ~linhas 26-84 e regra `.panel` ~172-188)

**Interfaces:**
- Consumes: `pickShape`/`Shape` (Task 4), `ProgressLine` com `edge` (Task 3), `config.widget_edge`.
- Produces: o DOM `.widget-root[data-edge] > .scaled > .hit > .shell-frame.{phase}.{status} > .shell.{phase}.{status} > (Notch|Panel + ProgressLine)`; a variável CSS `--shell-bg` na moldura (usada na Task 6).

- [ ] **Step 1: Atualizar `Widget.tsx`**

1. Trocar o import `import { hitSize, shellSize } from "./lib/shell";` por `import { pickShape } from "./lib/shell";`.
2. Logo depois de `const now = useNow(...)` adicionar:

```tsx
  const shape = state
    ? pickShape({
        visible: state.config.widget_visible,
        status: state.timer.status,
        phase,
        edge: state.config.widget_edge,
      })
    : null;
```

3. Trocar o trecho a partir de `if (!state) return null;` até o `return (` por:

```tsx
  if (!state || !shape || shape.kind === "hidden") return null;

  const { timer, config } = state;
  const style = {
    "--accent": config.accent_color,
    "--s": SCALE_FACTOR[config.widget_scale],
  } as CSSProperties;

  return (
```

4. Trocar o JSX retornado por:

```tsx
    <div className="widget-root" data-edge={config.widget_edge} style={style}>
      <div className="scaled">
        <div
          className="hit"
          style={{ width: shape.hit.width, height: shape.hit.height }}
          onMouseEnter={hover.onMouseEnter}
          onMouseLeave={hover.onMouseLeave}
          onClick={phase === "closed" ? () => pin(true) : undefined}
        >
          <div
            className={`shell-frame ${phase} ${timer.status}`}
            style={{ width: shape.shell.width, height: shape.shell.height }}
          >
            <div className={`shell ${phase} ${timer.status}`}>
              {phase === "closed" ? (
                <Notch state={state} now={now} />
              ) : (
                <Panel
                  state={state}
                  now={now}
                  day={day ?? state.today}
                  onDay={setDay}
                  pinned={pinned}
                  onTogglePin={() => pin(!pinned)}
                  onHold={holdFromList}
                />
              )}
              <ProgressLine
                timer={timer}
                now={now}
                rgb={config.rgb_line}
                visible={config.progress_line && timer.status !== "idle"}
                edge={config.widget_edge}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reescrever o CSS de ancoragem**

Em `src/Widget.css`, substituir do comentário `/* ---- the area that takes the mouse` (linha ~26) até o fim da regra `.shell.open::after { opacity: 1; }` (linha ~84) por:

```css
/* ---- which corners are rounded: only the ones away from the screen edge.
   The flat side touches the edge. 1 = rounded, 0 = square. ---- */
.widget-root {
  --k-tl: 0;
  --k-tr: 0;
  --k-br: 1;
  --k-bl: 1;
}
.widget-root[data-edge="left"] {
  --k-tl: 0;
  --k-tr: 1;
  --k-br: 1;
  --k-bl: 0;
}
.widget-root[data-edge="right"] {
  --k-tl: 1;
  --k-tr: 0;
  --k-br: 0;
  --k-bl: 1;
}

/* ---- the area that takes the mouse (the backend lets it pass everywhere
   else while the panel is closed): centered at the top, or centered in height
   on the left/right edge ---- */
.hit {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
}
.widget-root[data-edge="left"] .hit {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}
.widget-root[data-edge="right"] .hit {
  top: 50%;
  left: auto;
  right: 0;
  transform: translateY(-50%);
}

/* ---- the frame: where the shape sits and how big it is. It animates the
   size; the shell inside is the visible, clipped shape. The window is always
   panel-sized and never resizes, so every change here is a plain CSS
   animation. ---- */
.shell-frame {
  --ease: cubic-bezier(0.32, 0.72, 0, 1);
  --shell-bg: #000;
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  transition:
    width 260ms var(--ease),
    height 260ms var(--ease);
}
.widget-root[data-edge="left"] .shell-frame {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}
.widget-root[data-edge="right"] .shell-frame {
  top: 50%;
  left: auto;
  right: 0;
  transform: translateY(-50%);
}
.shell-frame.open {
  --shell-bg: #0b0b0d;
}
/* Must match CLOSE_MS in Widget.tsx. */
.shell-frame.closing,
.shell.closing {
  transition-duration: 200ms;
}

/* ---- the shape: one element that morphs bar -> box -> panel ---- */
.shell {
  --ease: cubic-bezier(0.32, 0.72, 0, 1);
  --rad: 14px;
  --outline: color-mix(in srgb, var(--accent) 70%, transparent);
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--shell-bg);
  border-radius: calc(var(--k-tl) * var(--rad)) calc(var(--k-tr) * var(--rad))
    calc(var(--k-br) * var(--rad)) calc(var(--k-bl) * var(--rad));
  transition:
    border-radius 260ms var(--ease),
    background-color 260ms var(--ease);
}

.shell.idle:not(.open) {
  --rad: 4px;
}

.shell.open {
  --rad: 18px;
}

/* The accent outline of the open panel (never on the side touching the screen
   edge), drawn over the content so it doesn't change the shape's size. */
.shell::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 1px solid var(--outline);
  border-top: none;
  border-radius: inherit;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms;
}
.widget-root[data-edge="left"] .shell::after {
  border-top: 1px solid var(--outline);
  border-left: none;
}
.widget-root[data-edge="right"] .shell::after {
  border-top: 1px solid var(--outline);
  border-right: none;
}
.shell.open::after {
  opacity: 1;
}
```

Depois, no bloco `.panel` (~linha 172), manter as regras atuais e, logo depois da regra `.shell.open .panel { ... }`, adicionar:

```css
/* The panel is laid out at full size and revealed by the growing shape; on the
   side edges it hangs from the screen edge and is centered in height. */
.widget-root[data-edge="left"] .panel {
  top: 50%;
  left: 0;
  margin-left: 0;
  margin-top: -150px;
}
.widget-root[data-edge="right"] .panel {
  top: 50%;
  left: auto;
  right: 0;
  margin-left: 0;
  margin-top: -150px;
}
```

(O fundo do painel aberto passa a vir de `--shell-bg` via `.shell-frame.open`; por isso a regra antiga `.shell.open { background: #0b0b0d; ... }` foi removida acima.)

- [ ] **Step 3: Verificar**

Run: `bun run test` — Expected: todos os testes do vitest passam.
Run: `bun run build` — Expected: `tsc` sem erros e `vite build` conclui.
Run: `cargo test --manifest-path src-tauri/Cargo.toml` — Expected: passam (nada de Rust mudou).

- [ ] **Step 4: Commit**

```bash
git add src/Widget.tsx src/Widget.css
git commit -m "feat: moldura do widget ancorada por borda (data-edge), cantos e painel por borda"
```

---

### Task 6: Orelhinhas de notch (CSS)

**Files:**
- Modify: `src/Widget.tsx` (atributo `data-kind` na moldura)
- Modify: `src/Widget.css` (regras `.shell-frame::before/::after`)

**Interfaces:**
- Consumes: `shape.kind` e `--shell-bg` (Task 5).
- Produces: pseudo-elementos `.shell-frame::before`/`::after` (14×14) que formam as orelhinhas nas três bordas e somem (`opacity: 0`) quando `data-kind="bar"`.

- [ ] **Step 1: Atributo `data-kind`**

Em `src/Widget.tsx`, na `div` da moldura (`className={\`shell-frame ...\`}`), adicionar o atributo `data-kind={shape.kind}`:

```tsx
          <div
            className={`shell-frame ${phase} ${timer.status}`}
            data-kind={shape.kind}
            style={{ width: shape.shell.width, height: shape.shell.height }}
          >
```

- [ ] **Step 2: CSS das orelhinhas**

Em `src/Widget.css`, logo depois da regra `.shell-frame.open { --shell-bg: #0b0b0d; }`, adicionar:

```css
/* ---- notch "ears": concave curves where the box or panel meets the screen
   edge. Pure CSS: a transparent quarter circle (radius 14) cut out of a
   square painted in the shell's color. Not shown on the parked bar. ---- */
.shell-frame::before,
.shell-frame::after {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  pointer-events: none;
  transition: opacity 160ms;
}
.shell-frame[data-kind="bar"]::before,
.shell-frame[data-kind="bar"]::after {
  opacity: 0;
}

/* top edge: one ear on each side of the shape, at the top */
.widget-root[data-edge="top"] .shell-frame::before {
  top: 0;
  right: 100%;
  background: radial-gradient(circle at 0 100%, transparent 13.5px, var(--shell-bg) 14px);
}
.widget-root[data-edge="top"] .shell-frame::after {
  top: 0;
  left: 100%;
  background: radial-gradient(circle at 100% 100%, transparent 13.5px, var(--shell-bg) 14px);
}

/* left edge: one ear above and one below the shape */
.widget-root[data-edge="left"] .shell-frame::before {
  left: 0;
  bottom: 100%;
  background: radial-gradient(circle at 100% 0, transparent 13.5px, var(--shell-bg) 14px);
}
.widget-root[data-edge="left"] .shell-frame::after {
  left: 0;
  top: 100%;
  background: radial-gradient(circle at 100% 100%, transparent 13.5px, var(--shell-bg) 14px);
}

/* right edge: one ear above and one below the shape */
.widget-root[data-edge="right"] .shell-frame::before {
  right: 0;
  bottom: 100%;
  background: radial-gradient(circle at 0 0, transparent 13.5px, var(--shell-bg) 14px);
}
.widget-root[data-edge="right"] .shell-frame::after {
  right: 0;
  top: 100%;
  background: radial-gradient(circle at 0 100%, transparent 13.5px, var(--shell-bg) 14px);
}
```

- [ ] **Step 3: Verificar**

Run: `bun run build` — Expected: sem erros.
Run: `bun run test` — Expected: passam.
(A conferência visual das orelhinhas acontece na Task 9.)

- [ ] **Step 4: Commit**

```bash
git add src/Widget.tsx src/Widget.css
git commit -m "feat: orelhinhas de notch em CSS puro nas três bordas"
```

---

### Task 7: Transição assimétrica mola/fechar rápido

**Files:**
- Modify: `src/lib/shell.ts` (postos, `motionBetween`, durações)
- Modify: `src/lib/shell.test.ts`
- Modify: `src/widget/hooks.ts` (`useMotion`)
- Modify: `src/Widget.tsx` (usa `useMotion`, `SHRINK_MS`/`GROW_MS`, variáveis CSS)
- Modify: `src/Widget.css` (transições)

**Interfaces:**
- Consumes: `ShapeKind` (Task 4).
- Produces: `type Motion = "grow" | "shrink" | "same"`, `motionBetween(from: ShapeKind, to: ShapeKind): Motion`, `SHRINK_MS = 200`, `GROW_MS = 480` em `src/lib/shell.ts`; `useMotion(kind: ShapeKind): Motion` em `src/widget/hooks.ts`.

- [ ] **Step 1: Teste que falha**

Em `src/lib/shell.test.ts`, trocar a linha de import `import { nextTickDelay, pickShape } from "./shell";` por `import { GROW_MS, SHRINK_MS, motionBetween, nextTickDelay, pickShape } from "./shell";` e, no fim do arquivo, adicionar:

```ts
describe("motionBetween", () => {
  it("grows when the shape gets bigger: bar < box < panel", () => {
    expect(motionBetween("bar", "box")).toBe("grow");
    expect(motionBetween("box", "panel")).toBe("grow");
    expect(motionBetween("bar", "panel")).toBe("grow");
    expect(motionBetween("hidden", "bar")).toBe("grow");
  });

  it("shrinks when the shape gets smaller", () => {
    expect(motionBetween("panel", "box")).toBe("shrink");
    expect(motionBetween("panel", "bar")).toBe("shrink");
    expect(motionBetween("box", "bar")).toBe("shrink");
    expect(motionBetween("bar", "hidden")).toBe("shrink");
  });

  it("is the same when the kind does not change", () => {
    for (const kind of ["hidden", "bar", "box", "panel"] as const) {
      expect(motionBetween(kind, kind)).toBe("same");
    }
  });

  it("opens slowly and closes quickly", () => {
    expect(GROW_MS).toBe(480);
    expect(SHRINK_MS).toBe(200);
    expect(SHRINK_MS).toBeLessThan(GROW_MS);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test -- src/lib/shell.test.ts`
Expected: FAIL (`motionBetween` não existe).

- [ ] **Step 3: Implementar a lógica**

Em `src/lib/shell.ts`, depois da função `pickShape`, adicionar:

```ts
/** Bar < box < panel: going up a rank is "grow", going down is "shrink". */
const RANK: Record<ShapeKind, number> = { hidden: 0, bar: 1, box: 2, panel: 3 };

export type Motion = "grow" | "shrink" | "same";

export function motionBetween(from: ShapeKind, to: ShapeKind): Motion {
  if (RANK[to] > RANK[from]) return "grow";
  if (RANK[to] < RANK[from]) return "shrink";
  return "same";
}

/** Closing is decisive; opening is elastic. The CSS reads both from variables. */
export const SHRINK_MS = 200;
export const GROW_MS = 480;
```

Em `src/widget/hooks.ts`, trocar o import `import { nextTickDelay } from "../lib/shell";` por:

```ts
import { motionBetween, nextTickDelay } from "../lib/shell";
import type { Motion, ShapeKind } from "../lib/shell";
```

e, no fim do arquivo, adicionar:

```ts
/**
 * How the shape just changed: "grow" or "shrink" until the next change of
 * kind. The first render is "same" (nothing animates on mount).
 */
export function useMotion(kind: ShapeKind): Motion {
  const last = useRef(kind);
  const motion = useRef<Motion>("same");
  if (last.current !== kind) {
    motion.current = motionBetween(last.current, kind);
    last.current = kind;
  }
  return motion.current;
}
```

- [ ] **Step 4: Ligar no `Widget.tsx`**

1. Imports: trocar `import { pickShape } from "./lib/shell";` por `import { GROW_MS, SHRINK_MS, pickShape } from "./lib/shell";` e `import { useHoverOpen, useNow } from "./widget/hooks";` por `import { useHoverOpen, useMotion, useNow } from "./widget/hooks";`.
2. Remover a constante `const CLOSE_MS = 200;` (e o comentário acima dela) e trocar o uso `}, CLOSE_MS);` por `}, SHRINK_MS);`.
3. Logo depois do `const shape = ...;` adicionar:

```tsx
  const motion = useMotion(shape?.kind ?? "hidden");
```

4. No objeto `style` da raiz, adicionar as duas variáveis:

```tsx
  const style = {
    "--accent": config.accent_color,
    "--s": SCALE_FACTOR[config.widget_scale],
    "--grow-ms": `${GROW_MS}ms`,
    "--shrink-ms": `${SHRINK_MS}ms`,
  } as CSSProperties;
```

5. Na moldura, incluir a classe do movimento:

```tsx
            className={`shell-frame ${phase} ${timer.status} ${motion}`}
```

- [ ] **Step 5: CSS das transições**

Em `src/Widget.css`:

1. No bloco `.shell-frame { ... }` trocar a propriedade `transition` por:

```css
  --spring: cubic-bezier(0.34, 1.2, 0.64, 1);
  transition:
    width var(--shrink-ms, 200ms) var(--ease),
    height var(--shrink-ms, 200ms) var(--ease);
```

2. Remover a regra antiga:

```css
/* Must match CLOSE_MS in Widget.tsx. */
.shell-frame.closing,
.shell.closing {
  transition-duration: 200ms;
}
```

3. No `.shell`, trocar a `transition` por:

```css
  transition:
    border-radius var(--shrink-ms, 200ms) var(--ease),
    background-color var(--shrink-ms, 200ms) var(--ease);
```

4. Depois da regra `.shell-frame.open { --shell-bg: #0b0b0d; }`, adicionar:

```css
/* ---- growing is elastic, shrinking is decisive. The spring is a damped
   curve with ~2% overshoot (the panel's overshoot is clipped by the window,
   so it only shows from bar to box). ---- */
@supports (transition-timing-function: linear(0, 1)) {
  .shell-frame {
    --spring: linear(
      0, 0.0153, 0.0555, 0.1133, 0.1825, 0.2584, 0.337, 0.4155, 0.4914, 0.5633,
      0.63, 0.691, 0.7458, 0.7943, 0.8368, 0.8735, 0.9047, 0.931, 0.9527, 0.9704,
      0.9846, 0.9956, 1.0041, 1.0103, 1.0147, 1.0176, 1.0192, 1.0199, 1
    );
  }
}
.shell-frame.grow {
  transition:
    width var(--grow-ms, 480ms) var(--spring),
    height var(--grow-ms, 480ms) var(--spring);
}
.shell-frame.grow .shell {
  transition:
    border-radius var(--grow-ms, 480ms) var(--ease),
    background-color var(--grow-ms, 480ms) var(--ease);
}
.shell-frame.shrink {
  --ease: cubic-bezier(0.3, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .shell-frame.grow {
    transition:
      width var(--shrink-ms, 200ms) var(--ease),
      height var(--shrink-ms, 200ms) var(--ease);
  }
  .shell-frame.grow .shell {
    transition-duration: var(--shrink-ms, 200ms);
  }
}
```

(A regra `.shell-frame.shrink` troca o `--ease` só da moldura, que anima o tamanho. O `.shell` declara o próprio `--ease` e continua com a curva padrão para o raio e a cor de fundo. Não mexa nisso.)

- [ ] **Step 6: Verificar**

Run: `bun run test` — Expected: passam.
Run: `bun run build` — Expected: sem erros (`CLOSE_MS` não é mais referenciado).

- [ ] **Step 7: Commit**

```bash
git add src/lib/shell.ts src/lib/shell.test.ts src/widget/hooks.ts src/Widget.tsx src/Widget.css
git commit -m "feat: transição elástica ao crescer e rápida ao encolher"
```

---

### Task 8: Seletor "Posição" nas configurações e README

**Files:**
- Modify: `src/settings/NotchSection.tsx`
- Modify: `README.md` (parágrafo "A barra, a caixa e o painel são uma forma só...")

**Interfaces:**
- Consumes: `WidgetEdge` e `config.widget_edge` (Task 3).

- [ ] **Step 1: Seletor**

Em `src/settings/NotchSection.tsx`:

1. Trocar `import type { NotchStyle, WidgetScale } from "../lib/types";` por `import type { NotchStyle, WidgetEdge, WidgetScale } from "../lib/types";`.
2. Depois da constante `SCALES`, adicionar:

```tsx
const EDGES: { id: WidgetEdge; label: string }[] = [
  { id: "top", label: "Topo" },
  { id: "left", label: "Esquerda" },
  { id: "right", label: "Direita" },
];
```

3. Trocar o texto de `<p className="lead">` por `O que o widget mostra enquanto um bloco roda.`
4. Dentro do segundo `<div className="group">` (o que tem "Cor de destaque" e "Tamanho"), logo depois do `Row` de "Tamanho", adicionar:

```tsx
        <Row title="Posição" hint="Em qual borda da tela o widget fica colado. Nas laterais a barra fica em pé.">
          <div className="segmented" role="radiogroup" aria-label="Posição do widget">
            {EDGES.map((edge) => (
              <button
                key={edge.id}
                type="button"
                role="radio"
                aria-checked={config.widget_edge === edge.id}
                onClick={() => set({ widget_edge: edge.id })}
              >
                {edge.label}
              </button>
            ))}
          </div>
        </Row>
```

- [ ] **Step 2: README**

Em `README.md`, logo depois do parágrafo que termina em `pro que está embaixo.` (o que começa com "A barra, a caixa e o painel são uma forma só"), adicionar uma linha em branco e:

```markdown
Dá pra colar o widget em outra borda: em **Configurações → Notch → Posição**,
escolha Topo, Esquerda ou Direita. Nas laterais a barra fica em pé, centralizada
na altura da tela, e a caixa e o painel saem da borda pra dentro da tela.
```

- [ ] **Step 3: Verificar**

Run: `bun run build` — Expected: sem erros.
Run: `bun run test` — Expected: passam.

- [ ] **Step 4: Commit**

```bash
git add src/settings/NotchSection.tsx README.md
git commit -m "feat: seletor de posição (topo, esquerda, direita) nas configurações"
```

---

### Task 9: Verificação no app real

**Files:** nenhum arquivo de código muda (só leitura e capturas de tela em `%TEMP%`).

**Interfaces:**
- Consumes: tudo acima.

- [ ] **Step 1: Testes completos**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` e `bun run test` e `bun run build`.
Expected: tudo verde.

- [ ] **Step 2: Fechar o app em uso e buildar**

O `focusbrew.exe` guarda um trava de instância única e o arquivo do build: avise o Sthevan e feche com `Stop-Process -Name focusbrew -Force` (as tarefas ficam salvas em disco). Depois: `bun run dist`.
Expected: `Finished 1 bundle` e `src-tauri\target\release\focusbrew.exe` com data nova.

- [ ] **Step 3: Para cada borda, abrir o app com a borda na config e fotografar**

O arquivo é `%APPDATA%\sthevandev\focusbrew\config\settings.json`. Faça uma cópia (`settings.json.bak`) antes. Para cada `edge` em `top`, `left`, `right`:

```powershell
$f = "$env:APPDATA\sthevandev\focusbrew\config\settings.json"
$j = Get-Content $f -Raw | ConvertFrom-Json
$j | Add-Member -NotePropertyName widget_edge -NotePropertyValue $edge -Force
$j | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding UTF8
Start-Process D:\Projetos\focusbrew\src-tauri\target\release\focusbrew.exe
Start-Sleep -Seconds 4
```

Captura recortada ao redor do widget (top: centro-cima; left: centro-esquerda; right: centro-direita), 640×420:

```powershell
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$w = 640; $h = 420
switch ($edge) {
  "top"   { $x = [int](($b.Width - $w) / 2); $y = 0 }
  "left"  { $x = 0; $y = [int](($b.Height - $h) / 2) }
  "right" { $x = $b.Width - $w; $y = [int](($b.Height - $h) / 2) }
}
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($x, $y, 0, 0, $bmp.Size)
$bmp.Save("$env:TEMP\fb_$edge`_idle.png")
```

Abra o PNG com a ferramenta Read e confira: a barra parada fica colada na borda certa (em pé nas laterais). Depois repita a captura com **o painel aberto** (atalho `Ctrl+Shift+Alt+Space`; se o `SendKeys` `"^+% "` não disparar o atalho global, peça ao Sthevan para apertar) e, se houver tarefa do dia, **rodando** (atalho `Ctrl+Shift+Space`). Confira: o painel cresce para dentro da tela, centralizado na altura nas laterais; a caixa sai da borda; as orelhinhas aparecem onde a caixa e o painel encostam na borda; a linha de progresso deixa aberto o lado da borda; o contorno do painel não aparece do lado colado. Feche o app (`Stop-Process -Name focusbrew -Force`) entre as bordas.

- [ ] **Step 4: Restaurar**

Restaure a config original (`settings.json.bak` → `settings.json`) ou deixe na borda que o Sthevan preferir, e reabra o app instalado/o build novo para ele.

- [ ] **Step 5: Registrar**

Nenhum commit de código. Se algum item acima falhar, corrija na task dona, rode os testes dela e faça um commit de correção separado (`fix: ...`). Ao fechar, atualizar `D:\meu2cerebro\1-Projetos\focusbrew.md` e criar a nota de sessão em `1-Projetos/focusbrew/` (regra do log de sessões do CLAUDE.md global).

---

## Self-Review

**Cobertura da spec:** §2 config e geometria → Tasks 1 e 2; §3 ancoragem, cantos, barra 6×140, linha de progresso, orelhinhas e moldura → Tasks 3, 5 e 6; §4 estado efetivo, cascata e transição → Tasks 4 e 7 (estado efetivo = `pickShape` sobre `phase`/`status`/config, sem estado novo); §5 casos de borda → Task 2 (testes), Task 9 (verificação) e limitação da barra de tarefas (sem código); §6 testes → em cada task; §7 entrega → commits na `main`. O seletor nas configurações (§2) está na Task 8, depois do visual pronto, para o Sthevan não poder escolher uma borda ainda sem estilo.

**Placeholders:** nenhum "TBD"/"TODO"; todo passo de código traz o código.

**Consistência de tipos:** `WidgetEdge` (Rust `Top/Left/Right` ↔ TS `"top"|"left"|"right"`); `physical_bounds(area, layout, edge)` e `hot_zone(config, status)` iguais nas Tasks 2; `pickShape`/`Shape`/`ShapeKind` definidos na Task 4 e usados nas Tasks 5, 6 e 7; `uPath(shape, edge)`/`uLength(shape, edge)` e `ProgressLine.edge` da Task 3 usados na Task 5; `useMotion`/`motionBetween`/`SHRINK_MS`/`GROW_MS` definidos e usados na Task 7.

**Ajuste em relação à spec:** a spec dizia "painel aberto, fixado ou fechando → painel"; o plano mantém o comportamento atual (ao fechar, a forma já encolhe para caixa/barra) e a spec foi corrigida junto.
