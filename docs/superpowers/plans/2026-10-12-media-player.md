# Player de música no widget (SMTC) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O widget do FocusBrew mostra e controla a mídia tocando em qualquer app do Windows (Spotify, navegador, etc.) via SMTC, sem login nem API key. Sem mídia, o widget é exatamente o de hoje. Com mídia, o `box` compacto ganha uma área de capa/progresso + controles, e tarefa/música disputam o mesmo espaço por abas alternadas com Ctrl+Scroll (tarefa por padrão). O painel expandido ganha uma aba "Música".

**Architecture:** Novo módulo Rust `media.rs` lendo o `GlobalSystemMediaTransportControlsSessionManager` do Windows (crate `windows`, já dependência do projeto) a cada tick do loop de 1s existente, publicando um `MediaView` no snapshot. No frontend, `pickShape` (`src/lib/shell.ts`) ganha `hasMedia` como mais um critério pra decidir `bar` vs `box`; dentro do `box`, uma função pura nova decide a aba ativa (`task`/`media`) e um handler de `onWheel` com `ctrlKey` alterna entre elas.

**Tech Stack:** Rust (Tauri v2, crate `windows`), React + TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-media-player-design.md`

## Global Constraints

- Só leitura/controle da sessão de mídia "atual" do Windows (a que o próprio SO escolhe) — sem gerenciar várias sessões.
- Sem sessão nenhuma tocando, o widget deve ficar **idêntico** ao comportamento de hoje (seção 1 da spec) — nenhuma mudança visual ou de forma quando `hasMedia` é falso.
- Tarefa é a aba padrão sempre que as duas (tarefa ativa + mídia) estão presentes (seção 3 do design acordado).
- Ctrl+Scroll só reage com `ctrlKey` verdadeiro — o scroll comum não pode ser afetado em nenhum outro lugar da UI.
- Capa da mídia nunca é salva em disco nem servida por HTTP local — só como `data:` URL dentro do snapshot já existente.

## Review Focus

- **App tocando mídia sem capa** (ex.: alguns players só mandam título/artista): a UI não pode ficar com espaço vazio quebrado nem falhar ao renderizar — precisa de um estado "sem capa" (ícone de nota musical).
- **Troca de app tocando mídia no meio de uma sessão** (ex.: pausa o Spotify, começa a tocar um vídeo no Chrome): o Windows troca a sessão "atual" sozinho — o próximo tick deve refletir a mídia nova, não ficar preso na anterior.
- **Scroll comum (sem Ctrl) sobre o widget** com as duas fontes ativas: não pode alternar de aba nem disparar nenhum efeito colateral (ex.: scroll acidental do trackpad).
- **Mídia para de tocar enquanto a aba "música" está em foco** (tarefa não está ativa, só havia música): o widget deve voltar pra doca antiga sozinho, não ficar preso num `box` vazio.
- **Posição/duração ausentes ou zeradas** (alguns players não reportam timeline): a barra de progresso não pode dividir por zero nem quebrar a UI.

---

### Task 1: `MediaView` e mapeamento puro (sem SMTC ainda)

**Files:**
- Create: `src-tauri/src/media.rs`
- Modify: `src-tauri/src/lib.rs` (`mod media;`)

**Interfaces:**
- Produces: `MediaStatus` (`Playing`/`Paused`), `MediaView { title: String, artist: String, cover_data_url: Option<String>, position_secs: u32, duration_secs: u32, status: MediaStatus }`, `fn to_data_url(cover: Option<&[u8]>) -> Option<String>`, `fn clamp_position(position_secs: u32, duration_secs: u32) -> u32`.

- [ ] **Step 1: Escreva os testes que falham**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_cover_bytes_means_no_data_url() {
        assert_eq!(to_data_url(None), None);
    }

    #[test]
    fn cover_bytes_become_a_base64_data_url() {
        let url = to_data_url(Some(&[0xFF, 0xD8, 0xFF])).unwrap();
        assert!(url.starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn position_never_exceeds_duration() {
        assert_eq!(clamp_position(999, 180), 180);
    }

    #[test]
    fn a_zero_duration_still_clamps_to_zero_instead_of_dividing_by_it() {
        assert_eq!(clamp_position(50, 0), 0);
    }

    #[test]
    fn position_within_duration_is_untouched() {
        assert_eq!(clamp_position(42, 180), 42);
    }
}
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `cd src-tauri && cargo test media::`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implemente**

```rust
//! Mídia tocando em qualquer app do Windows (SMTC) — capa/progresso/controles
//! no widget. A leitura real da sessão do Windows (Task 2) produz os bytes
//! crus que este arquivo transforma num `MediaView` seguro de publicar.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaStatus {
    Playing,
    Paused,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaView {
    pub title: String,
    pub artist: String,
    pub cover_data_url: Option<String>,
    pub position_secs: u32,
    pub duration_secs: u32,
    pub status: MediaStatus,
}

/// Assume JPEG — é o formato mais comum devolvido pelo SMTC pras capas de
/// álbum; um formato diferente ainda decodifica no `<img>` pela maioria dos
/// navegadores/engines, então não vale a complexidade de detectar o tipo real.
pub fn to_data_url(cover: Option<&[u8]>) -> Option<String> {
    let bytes = cover?;
    if bytes.is_empty() {
        return None;
    }
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    Some(format!("data:image/jpeg;base64,{encoded}"))
}

/// Protege a barra de progresso: nunca passa da duração, e uma duração
/// zerada (alguns players não reportam timeline) nunca produz uma posição
/// maior que zero.
pub fn clamp_position(position_secs: u32, duration_secs: u32) -> u32 {
    if duration_secs == 0 {
        return 0;
    }
    position_secs.min(duration_secs)
}
```

Adicione `mod media;` em `lib.rs`.

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `cd src-tauri && cargo test media::`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/media.rs src-tauri/src/lib.rs
git commit -m "feat: MediaView e mapeamento puro da capa/progresso"
```

---

### Task 2: Leitura e controle da sessão SMTC do Windows

**Files:**
- Modify: `src-tauri/src/media.rs`
- Modify: `src-tauri/Cargo.toml` (features da crate `windows`)

**Interfaces:**
- Consumes: `MediaView`, `MediaStatus`, `to_data_url`, `clamp_position` (Task 1).
- Produces: `pub async fn current() -> Option<MediaView>`, `pub async fn play() -> Result<(), String>`, `pub async fn pause() -> Result<(), String>`, `pub async fn next() -> Result<(), String>`, `pub async fn previous() -> Result<(), String>`.

- [ ] **Step 1: Confirme as features necessárias da crate `windows`**

Abra `src-tauri/Cargo.toml` e veja quais features de `windows` já estão habilitadas (usadas hoje por `SetWindowPos`/cursor/registro). Adicione as que faltarem pra SMTC — `Media_Control` e `Foundation` — via:

```bash
cd src-tauri && cargo add windows --features Media_Control,Foundation
```

(Isso faz merge com o `windows = {...}` já existente no `Cargo.toml`, sem duplicar a dependência — confira o diff antes de seguir.)

- [ ] **Step 2: Implemente a leitura e os controles**

Sem teste automatizado possível aqui — a API real exige uma sessão de mídia do Windows ativa, que não dá pra simular num `cargo test`. A cobertura desta task é a verificação manual do Step 3; os testes automatizados já cobriram tudo que é puro nas Tasks 1 e 4-5.

```rust
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};

fn to_status(status: PlaybackStatus) -> Option<MediaStatus> {
    match status {
        PlaybackStatus::Playing => Some(MediaStatus::Playing),
        PlaybackStatus::Paused => Some(MediaStatus::Paused),
        _ => None, // Stopped/Changing/Closed: tratado como "sem mídia" por quem chama
    }
}

async fn session() -> Option<windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    let manager = SessionManager::RequestAsync().ok()?.await.ok()?;
    manager.GetCurrentSession().ok()
}

/// A mídia tocando agora, ou `None` sem nenhuma sessão ativa (nada tocando,
/// ou o Windows não acha nenhum app com controle de mídia registrado).
pub async fn current() -> Option<MediaView> {
    let session = session().await?;
    let status = to_status(session.GetPlaybackInfo().ok()?.PlaybackStatus().ok()?)?;
    let props = session.TryGetMediaPropertiesAsync().ok()?.await.ok()?;
    let title = props.Title().ok()?.to_string_lossy();
    let artist = props.Artist().map(|a| a.to_string_lossy()).unwrap_or_default();

    let cover = props
        .Thumbnail()
        .ok()
        .and_then(|thumb| thumb.OpenReadAsync().ok()?.get().ok())
        .and_then(|stream| {
            let size = stream.Size().ok()? as u32;
            let reader = windows::Storage::Streams::DataReader::CreateDataReader(&stream).ok()?;
            reader.LoadAsync(size).ok()?.get().ok()?;
            let mut buf = vec![0u8; size as usize];
            reader.ReadBytes(&mut buf).ok()?;
            Some(buf)
        });

    let timeline = session.GetTimelineProperties().ok()?;
    let position_secs = timeline.Position().ok().map(|t| (t.Duration / 10_000_000) as u32).unwrap_or(0);
    let duration_secs = timeline.EndTime().ok().map(|t| (t.Duration / 10_000_000) as u32).unwrap_or(0);

    Some(MediaView {
        title,
        artist,
        cover_data_url: to_data_url(cover.as_deref()),
        position_secs: clamp_position(position_secs, duration_secs),
        duration_secs,
        status,
    })
}

pub async fn play() -> Result<(), String> {
    let s = session().await.ok_or("sem sessão de mídia ativa")?;
    s.TryPlayAsync().map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn pause() -> Result<(), String> {
    let s = session().await.ok_or("sem sessão de mídia ativa")?;
    s.TryPauseAsync().map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn next() -> Result<(), String> {
    let s = session().await.ok_or("sem sessão de mídia ativa")?;
    s.TrySkipNextAsync().map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn previous() -> Result<(), String> {
    let s = session().await.ok_or("sem sessão de mídia ativa")?;
    s.TrySkipPreviousAsync().map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())?;
    Ok(())
}
```

Os nomes exatos de método (`GetPlaybackInfo`, `TryGetMediaPropertiesAsync`, `GetTimelineProperties`, `Thumbnail`, `OpenReadAsync`) seguem o binding gerado pela crate `windows` pra `Windows.Media.Control`/`Windows.Storage.Streams` — se o `cargo build` apontar um nome diferente (bindings mudam entre versões da crate), ajuste pelo erro do compilador; a forma e a ordem das chamadas acima está correta pro SDK do Windows.

- [ ] **Step 3: Verificação manual**

Toque uma faixa no Spotify desktop; rode `cargo test media::` (Task 1 continua passando) e, numa chamada manual temporária (ex.: um `#[test]` marcado `#[ignore]` que você roda à mão com `cargo test -- --ignored`), confirme que `current().await` retorna título/artista reais. Pause e confirme `status` muda pra `Paused`.

- [ ] **Step 4: Compile**

Run: `cd src-tauri && cargo build`
Expected: compila sem erros (ajuste os nomes de método conforme a Step 2 observar).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/media.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: leitura e controle da sessão de mídia via SMTC"
```

---

### Task 3: Estado, snapshot e comandos Tauri de controle

**Files:**
- Modify: `src-tauri/src/state.rs` (`AppState.media`, `StateSnapshot.media`)
- Modify: `src-tauri/src/lib.rs` (tick loop lê `media::current()`)
- Modify: `src-tauri/src/commands.rs` (`media_play`, `media_pause`, `media_next`, `media_previous`)
- Modify: `src/lib/types.ts` (`MediaView`, `MediaStatus`, `StateSnapshot.media`)
- Test: `src-tauri/src/state.rs` (mod `tests` existente)

**Interfaces:**
- Consumes: `media::{current, play, pause, next, previous}`, `MediaView` (Tasks 1–2).
- Produces: `AppState.media: Option<media::MediaView>`, `StateSnapshot.media: Option<media::MediaView>`, `AppState.set_media(view: Option<media::MediaView>)`.

- [ ] **Step 1: Escreva o teste que falha**

Em `src-tauri/src/state.rs`, no `mod tests` existente:

```rust
#[test]
fn set_media_replaces_whatever_was_there_including_clearing_it() {
    let mut state = AppState::for_test();
    let view = crate::media::MediaView {
        title: "Faixa".into(), artist: "Artista".into(), cover_data_url: None,
        position_secs: 10, duration_secs: 200, status: crate::media::MediaStatus::Playing,
    };
    state.set_media(Some(view.clone()));
    assert_eq!(state.media, Some(view));
    state.set_media(None);
    assert_eq!(state.media, None);
}
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `cd src-tauri && cargo test state::set_media`
Expected: FAIL — `media`/`set_media` não existem em `AppState`.

- [ ] **Step 3: Implemente**

Em `state.rs`:

```rust
pub struct AppState {
    // ... campos existentes ...
    pub media: Option<crate::media::MediaView>,
}

impl AppState {
    pub fn set_media(&mut self, view: Option<crate::media::MediaView>) {
        self.media = view;
    }
}
```

Inicialize `media: None` em `AppState::load()` e `AppState::for_test()`. Adicione `pub media: Option<crate::media::MediaView>` à `StateSnapshot` e `media: state.media.clone()` no `impl From<&AppState>`.

Em `lib.rs`, dentro de `spawn_tick_loop` (a cada 1s), leia a sessão e publique quando mudar:

```rust
let media = media::current().await;
let changed;
{
    let shared = app.state::<Shared>();
    let mut state = shared.lock();
    changed = state.media != media;
    if changed {
        state.set_media(media);
    }
}
if changed {
    let shared = app.state::<Shared>();
    sync_ui(&app, &shared.lock());
}
```

Encaixe esse bloco dentro do `loop` de `spawn_tick_loop`, perto de onde o estado já é lido/travado — ajuste a ordem exata pra não travar o mutex duas vezes seguidas sem necessidade (uma seção crítica só, como o resto da função já faz).

Em `commands.rs`:

```rust
#[tauri::command]
pub async fn media_play() -> Result<(), String> {
    media::play().await
}

#[tauri::command]
pub async fn media_pause() -> Result<(), String> {
    media::pause().await
}

#[tauri::command]
pub async fn media_next() -> Result<(), String> {
    media::next().await
}

#[tauri::command]
pub async fn media_previous() -> Result<(), String> {
    media::previous().await
}
```

Registre os quatro em `generate_handler![...]` em `lib.rs`.

Em `src/lib/types.ts`:

```ts
export type MediaStatus = "playing" | "paused";

export interface MediaView {
  title: string;
  artist: string;
  cover_data_url: string | null;
  position_secs: number;
  duration_secs: number;
  status: MediaStatus;
}

export interface StateSnapshot {
  // ... campos existentes ...
  media: MediaView | null;
}
```

- [ ] **Step 4: Rode o teste e confirme que passa**

Run: `cd src-tauri && cargo test state::set_media`
Expected: PASS

- [ ] **Step 5: Compile tudo**

Run: `cd src-tauri && cargo build` e `bun run build`
Expected: ambos sem erros.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/state.rs src-tauri/src/lib.rs src-tauri/src/commands.rs src/lib/types.ts
git commit -m "feat: estado, snapshot e comandos de controle da mídia"
```

---

### Task 4: `pickShape` reage a `hasMedia`

**Files:**
- Modify: `src/lib/shell.ts` (`ShapeContext`, `pickShape`)
- Modify: `src/Widget.tsx` (passa `hasMedia: Boolean(state.media)`)
- Test: `src/lib/shell.test.ts`

**Interfaces:**
- Consumes: nenhuma nova (usa `StateSnapshot.media` da Task 3 só no `Widget.tsx`).
- Produces: `ShapeContext.hasMedia: boolean` (novo campo).

- [ ] **Step 1: Escreva os testes que falham**

Em `src/lib/shell.test.ts`, dentro do `describe("pickShape", ...)` existente (o helper `ctx()` precisa de `hasMedia: false` no default):

```ts
it("is the bar when idle with no media, same as before", () => {
  const shape = pickShape(ctx({ status: "idle", hasMedia: false }));
  expect(shape.kind).toBe("bar");
});

it("is the box when idle but media is playing", () => {
  const shape = pickShape(ctx({ status: "idle", hasMedia: true }));
  expect(shape.kind).toBe("box");
});

it("is the box when the timer runs even without media, same as before", () => {
  const shape = pickShape(ctx({ status: "running", hasMedia: false }));
  expect(shape.kind).toBe("box");
});

it("is the box when both the timer runs and media plays", () => {
  const shape = pickShape(ctx({ status: "running", hasMedia: true }));
  expect(shape.kind).toBe("box");
});
```

(Atualize o helper `ctx()` no topo do arquivo pra incluir `hasMedia: false` no objeto default.)

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `bun test src/lib/shell.test.ts`
Expected: FAIL — `hasMedia` não existe em `ShapeContext`; o caso "idle com mídia" ainda devolve `bar`.

- [ ] **Step 3: Implemente**

```ts
export interface ShapeContext {
  visible: boolean;
  status: TimerStatus;
  phase: PanelPhase;
  edge: WidgetEdge;
  sideCount: SideCountStyle;
  noteOpen: boolean;
  /** Alguma mídia tocando no Windows agora (SMTC). */
  hasMedia: boolean;
}

export function pickShape({ visible, status, phase, edge, sideCount, noteOpen, hasMedia }: ShapeContext): Shape {
  if (!visible) return { kind: "hidden", shell: NONE, hit: NONE };
  if (noteOpen) return { kind: "note", shell: NOTE, hit: NOTE };
  if (phase === "open") return { kind: "panel", shell: PANEL, hit: PANEL };
  if (status !== "idle" || hasMedia) {
    const box = edge === "top" ? BOX : sideCount === "inline" ? SIDE_INLINE : SIDE_STACKED;
    return { kind: "box", shell: box, hit: box };
  }
  if (edge === "top") return { kind: "bar", shell: BAR, hit: BAR_ZONE };
  return { kind: "bar", shell: turned(BAR), hit: turned(BAR_ZONE) };
}
```

Em `src/Widget.tsx`, adicione `hasMedia: Boolean(state.media)` ao objeto passado pra `pickShape`.

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `bun test src/lib/shell.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell.ts src/lib/shell.test.ts src/Widget.tsx
git commit -m "feat: pickShape mostra o box quando há mídia tocando"
```

---

### Task 5: Aba ativa do `box` (tarefa/música) — lógica pura

**Files:**
- Create: `src/widget/mediaTabs.ts`
- Test: `src/widget/mediaTabs.test.ts`

**Interfaces:**
- Produces: `type BoxTab = "task" | "media"`, `fn defaultTab(hasTask: boolean, hasMedia: boolean): BoxTab`, `fn nextTab(current: BoxTab, hasTask: boolean, hasMedia: boolean, deltaY: number): BoxTab`.

- [ ] **Step 1: Escreva os testes que falham**

```ts
import { describe, expect, it } from "vitest";
import { defaultTab, nextTab } from "./mediaTabs";

describe("defaultTab", () => {
  it("is task whenever a task is active, even with media also playing", () => {
    expect(defaultTab(true, true)).toBe("task");
    expect(defaultTab(true, false)).toBe("task");
  });

  it("is media when there is no active task", () => {
    expect(defaultTab(false, true)).toBe("media");
  });

  it("falls back to task when neither source is active (nothing renders either way)", () => {
    expect(defaultTab(false, false)).toBe("task");
  });
});

describe("nextTab", () => {
  it("switches to the other tab when both sources are active", () => {
    expect(nextTab("task", true, true, 1)).toBe("media");
    expect(nextTab("media", true, true, -1)).toBe("task");
  });

  it("does nothing when only one source is active", () => {
    expect(nextTab("task", true, false, 1)).toBe("task");
    expect(nextTab("media", false, true, -1)).toBe("media");
  });

  it("does nothing when neither source is active", () => {
    expect(nextTab("task", false, false, 1)).toBe("task");
  });

  it("is deterministic regardless of the scroll direction's magnitude", () => {
    expect(nextTab("task", true, true, 120)).toBe("media");
    expect(nextTab("task", true, true, -120)).toBe("media");
  });
});
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `bun test src/widget/mediaTabs.test.ts`
Expected: FAIL — `src/widget/mediaTabs.ts` não existe.

- [ ] **Step 3: Implemente**

```ts
export type BoxTab = "task" | "media";

/** A tarefa é sempre a aba padrão quando há uma ativa — música é o complemento. */
export function defaultTab(hasTask: boolean, hasMedia: boolean): BoxTab {
  if (hasTask) return "task";
  return hasMedia ? "media" : "task";
}

/**
 * Ctrl+Scroll alterna entre as duas abas quando ambas as fontes estão
 * ativas; com só uma (ou nenhuma), o scroll não tem pra onde ir e a aba
 * atual se mantém. A direção do scroll não importa, só que ele aconteceu —
 * só existem duas abas pra alternar entre.
 */
export function nextTab(current: BoxTab, hasTask: boolean, hasMedia: boolean, deltaY: number): BoxTab {
  if (deltaY === 0) return current;
  if (!(hasTask && hasMedia)) return current;
  return current === "task" ? "media" : "task";
}
```

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `bun test src/widget/mediaTabs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/widget/mediaTabs.ts src/widget/mediaTabs.test.ts
git commit -m "feat: lógica pura da aba ativa (tarefa/música) do box"
```

---

### Task 6: Ctrl+Scroll e conteúdo de música no `box`

**Files:**
- Create: `src/widget/MediaBox.tsx`
- Modify: `src/widget/Notch.tsx` (recebe `media`/`activeTab`, renderiza `MediaBox` quando a aba é `"media"`, deixa de retornar `null` em idle com mídia)
- Modify: `src/Widget.tsx` (estado da aba ativa, handler `onWheel`)
- Modify: `src/widget/icons.tsx` (ícone de nota musical pra capa ausente, se não houver um já genérico o bastante)

**Interfaces:**
- Consumes: `defaultTab`, `nextTab`, `BoxTab` (Task 5); `MediaView` (Task 3).
- Produces: `MediaBox({ media }: { media: MediaView })` (componente).

- [ ] **Step 1: Verificação manual (sem teste automatizado de componente nesta base)**

Este projeto não tem testes de componente React (só lógica pura com Vitest — confira `holding.test.ts`/`shell.test.ts`, nenhum deles renderiza JSX). A cobertura desta task é a lógica pura já testada na Task 5; aqui só a fiação e o layout, verificados manualmente no Step 3.

- [ ] **Step 2: Implemente**

`src/widget/MediaBox.tsx`:

```tsx
import { invoke } from "../lib/tauri";
import type { MediaView } from "../lib/types";
import { MusicNoteIcon, NextIcon, PlayPauseIcon, PreviousIcon } from "./icons";

export default function MediaBox({ media }: { media: MediaView }) {
  const pct = media.duration_secs > 0 ? (media.position_secs / media.duration_secs) * 100 : 0;
  const toggle = () => invoke(media.status === "playing" ? "media_pause" : "media_play");

  return (
    <div className="notch-box media">
      <div className="media-cover">
        {media.cover_data_url ? <img src={media.cover_data_url} alt="" /> : <MusicNoteIcon size={18} />}
        <div className="media-progress" style={{ width: `${pct}%` }} />
      </div>
      <div className="media-controls">
        <button onClick={() => invoke("media_previous")} aria-label="Faixa anterior">
          <PreviousIcon size={14} />
        </button>
        <button onClick={toggle} aria-label={media.status === "playing" ? "Pausar" : "Tocar"}>
          <PlayPauseIcon size={14} playing={media.status === "playing"} />
        </button>
        <button onClick={() => invoke("media_next")} aria-label="Próxima faixa">
          <NextIcon size={14} />
        </button>
      </div>
    </div>
  );
}
```

Se `icons.tsx` ainda não tiver `MusicNoteIcon`/`PreviousIcon`/`NextIcon`/`PlayPauseIcon`, adicione-os ali seguindo exatamente o estilo dos ícones existentes (`ClockIcon` etc. — mesmo formato de `size` prop e SVG inline).

Em `Notch.tsx`, mude a guarda do topo e adicione o ramo de música:

```tsx
interface Props {
  state: StateSnapshot;
  now: number;
  activeTab: BoxTab;
}

export default function Notch({ state, now, activeTab }: Props) {
  const { timer, config, tasks, media } = state;
  if (timer.status === "idle" && !media) return null;
  if (activeTab === "media" && media) return <MediaBox media={media} />;
  if (timer.status === "idle") return null; // só mídia ativa, mas a aba pedida foi "task"
  // ... resto da função exatamente como já era (layout/ClockIcon/etc.) ...
```

Em `Widget.tsx`:

```ts
import { defaultTab, nextTab } from "./widget/mediaTabs";
import type { BoxTab } from "./widget/mediaTabs";
// ...
const [tab, setTab] = useState<BoxTab>("task");
const hasTask = state?.timer.status !== "idle";
const hasMedia = Boolean(state?.media);
useEffect(() => {
  setTab((current) => defaultTab(hasTask, hasMedia) === current ? current : defaultTab(hasTask, hasMedia));
}, [hasTask, hasMedia]);

const onWheel: React.WheelEventHandler = (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setTab((current) => nextTab(current, hasTask, hasMedia, e.deltaY));
};
```

E no `pickShape({ ... hasMedia, ... })` já existente, passe `hasMedia` (Task 4). No JSX, adicione `onWheel={onWheel}` na `div.hit` e passe `activeTab={tab}` pro `<Notch ... />`.

Comportamento importante: quando `hasTask` vira falso (timer para) enquanto a aba estava em `"task"`, o `useEffect` acima já reavalia `defaultTab` e troca pra `"media"` se houver mídia, ou mantém `"task"` (que aí não renderiza nada, igual ao comportamento de hoje) se não houver. Isso cobre o caso do Review Focus "mídia para enquanto a aba música está em foco e a tarefa não está ativa": o widget esvazia e `pickShape` já devolve `bar` porque `hasMedia` também foi a falso.

- [ ] **Step 3: Verificação manual**

`bun run tauri dev`: toque uma música sem a tarefa ativa (widget mostra a doca de música direto); inicie uma tarefa com a música ainda tocando e confirme que mostra a tarefa por padrão; passe o mouse sobre o widget e use Ctrl+Scroll pra alternar pra música e voltar; pare a música com só a tarefa ativa (nada muda); pare a tarefa com só a música ativa (volta pro box de música); pare as duas (volta pra doca antiga/bar). Teste também a troca de app no meio: com o Spotify tocando (aparecendo no widget), comece a tocar um vídeo no Chrome sem pausar o Spotify — confirme que o widget passa a mostrar o que o Windows escolher como sessão atual no próximo tick (1s), sem ficar preso na capa/controles do app anterior.

- [ ] **Step 4: Commit**

```bash
git add src/widget/MediaBox.tsx src/widget/Notch.tsx src/widget/icons.tsx src/Widget.tsx
git commit -m "feat: Ctrl+Scroll entre tarefa/música e conteúdo de música no box"
```

---

### Task 7: Aba "Música" no painel expandido

**Files:**
- Modify: `src/lib/day.ts` (`PanelTab`, `tabsFor`)
- Create: `src/widget/MediaTab.tsx`
- Modify: `src/widget/Panel.tsx` (registra a aba nova)
- Test: `src/lib/day.test.ts`

**Interfaces:**
- Consumes: `MediaView` (Task 3), `MediaBox`-style controles (reaproveita os mesmos `invoke("media_*")` da Task 6, numa versão maior do layout).
- Produces: `PanelTab` ganha `"media"`; `tabsFor(day, today, github, hasMedia)` ganha o 4º parâmetro.

- [ ] **Step 1: Escreva os testes que falham**

Abra `src/lib/day.test.ts` e veja a forma exata dos testes existentes de `tabsFor` antes de escrever os novos (para bater o estilo). Adicione:

```ts
it("includes media only when there is media playing", () => {
  expect(tabsFor(today, today, false, true)).toContain("media");
  expect(tabsFor(today, today, false, false)).not.toContain("media");
});

it("still includes github and media together when both apply", () => {
  const tabs = tabsFor(today, today, true, true);
  expect(tabs).toEqual(expect.arrayContaining(["tasks", "summary", "github", "media"]));
});
```

(Ajuste `today`/as datas usadas pra bater com as já existentes no arquivo — não invente um formato novo de data.)

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `bun test src/lib/day.test.ts`
Expected: FAIL — `tabsFor` ainda não aceita o 4º parâmetro; TypeScript provavelmente já aponta erro de tipo antes de rodar.

- [ ] **Step 3: Implemente**

Em `src/lib/day.ts`:

```ts
export type PanelTab = "tasks" | "summary" | "github" | "media";

export function tabsFor(day: string, today: string, github: boolean, hasMedia: boolean): PanelTab[] {
  const tabs: PanelTab[] = day > today ? ["tasks"] : ["tasks", "summary"];
  if (github) tabs.push("github");
  if (hasMedia) tabs.push("media");
  return tabs;
}
```

Ajuste a assinatura real conforme o corpo existente da função (a reconstrução acima segue a forma vista no trecho já lido de `day.ts`; mantenha qualquer lógica adicional que já exista ali intocada, só acrescentando o `hasMedia`/`"media"`).

Em `Panel.tsx`:
- Atualize `TAB_LABEL` com `media: "Música"`.
- Atualize a chamada de `tabsFor(day, today, Boolean(state.config.github_login))` pra `tabsFor(day, today, Boolean(state.config.github_login), Boolean(state.media))`.
- Adicione `{tab === "media" && state.media && <MediaTab media={state.media} />}` junto do `{tab === "github" && ...}` existente.

`src/widget/MediaTab.tsx` (versão maior do `MediaBox`, com seek — reaproveita os mesmos comandos):

```tsx
import { invoke } from "../lib/tauri";
import type { MediaView } from "../lib/types";
import { MusicNoteIcon, NextIcon, PlayPauseIcon, PreviousIcon } from "./icons";

export default function MediaTab({ media }: { media: MediaView }) {
  const pct = media.duration_secs > 0 ? (media.position_secs / media.duration_secs) * 100 : 0;
  const toggle = () => invoke(media.status === "playing" ? "media_pause" : "media_play");

  return (
    <div className="media-tab">
      <div className="media-tab-cover">
        {media.cover_data_url ? <img src={media.cover_data_url} alt="" /> : <MusicNoteIcon size={48} />}
      </div>
      <div className="media-tab-info">
        <strong>{media.title}</strong>
        <span>{media.artist}</span>
      </div>
      <div className="media-tab-progress">
        <div className="media-tab-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="media-tab-controls">
        <button onClick={() => invoke("media_previous")} aria-label="Faixa anterior">
          <PreviousIcon size={18} />
        </button>
        <button onClick={toggle} aria-label={media.status === "playing" ? "Pausar" : "Tocar"}>
          <PlayPauseIcon size={18} playing={media.status === "playing"} />
        </button>
        <button onClick={() => invoke("media_next")} aria-label="Próxima faixa">
          <NextIcon size={18} />
        </button>
      </div>
    </div>
  );
}
```

(O seek arrastável da barra de progresso mencionado na spec fica de fora desta implementação inicial — a barra aqui é só leitura; adicionar o arraste é incremento de UI puro, sem comando novo, que pode entrar numa revisão depois sem mudar nenhuma interface definida aqui.)

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `bun test src/lib/day.test.ts`
Expected: PASS

- [ ] **Step 5: Compile e verifique manualmente**

Run: `bun run build`
Expected: sem erros de tipo.

Manual: com música tocando, abra o painel expandido e confirme que a aba "Música" aparece e some quando a música para.

- [ ] **Step 6: Commit**

```bash
git add src/lib/day.ts src/lib/day.test.ts src/widget/MediaTab.tsx src/widget/Panel.tsx
git commit -m "feat: aba Música no painel expandido"
```

---

## Verificação final (manual, ponta a ponta)

Depois da Task 7, repita a verificação manual da seção 7 da spec: tocar uma faixa no Spotify desktop e no Chrome (YouTube) separadamente, confirmar capa/progresso/controles reais nos dois, testar Ctrl+Scroll com o timer de foco rodando ao mesmo tempo, parar a mídia e confirmar que o widget volta pra doca antiga.
