# Notas rápidas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um bloco de notas para escrever e desenhar (texto, caneta, formas, imagens), aberto por atalho global ou botão do painel, sobre o painel do widget ou numa janela, com histórico dentro da nota e galeria na aba "Notas" da configuração (no lugar do Projetos).

**Architecture:** Backend Rust guarda `notes.json` (atômico) + imagens em arquivos, expõe comandos e eventos; uma janela Tauri `note` (560×380) ou a forma `note` do widget (janela do widget passa a 560×380) hospedam o **mesmo** componente `NoteEditor` (React): uma folha com 3 camadas (imagens, texto, desenho em SVG). A lógica de desenho (geometria, histórico, título, filtro) é pura em `src/lib/` e testada com vitest.

**Tech Stack:** Rust + Tauri v2 (`cargo test`), React 19 + TypeScript + Vite (vitest via `bun run test`), crate `base64`, SVG/canvas do navegador.

**Spec:** `docs/superpowers/specs/2026-10-08-notas-rapidas-design.md`

## Global Constraints

- **A nota inteira (barra + folha) tem 560×380; a folha de desenho tem 560×320** (28 px da barra de modos + 28 px da faixa de ferramentas + 4 px de respiro). Todas as coordenadas dos objetos são em unidades da folha (560×320), com 1 casa decimal. *(Refina o "560×380" da spec; ver Ruling da Task 8.)*
- Janela do widget: `OPEN_SIZE` passa de 560×300 para **560×380**; o painel segue com 300 de altura.
- Atalho padrão `CommandOrControl+Alt+KeyN` (config `shortcut_note`); `note_placement` = `"overlay"` (padrão) ou `"window"`; arquivo de config antigo carrega com os padrões.
- `notes.json`: `{ "version": 1, "notes": [...] }`; gravação atômica; corrompido vira `notes.corrupt-<ms>.json`. Imagens em `<data>/notes/images/<16 hex>.<png|jpg|webp|gif>` (hash FNV-1a 64).
- Limites: texto 20 000 caracteres; 3 000 objetos/nota; 2 000 pontos/traço; 10 imagens/nota; 1 000 notas; imagem ≤ 8 MB no disco, ≤ 1600 px no lado maior.
- Ícones novos: mesma família da configuração (grade 24, traço 2, `round`, só `currentColor`).
- Gerenciador de pacotes **Bun** (`bun run test`, `bun run build`); não rodar `bun install` para trocar de lockfile (use `bun add` só se a task mandar e avise).
- Commits na branch `feat/widget-bordas-e-fluidez`, em português, sem `Co-Authored-By`, **sem push e sem PR**.

## Review Focus

1. `notes.json` meio gravado ou corrompido nunca apaga as notas (atômico + `.corrupt`); arquivo com UTF-8 inválido também (Task 3).
2. `read_note_image` não pode ler fora da pasta de imagens: nome do arquivo validado (`../x`, `C:\x`, maiúsculas, extensão estranha) (Task 4).
3. Trocar de nota ou fechar com o autosave pendente não perde o último traço nem grava nota vazia (Tasks 9 e 12).
4. Com a nota aberta sobre o painel, hover, perda de foco, auto-close e `set_widget_expanded(false)` não podem fechar a nota nem fazer o mouse atravessar a janela; as 3 bordas com a janela de 380 de altura (Tasks 5 e 13).
5. Os 3 atalhos entre si: um não pode roubar o outro, e config antiga sem `shortcut_note` abre com o padrão (Tasks 1 e 2).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src-tauri/src/config.rs` | `shortcut_note`, `NotePlacement`/`note_placement` |
| `src-tauri/src/shortcuts.rs` | 3 ações (`Toggle`, `Panel`, `Note`) |
| `src-tauri/src/notes.rs` (novo) | tipos, `sanitize`, `NotesStore`, arquivo atômico, imagens em disco |
| `src-tauri/src/note_window.rs` (novo) | janela `note`, overlay aberto?, abrir/focar/piscar |
| `src-tauri/src/commands.rs` | `list_notes`, `save_note`, `delete_note`, `save_note_image`, `read_note_image`, `read_image_file`, `open_note`, `close_note_window`, `set_note_overlay_open`; `set_shortcut` com "note" |
| `src-tauri/src/lib.rs` | registra tudo, `note_action`, estado das notas, prune no início |
| `src-tauri/src/widget.rs` | `OPEN_SIZE` 560×380 |
| `src-tauri/capabilities/default.json` | janela `note` |
| `src/lib/note.ts` (novo) | tipos e `SHEET` |
| `src/lib/noteGeometry.ts` (novo) | geometria pura (pontos, formas, hit-test, resize, setas) |
| `src/lib/noteHistory.ts` (novo) | desfazer/refazer |
| `src/lib/noteMeta.ts` (novo) | título, data, filtro, `newNote`, `fitInto`, `wrapText` |
| `src/lib/shell.ts` | forma `note`, `noteOpen` |
| `src/lib/tauri.ts`, `src/lib/types.ts` | wrappers, eventos e tipos |
| `src/note/NoteSvg.tsx` (novo) | desenha objetos (editor, miniatura, exportação) |
| `src/note/noteIcons.tsx` (novo) | ícones da barra da nota |
| `src/note/useNoteDoc.ts` (novo) | documento aberto, histórico, autosave |
| `src/note/imageImport.ts` (novo) | reduzir imagem, ler base64, colar/arrastar |
| `src/note/exportImage.ts` (novo) | "copiar como imagem" |
| `src/note/NoteHistory.tsx` (novo) | gaveta do histórico |
| `src/note/NoteEditor.tsx` (novo) | o editor |
| `src/note/note.css` (novo) | estilo do editor |
| `src/NoteWindow.tsx` (novo), `src/main.tsx` | janela `note` |
| `src/Widget.tsx`, `src/Widget.css`, `src/widget/Panel.tsx`, `src/widget/icons.tsx` | overlay e botão "Nota" |
| `src/settings/NotesSection.tsx` (novo), `icons.tsx`, `GeneralSection.tsx`, `App.tsx` | aba Notas, ícone, atalho |
| `README.md` | frase sobre as notas |

---

### Task 1: Config `shortcut_note` e `note_placement` (Rust + tipos)

**Files:**
- Modify: `src-tauri/src/config.rs` (struct, enum, `Default`, `normalized`, testes), `src-tauri/src/commands.rs` (`update_settings`)
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `NotePlacement { Overlay, Window }` (serde lowercase), `AppConfig.shortcut_note: String`, `AppConfig.note_placement: NotePlacement`, `DEFAULT_SHORTCUT_NOTE`; TS `NotePlacement = "overlay" | "window"`, `AppConfig.shortcut_note`, `AppConfig.note_placement`.

- [ ] **Step 1: Testes que falham** — no módulo `tests` de `config.rs` (antes do `}` final):

```rust
    #[test]
    fn the_note_settings_have_safe_defaults_and_old_files_get_them() {
        let c = AppConfig::default();
        assert_eq!(c.shortcut_note, "CommandOrControl+Alt+KeyN");
        assert_eq!(c.note_placement, NotePlacement::Overlay);
        let old = parse(r##"{"accent_color":"#112233"}"##);
        assert_eq!(old.shortcut_note, DEFAULT_SHORTCUT_NOTE);
        assert_eq!(old.note_placement, NotePlacement::Overlay);
    }

    #[test]
    fn the_note_placement_is_written_in_lower_case_and_read_back() {
        for (placement, text) in [(NotePlacement::Overlay, "overlay"), (NotePlacement::Window, "window")] {
            let raw = format!(r#"{{"note_placement":"{text}"}}"#);
            assert_eq!(parse(&raw).note_placement, placement);
            let json = serde_json::to_string(&AppConfig { note_placement: placement, ..AppConfig::default() }).unwrap();
            assert!(json.contains(&format!("\"note_placement\":\"{text}\"")), "{json}");
        }
    }

    #[test]
    fn a_blank_note_shortcut_falls_back_to_the_default() {
        let c = AppConfig { shortcut_note: "  ".into(), ..AppConfig::default() }.normalized();
        assert_eq!(c.shortcut_note, DEFAULT_SHORTCUT_NOTE);
    }
```

- [ ] **Step 2: Rodar e ver falhar** — `cargo test --manifest-path src-tauri/Cargo.toml config::tests`. Expected: erro de compilação (`NotePlacement`, `shortcut_note` não existem).

- [ ] **Step 3: Implementar** em `config.rs`:

```rust
pub const DEFAULT_SHORTCUT_NOTE: &str = "CommandOrControl+Alt+KeyN";

/// Where a quick note opens.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotePlacement {
    /// Over the widget's panel, hanging from the screen edge.
    #[default]
    Overlay,
    /// In its own window, centered on the monitor.
    Window,
}
```

Na struct `AppConfig`, depois de `shortcut_panel`: 

```rust
    /// Open a new quick note.
    pub shortcut_note: String,
    /// Where a note opens: over the panel or in its own window.
    pub note_placement: NotePlacement,
```

No `Default`: `shortcut_note: DEFAULT_SHORTCUT_NOTE.to_string(), note_placement: NotePlacement::default(),`. Em `normalized`, depois da linha de `shortcut_panel`: `self.shortcut_note = or_default(self.shortcut_note, DEFAULT_SHORTCUT_NOTE);`.

Em `commands.rs`, em `update_settings`, depois de `config.shortcut_panel = state.config.shortcut_panel.clone();` adicionar `config.shortcut_note = state.config.shortcut_note.clone();`.

Em `src/lib/types.ts`: `export type NotePlacement = "overlay" | "window";` junto dos outros tipos e, no `AppConfig`, depois de `shortcut_panel: string;`:

```ts
  shortcut_note: string;
  /** Where a quick note opens. */
  note_placement: NotePlacement;
```

- [ ] **Step 4: Rodar e ver passar** — `cargo test --manifest-path src-tauri/Cargo.toml` e `bun run build`. Expected: verdes.

- [ ] **Step 5: Commit** — `git add src-tauri/src/config.rs src-tauri/src/commands.rs src/lib/types.ts && git commit -m "feat: config shortcut_note e note_placement para as notas rápidas"`.

---

### Task 2: Três atalhos globais (Rust)

**Files:**
- Modify: `src-tauri/src/shortcuts.rs`, `src-tauri/src/commands.rs` (`set_shortcut`), `src-tauri/src/lib.rs` (handler e registro)
- Modify: `src/lib/tauri.ts` (`setShortcut`)

**Interfaces:**
- Consumes: `AppConfig.shortcut_note` (Task 1).
- Produces: `Action::Note`; `shortcuts::find_action(active: &[Option<Shortcut>; 3], shortcut: &Shortcut) -> Option<Action>`; `set_shortcut("note", text)`; no `lib.rs`, `note_action(app)` (corpo trocado na Task 7).

- [ ] **Step 1: Testes que falham** — no módulo `tests` de `shortcuts.rs`:

```rust
    #[test]
    fn each_action_finds_its_own_shortcut_among_three() {
        let (a, b, c) = (parse("Alt+F9").unwrap(), parse("Alt+F10").unwrap(), parse("Alt+F11").unwrap());
        let active = [Some(a), Some(b), Some(c)];
        assert_eq!(find_action(&active, &a), Some(Action::Toggle));
        assert_eq!(find_action(&active, &b), Some(Action::Panel));
        assert_eq!(find_action(&active, &c), Some(Action::Note));
        assert_eq!(find_action(&active, &parse("Alt+F12").unwrap()), None);
        assert_eq!(find_action(&[None, None, None], &a), None);
    }

    #[test]
    fn the_three_actions_use_three_distinct_slots() {
        let slots: Vec<usize> = [Action::Toggle, Action::Panel, Action::Note].iter().map(|a| a.slot()).collect();
        assert_eq!(slots, vec![0, 1, 2]);
    }
```

- [ ] **Step 2: Rodar e ver falhar** — `cargo test --manifest-path src-tauri/Cargo.toml shortcuts::tests`. Expected: erro de compilação (`Action::Note`, `find_action`).

- [ ] **Step 3: Implementar** em `shortcuts.rs`:

1. Docstring do módulo: `//! The three global shortcuts, configurable: start/pause, open the panel and a new quick note.`
2. `enum Action`: adicionar `/// Open a new quick note.` + `Note,`; em `slot()`: `Action::Note => 2,`.
3. Trocar `static ACTIVE` e `active()`:

```rust
type Slots = [Option<Shortcut>; 3];

/// What is registered right now: [toggle, panel, note].
static ACTIVE: Mutex<Slots> = Mutex::new([None, None, None]);

fn active() -> Slots {
    *ACTIVE.lock().unwrap_or_else(|e| e.into_inner())
}
```
4. Trocar `action_for` por:

```rust
pub fn find_action(active: &Slots, shortcut: &Shortcut) -> Option<Action> {
    [Action::Toggle, Action::Panel, Action::Note]
        .into_iter()
        .find(|action| active[action.slot()] == Some(*shortcut))
}

pub fn action_for(shortcut: &Shortcut) -> Option<Action> {
    find_action(&active(), shortcut)
}
```
5. Em `check_conflict`, a mensagem passa a `"os atalhos não podem ser iguais"` (o teste existente exige só a palavra "iguais").
6. Em `set`, trocar `let (mine, other) = (current[action.slot()], current[1 - action.slot()]); check_conflict(new, other)?;` por:

```rust
    let mine = current[action.slot()];
    for (slot, other) in current.iter().enumerate() {
        if slot != action.slot() {
            check_conflict(new, *other)?;
        }
    }
```

Em `commands.rs`, em `set_shortcut`: docstring "`which` is "toggle", "panel" or "note"", `"note" => shortcuts::Action::Note,` e no `match action`: `shortcuts::Action::Note => state.config.shortcut_note = text,`.

Em `lib.rs`: no handler adicionar `Some(shortcuts::Action::Note) => note_action(app),`; no `wanted`: `(shortcuts::Action::Note, state.config.shortcut_note.clone()),`; e, junto de `panel_action`, a função provisória:

```rust
/// The note shortcut. (The real work arrives with the note window.)
fn note_action(_app: &AppHandle) {}
```

Em `src/lib/tauri.ts`: `setShortcut = (which: "toggle" | "panel" | "note", text: string)`.

- [ ] **Step 4: Rodar e ver passar** — `cargo test --manifest-path src-tauri/Cargo.toml` (todos), `bun run build`.

- [ ] **Step 5: Commit** — `git add src-tauri src/lib/tauri.ts && git commit -m "feat: terceiro atalho global (nota rápida) e conflitos entre os três"`.

---

### Task 3: `notes.rs` — modelo, limites e arquivo atômico (Rust)

**Files:**
- Create: `src-tauri/src/notes.rs`
- Modify: `src-tauri/src/lib.rs` (`mod notes;`)

**Interfaces:**
- Produces: `Note`, `NoteObject`, `ShapeKind`, `NotesStore` (`upsert(note, now_ms) -> Result<(), String>`, `remove(id) -> bool`, `images_in_use() -> HashSet<String>`), `sanitize`, `valid_image_name`, `parse`, `load_from(path, stamp_ms)`, `save_to(path, store)`, `load()`, `save(store)`, `NotesShared(pub Mutex<NotesStore>)` com `lock()`, constantes `MAX_*`.

- [ ] **Step 1: Escrever o módulo com os testes primeiro** — criar `src-tauri/src/notes.rs` só com o bloco de testes abaixo no fim e as declarações vazias necessárias não existem ainda (o arquivo não compila): este é o RED. Cole **só** isto:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("focusbrew-notes-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn note(id: &str, text: &str) -> Note {
        Note { id: id.into(), text: text.into(), ..Note::default() }
    }

    fn stroke(points: usize) -> NoteObject {
        NoteObject::Stroke { color: "#ff0000".into(), width: 3.0, points: (0..points).map(|i| [i as f64, 1.0]).collect() }
    }

    #[test]
    fn an_empty_note_is_not_kept_and_removes_a_saved_one() {
        let mut store = NotesStore::default();
        store.upsert(note("a", "hello"), 10).unwrap();
        assert_eq!(store.notes.len(), 1);
        store.upsert(note("a", "   "), 20).unwrap();
        assert!(store.notes.is_empty());
        store.upsert(note("b", ""), 30).unwrap();
        assert!(store.notes.is_empty());
    }

    #[test]
    fn notes_come_most_recently_updated_first_and_keep_their_creation_date() {
        let mut store = NotesStore::default();
        store.upsert(note("a", "first"), 100).unwrap();
        store.upsert(note("b", "second"), 200).unwrap();
        assert_eq!(store.notes[0].id, "b");
        store.upsert(note("a", "first, edited"), 300).unwrap();
        assert_eq!(store.notes[0].id, "a");
        assert_eq!(store.notes[0].created_ms, 100);
        assert_eq!(store.notes[0].updated_ms, 300);
    }

    #[test]
    fn a_note_without_id_is_refused_and_the_note_limit_is_enforced() {
        let mut store = NotesStore::default();
        assert!(store.upsert(note("  ", "x"), 1).is_err());
        for i in 0..MAX_NOTES {
            store.upsert(note(&format!("n{i}"), "x"), i as i64).unwrap();
        }
        assert!(store.upsert(note("one-more", "x"), 9999).is_err());
        store.upsert(note("n0", "edited"), 10_000).unwrap(); // editing is still fine
    }

    #[test]
    fn limits_are_applied_to_text_objects_and_points() {
        let mut n = note("a", &"é".repeat(MAX_TEXT_CHARS + 50));
        n.objects = (0..MAX_OBJECTS + 5).map(|_| stroke(3)).collect();
        let n = sanitize(n);
        assert_eq!(n.text.chars().count(), MAX_TEXT_CHARS);
        assert_eq!(n.objects.len(), MAX_OBJECTS);
        let long = sanitize(Note { objects: vec![stroke(MAX_POINTS + 10)], ..note("b", "x") });
        match &long.objects[0] {
            NoteObject::Stroke { points, .. } => assert_eq!(points.len(), MAX_POINTS),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn bad_values_are_cleaned_not_trusted() {
        let n = sanitize(Note {
            objects: vec![
                NoteObject::Stroke { color: "red".into(), width: 9999.0, points: vec![[f64::NAN, 5000.0]] },
                NoteObject::Stroke { color: "#00ff00".into(), width: 2.0, points: vec![] }, // no points: dropped
                NoteObject::Shape { kind: ShapeKind::Rect, color: "#12345".into(), width: -3.0, fill: true, x1: 0.04, y1: 1.26, x2: 10.0, y2: 10.0 },
            ],
            ..note("a", "x")
        });
        assert_eq!(n.objects.len(), 2);
        match &n.objects[0] {
            NoteObject::Stroke { color, width, points } => {
                assert_eq!((color.as_str(), *width), ("#FFFFFF", 24.0));
                assert_eq!(points[0], [0.0, 2000.0]);
            }
            other => panic!("{other:?}"),
        }
        match &n.objects[1] {
            NoteObject::Shape { color, width, x1, y1, .. } => {
                assert_eq!((color.as_str(), *width, *x1, *y1), ("#FFFFFF", 1.0, 0.0, 1.3));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn only_well_formed_image_names_survive_and_at_most_ten_images() {
        let ok = "0123456789abcdef.png".to_string();
        let image = |file: &str| NoteObject::Image { file: file.into(), x: 0.0, y: 0.0, w: 10.0, h: 10.0 };
        let mut objects = vec![image("../secret.png"), image("C:\\x.png"), image("0123456789ABCDEF.png"), image("0123456789abcdef.exe"), image(&ok)];
        objects.extend((0..20).map(|_| image(&ok)));
        let n = sanitize(Note { objects, ..note("a", "x") });
        assert_eq!(n.objects.len(), MAX_IMAGES);
        assert!(valid_image_name(&ok));
        assert!(!valid_image_name("0123456789abcdef"));
        assert!(!valid_image_name("0123456789abcde.png"));
    }

    #[test]
    fn images_in_use_lists_the_files_of_every_note() {
        let mut store = NotesStore::default();
        let with = |id: &str, file: &str| Note {
            objects: vec![NoteObject::Image { file: file.into(), x: 0.0, y: 0.0, w: 5.0, h: 5.0 }],
            ..note(id, "x")
        };
        store.upsert(with("a", "0000000000000001.png"), 1).unwrap();
        store.upsert(with("b", "0000000000000002.jpg"), 2).unwrap();
        let used = store.images_in_use();
        assert!(used.contains("0000000000000001.png") && used.contains("0000000000000002.jpg"));
        assert_eq!(used.len(), 2);
        assert!(store.remove("a"));
        assert_eq!(store.images_in_use().len(), 1);
        assert!(!store.remove("nope"));
    }

    #[test]
    fn a_saved_file_reads_back_the_same_and_leaves_no_temp_file() {
        let dir = temp("roundtrip");
        let path = dir.join("notes.json");
        let mut store = NotesStore::default();
        let mut n = note("a", "hello");
        n.objects = vec![stroke(4)];
        store.upsert(n, 5).unwrap();
        save_to(&path, &store).unwrap();
        let back = load_from(&path, 1);
        assert_eq!(back.notes, store.notes);
        assert!(!dir.join("notes.json.tmp").exists());
        assert!(fs::read_to_string(&path).unwrap().contains("\"version\":1"));
    }

    // Review focus: a broken file must never be silently overwritten.
    #[test]
    fn a_corrupt_file_is_kept_aside_and_the_app_starts_empty() {
        let dir = temp("corrupt");
        let path = dir.join("notes.json");
        for (i, bytes) in [b"{ not json".to_vec(), vec![0xff, 0xfe, 0x00], b"[1,2]".to_vec()].into_iter().enumerate() {
            fs::write(&path, &bytes).unwrap();
            let store = load_from(&path, 100 + i as i64);
            assert!(store.notes.is_empty());
            assert!(!path.exists(), "the broken file must be moved away");
            assert_eq!(fs::read(dir.join(format!("notes.corrupt-{}.json", 100 + i as i64))).unwrap(), bytes);
        }
    }

    #[test]
    fn a_missing_or_empty_file_is_just_an_empty_store() {
        let dir = temp("missing");
        let path = dir.join("notes.json");
        assert!(load_from(&path, 1).notes.is_empty());
        fs::write(&path, "  \n").unwrap();
        assert!(load_from(&path, 1).notes.is_empty());
        assert!(path.exists(), "an empty file is not a corrupt one");
    }

    #[test]
    fn a_file_with_missing_fields_still_loads() {
        let dir = temp("partial");
        let path = dir.join("notes.json");
        fs::write(&path, r#"{"notes":[{"id":"a","text":"hi"}]}"#).unwrap();
        let store = load_from(&path, 1);
        assert_eq!(store.notes.len(), 1);
        assert_eq!(store.notes[0].text, "hi");
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — adicionar `mod notes;` em `lib.rs` (junto dos outros `mod`) e rodar `cargo test --manifest-path src-tauri/Cargo.toml notes::tests`. Expected: erros de compilação (`Note`, `NotesStore`... não existem).

- [ ] **Step 3: Implementar** — colocar **antes** do bloco `#[cfg(test)]` de `notes.rs`:

```rust
//! Quick notes: text + drawing + images. One JSON file (`notes.json`) written
//! atomically, plus an images folder (see the image functions below).

use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};

use crate::config::{data_dir, normalize_hex};

pub const MAX_TEXT_CHARS: usize = 20_000;
pub const MAX_OBJECTS: usize = 3_000;
pub const MAX_POINTS: usize = 2_000;
pub const MAX_IMAGES: usize = 10;
pub const MAX_NOTES: usize = 1_000;
const COORD_MIN: f64 = -1_000.0;
const COORD_MAX: f64 = 2_000.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShapeKind {
    Rect,
    Ellipse,
    Triangle,
    Line,
    Arrow,
}

/// One thing drawn on the sheet, in coordinates of the sheet (560×320).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum NoteObject {
    Stroke { color: String, width: f64, points: Vec<[f64; 2]> },
    Shape { kind: ShapeKind, color: String, width: f64, fill: bool, x1: f64, y1: f64, x2: f64, y2: f64 },
    Image { file: String, x: f64, y: f64, w: f64, h: f64 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct Note {
    pub id: String,
    pub created_ms: i64,
    pub updated_ms: i64,
    pub text: String,
    pub objects: Vec<NoteObject>,
}

impl Note {
    /// No text, no drawing, no image: not worth keeping.
    pub fn is_empty(&self) -> bool {
        self.text.trim().is_empty() && self.objects.is_empty()
    }
}

fn clean_coord(v: f64) -> f64 {
    let v = if v.is_finite() { v.clamp(COORD_MIN, COORD_MAX) } else { 0.0 };
    (v * 10.0).round() / 10.0
}

fn clean_color(color: &str) -> String {
    normalize_hex(color).unwrap_or_else(|| "#FFFFFF".to_string())
}

fn clean_width(w: f64) -> f64 {
    if w.is_finite() { w.clamp(1.0, 24.0) } else { 3.0 }
}

fn clean_size(v: f64) -> f64 {
    if v.is_finite() { v.clamp(1.0, 2000.0) } else { 1.0 }
}

/// "0123456789abcdef.png": 16 lowercase hex digits and a known extension.
/// Nothing else may name a file in the images folder.
pub fn valid_image_name(name: &str) -> bool {
    let Some((stem, ext)) = name.split_once('.') else { return false };
    stem.len() == 16
        && stem.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
        && matches!(ext, "png" | "jpg" | "webp" | "gif")
}

/// Brings a note inside the limits and cleans every value the front-end sent.
pub fn sanitize(mut note: Note) -> Note {
    note.text = note.text.chars().take(MAX_TEXT_CHARS).collect();
    let mut images = 0;
    let mut objects = Vec::new();
    for object in note.objects {
        if objects.len() >= MAX_OBJECTS {
            break;
        }
        match object {
            NoteObject::Stroke { color, width, points } => {
                let points: Vec<[f64; 2]> = points
                    .into_iter()
                    .take(MAX_POINTS)
                    .map(|[x, y]| [clean_coord(x), clean_coord(y)])
                    .collect();
                if points.is_empty() {
                    continue;
                }
                objects.push(NoteObject::Stroke { color: clean_color(&color), width: clean_width(width), points });
            }
            NoteObject::Shape { kind, color, width, fill, x1, y1, x2, y2 } => objects.push(NoteObject::Shape {
                kind,
                color: clean_color(&color),
                width: clean_width(width),
                fill,
                x1: clean_coord(x1),
                y1: clean_coord(y1),
                x2: clean_coord(x2),
                y2: clean_coord(y2),
            }),
            NoteObject::Image { file, x, y, w, h } => {
                if !valid_image_name(&file) || images >= MAX_IMAGES {
                    continue;
                }
                images += 1;
                objects.push(NoteObject::Image { file, x: clean_coord(x), y: clean_coord(y), w: clean_size(w), h: clean_size(h) });
            }
        }
    }
    note.objects = objects;
    note
}

#[derive(Debug, Clone, Default)]
pub struct NotesStore {
    /// Most recently updated first.
    pub notes: Vec<Note>,
}

impl NotesStore {
    /// Saves a note (new or edited). An empty one is not kept (and removes the
    /// saved one). `updated_ms` is set here; `created_ms` is kept once set.
    pub fn upsert(&mut self, note: Note, now_ms: i64) -> Result<(), String> {
        if note.id.trim().is_empty() {
            return Err("nota sem id".into());
        }
        let mut note = sanitize(note);
        if note.is_empty() {
            self.notes.retain(|n| n.id != note.id);
            return Ok(());
        }
        note.updated_ms = now_ms;
        if let Some(existing) = self.notes.iter_mut().find(|n| n.id == note.id) {
            note.created_ms = existing.created_ms;
            *existing = note;
        } else {
            if self.notes.len() >= MAX_NOTES {
                return Err(format!("limite de {MAX_NOTES} notas"));
            }
            if note.created_ms <= 0 {
                note.created_ms = now_ms;
            }
            self.notes.push(note);
        }
        self.notes
            .sort_by(|a, b| b.updated_ms.cmp(&a.updated_ms).then(b.created_ms.cmp(&a.created_ms)));
        Ok(())
    }

    pub fn remove(&mut self, id: &str) -> bool {
        let before = self.notes.len();
        self.notes.retain(|n| n.id != id);
        self.notes.len() != before
    }

    /// Every image file some note still uses.
    pub fn images_in_use(&self) -> HashSet<String> {
        self.notes
            .iter()
            .flat_map(|n| n.objects.iter())
            .filter_map(|o| match o {
                NoteObject::Image { file, .. } => Some(file.clone()),
                _ => None,
            })
            .collect()
    }
}

/// The notes in memory, shared with the commands.
pub struct NotesShared(pub Mutex<NotesStore>);

impl NotesShared {
    pub fn lock(&self) -> MutexGuard<'_, NotesStore> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[derive(Serialize, Deserialize)]
struct NotesFile {
    #[serde(default = "one")]
    version: u32,
    #[serde(default)]
    notes: Vec<Note>,
}

fn one() -> u32 {
    1
}

pub fn parse(raw: &str) -> Result<NotesStore, String> {
    let file: NotesFile = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    Ok(NotesStore { notes: file.notes.into_iter().map(sanitize).collect() })
}

/// Reads the notes. A missing or empty file is an empty store; a file that
/// cannot be read as notes is moved to `notes.corrupt-<stamp>.json` (never
/// overwritten) and the store starts empty.
pub fn load_from(path: &Path, stamp_ms: i64) -> NotesStore {
    let Ok(bytes) = fs::read(path) else { return NotesStore::default() };
    if bytes.iter().all(|b| b.is_ascii_whitespace()) {
        return NotesStore::default();
    }
    match String::from_utf8(bytes).ok().and_then(|raw| parse(&raw).ok()) {
        Some(store) => store,
        None => {
            let aside = path.with_file_name(format!("notes.corrupt-{stamp_ms}.json"));
            let _ = fs::rename(path, aside);
            NotesStore::default()
        }
    }
}

/// Writes to a temp file and renames it over the real one, so a crash in the
/// middle never leaves half a file.
pub fn save_to(path: &Path, store: &NotesStore) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let file = NotesFile { version: 1, notes: store.notes.clone() };
    let raw = serde_json::to_string(&file).map_err(io::Error::other)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw)?;
    fs::rename(&tmp, path)
}

fn notes_path() -> PathBuf {
    data_dir().join("notes.json")
}

pub fn load() -> NotesStore {
    load_from(&notes_path(), crate::tracker::now_ms())
}

pub fn save(store: &NotesStore) -> io::Result<()> {
    save_to(&notes_path(), store)
}
```

- [ ] **Step 4: Rodar e ver passar** — `cargo test --manifest-path src-tauri/Cargo.toml notes::tests`; depois `cargo test --manifest-path src-tauri/Cargo.toml`. Expected: verdes, sem warnings (se `notes::*` ainda não usado fora dos testes, o `#![allow(dead_code)]` **não** é necessário: o módulo é `pub` no crate de biblioteca; se aparecerem avisos `dead_code`, registre um Ruling e deixe para as Tasks 4 e 7 usarem).

- [ ] **Step 5: Commit** — `git add src-tauri/src/notes.rs src-tauri/src/lib.rs && git commit -m "feat: armazenamento das notas (modelo, limites, arquivo atômico, arquivo corrompido)"`.

---

### Task 4: Imagens em disco (Rust)

**Files:**
- Modify: `src-tauri/src/notes.rs` (funções de imagem + testes), `src-tauri/Cargo.toml` (`base64`)

**Interfaces:**
- Consumes: `valid_image_name` (Task 3).
- Produces: `MAX_IMAGE_BYTES`, `image_file_name(bytes, ext) -> Result<String, String>`, `store_image_in(dir, bytes, ext)`, `read_image_in(dir, file)`, `prune_images_in(dir, in_use) -> usize`, `mime_for(file) -> &'static str`, e os atalhos `store_image`, `read_image`, `prune_images(in_use)` (pasta real).

- [ ] **Step 1: Testes que falham** — no módulo `tests` de `notes.rs`:

```rust
    #[test]
    fn an_image_is_stored_by_content_and_the_same_bytes_share_one_file() {
        let dir = temp("images");
        let a = store_image_in(&dir, b"fake png bytes", "png").unwrap();
        let b = store_image_in(&dir, b"fake png bytes", "PNG").unwrap();
        let c = store_image_in(&dir, b"other bytes", ".jpeg").unwrap();
        assert_eq!(a, b);
        assert!(valid_image_name(&a) && a.ends_with(".png"));
        assert!(c.ends_with(".jpg"));
        assert_eq!(read_image_in(&dir, &a).unwrap(), b"fake png bytes");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
    }

    #[test]
    fn unsupported_empty_or_huge_images_are_refused() {
        let dir = temp("refused");
        assert!(store_image_in(&dir, b"x", "exe").is_err());
        assert!(store_image_in(&dir, b"x", "svg").is_err());
        assert!(store_image_in(&dir, b"", "png").is_err());
        assert!(store_image_in(&dir, &vec![0u8; MAX_IMAGE_BYTES + 1], "png").is_err());
    }

    // Review focus: the name comes from the front-end; it must not reach outside the folder.
    #[test]
    fn reading_an_image_refuses_anything_that_is_not_one_of_our_names() {
        let dir = temp("traversal");
        fs::write(dir.join("secret.txt"), "top secret").unwrap();
        for bad in ["../secret.txt", "..\\secret.txt", "secret.txt", "C:\\Windows\\win.ini", "/etc/passwd", "", "0123456789ABCDEF.png", "0123456789abcdef.png/../x"] {
            assert!(read_image_in(&dir, bad).is_err(), "{bad}");
        }
        assert!(read_image_in(&dir, "0123456789abcdef.png").is_err(), "valid name, but no such file");
    }

    #[test]
    fn pruning_removes_only_unused_images_and_never_foreign_files() {
        let dir = temp("prune");
        let keep = store_image_in(&dir, b"keep me", "png").unwrap();
        let drop = store_image_in(&dir, b"drop me", "png").unwrap();
        fs::write(dir.join("readme.txt"), "not ours").unwrap();
        let used: HashSet<String> = [keep.clone()].into_iter().collect();
        assert_eq!(prune_images_in(&dir, &used), 1);
        assert!(dir.join(&keep).exists());
        assert!(!dir.join(&drop).exists());
        assert!(dir.join("readme.txt").exists());
        assert_eq!(prune_images_in(&dir.join("nope"), &used), 0, "a missing folder is fine");
    }

    #[test]
    fn the_mime_type_follows_the_extension() {
        assert_eq!(mime_for("0123456789abcdef.png"), "image/png");
        assert_eq!(mime_for("0123456789abcdef.jpg"), "image/jpeg");
        assert_eq!(mime_for("0123456789abcdef.webp"), "image/webp");
        assert_eq!(mime_for("0123456789abcdef.gif"), "image/gif");
    }
```

- [ ] **Step 2: Rodar e ver falhar** — `cargo test --manifest-path src-tauri/Cargo.toml notes::tests`. Expected: erro de compilação (funções de imagem não existem).

- [ ] **Step 3: Implementar** — em `Cargo.toml`, em `[dependencies]`: `base64 = "0.22"`. Em `notes.rs`, antes do bloco de testes:

```rust
pub const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;

/// FNV-1a, 64 bits: a stable name from the bytes (std's hasher may change).
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// "<16 hex>.<ext>" for these bytes; `ext` may come with a dot or in capitals.
pub fn image_file_name(bytes: &[u8], ext: &str) -> Result<String, String> {
    let ext = match ext.trim().trim_start_matches('.').to_ascii_lowercase().as_str() {
        "png" => "png",
        "jpg" | "jpeg" => "jpg",
        "webp" => "webp",
        "gif" => "gif",
        _ => return Err("formato de imagem não suportado".into()),
    };
    if bytes.is_empty() {
        return Err("imagem vazia".into());
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("imagem grande demais".into());
    }
    Ok(format!("{:016x}.{ext}", fnv1a(bytes)))
}

pub fn mime_for(file: &str) -> &'static str {
    match file.rsplit('.').next() {
        Some("jpg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "image/png",
    }
}

pub fn store_image_in(dir: &Path, bytes: &[u8], ext: &str) -> Result<String, String> {
    let name = image_file_name(bytes, ext)?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(&name);
    if !path.exists() {
        fs::write(&path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(name)
}

pub fn read_image_in(dir: &Path, file: &str) -> Result<Vec<u8>, String> {
    if !valid_image_name(file) {
        return Err("nome de imagem inválido".into());
    }
    fs::read(dir.join(file)).map_err(|e| e.to_string())
}

/// Deletes the images no note uses. Only files with our own names are touched.
pub fn prune_images_in(dir: &Path, in_use: &HashSet<String>) -> usize {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if valid_image_name(&name) && !in_use.contains(&name) && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

fn images_dir() -> PathBuf {
    data_dir().join("notes").join("images")
}

pub fn store_image(bytes: &[u8], ext: &str) -> Result<String, String> {
    store_image_in(&images_dir(), bytes, ext)
}

pub fn read_image(file: &str) -> Result<Vec<u8>, String> {
    read_image_in(&images_dir(), file)
}

pub fn prune_images(in_use: &HashSet<String>) -> usize {
    prune_images_in(&images_dir(), in_use)
}
```

- [ ] **Step 4: Rodar e ver passar** — `cargo test --manifest-path src-tauri/Cargo.toml` (todos).

- [ ] **Step 5: Commit** — `git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/notes.rs && git commit -m "feat: imagens das notas em arquivos (nome por conteúdo, leitura segura, limpeza)"`.

---

### Task 5: Janela do widget com 380 de altura (Rust)

**Files:**
- Modify: `src-tauri/src/widget.rs` (`OPEN_SIZE` e testes)

**Interfaces:**
- Produces: `OPEN_SIZE = (560.0, 380.0)`.

- [ ] **Step 1: Testes que falham** — em `widget.rs`, módulo `layout_tests`, trocar os valores esperados:

| Teste | De | Para |
|---|---|---|
| `the_window_is_always_the_panel_size` | `(560.0, 300.0)`, `(476.0, 255.0)`, `(700.0, 375.0)` | `(560.0, 380.0)`, `(476.0, 323.0)`, `(700.0, 475.0)` |
| `the_zone_and_the_window_share_the_same_top_center` | `(680, 0, 560, 300)` | `(680, 0, 560, 380)` |
| `the_left_edge_is_glued...` | `(0, 390, 560, 300)` | `(0, 350, 560, 380)` |
| `the_right_edge_is_glued...` | `(1360, 390, 560, 300)` | `(1360, 350, 560, 380)` |

Renomear `the_window_is_always_the_panel_size` para `the_window_is_always_the_note_size`. Os demais testes usam `Layout` próprios e não mudam.

- [ ] **Step 2: Rodar e ver falhar** — `cargo test --manifest-path src-tauri/Cargo.toml widget::layout_tests`. Expected: FAIL (a janela ainda é 560×300).

- [ ] **Step 3: Implementar** — em `widget.rs`: `pub const OPEN_SIZE: (f64, f64) = (560.0, 380.0);` e o comentário acima: `/// ... always as big as the biggest shape (the quick note, 560×380; the panel is 300 tall inside it) ...`.

- [ ] **Step 4: Rodar e ver passar** — `cargo test --manifest-path src-tauri/Cargo.toml` e `bun run test` (os testes de `shell.test.ts` não mudam ainda).

- [ ] **Step 5: Commit** — `git add src-tauri/src/widget.rs && git commit -m "feat: janela do widget com 560×380 para caber a nota (painel segue com 300)"`.

---

### Task 6: Forma `note` no `pickShape` (TypeScript)

**Files:**
- Modify: `src/lib/shell.ts`, `src/lib/shell.test.ts`, `src/Widget.tsx` (só passa `noteOpen: false` por enquanto)

**Interfaces:**
- Produces: `NOTE: Size = { width: 560, height: 380 }`; `ShapeKind` ganha `"note"`; `ShapeContext.noteOpen: boolean`; ordem: escondido > nota > painel > caixa > barra; `motionBetween` com `note` acima de `panel`.

- [ ] **Step 1: Testes que falham** — em `shell.test.ts`: no `ctx` padrão adicionar `noteOpen: false,`; e adicionar:

```ts
describe("the quick note shape", () => {
  it("is the biggest shape and wins over the panel, the box and the bar", () => {
    for (const edge of EDGES) {
      for (const status of STATUSES) {
        for (const phase of ["closed", "open", "closing"] as const) {
          const shape = pickShape(ctx({ noteOpen: true, status, phase, edge }));
          expect(shape.kind).toBe("note");
          expect(shape.shell).toEqual({ width: 560, height: 380 });
          expect(shape.hit).toEqual({ width: 560, height: 380 });
        }
      }
    }
  });

  it("still loses to a hidden widget", () => {
    expect(pickShape(ctx({ noteOpen: true, visible: false })).kind).toBe("hidden");
  });

  it("grows from the panel to the note and shrinks back", () => {
    expect(motionBetween("panel", "note")).toBe("grow");
    expect(motionBetween("bar", "note")).toBe("grow");
    expect(motionBetween("note", "panel")).toBe("shrink");
    expect(motionBetween("note", "note")).toBe("same");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun run test -- src/lib/shell.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar** em `shell.ts`: `export const NOTE: Size = { width: 560, height: 380 };`; `export type ShapeKind = "hidden" | "bar" | "box" | "panel" | "note";`; em `ShapeContext` adicionar `/** A quick note is open over the widget. */ noteOpen: boolean;`; em `pickShape`, desestruturar `noteOpen` e, logo depois do `if (!visible)`, `if (noteOpen) return { kind: "note", shell: NOTE, hit: NOTE };`; atualizar o comentário ("hidden > open note > open panel > ..."); em `RANK`: `{ hidden: 0, bar: 1, box: 2, panel: 3, note: 4 }`. Em `Widget.tsx`, na chamada de `pickShape`, adicionar `noteOpen: false,`.

- [ ] **Step 4: Rodar e ver passar** — `bun run test` e `bun run build`.

- [ ] **Step 5: Commit** — `git add src/lib/shell.ts src/lib/shell.test.ts src/Widget.tsx && git commit -m "feat: forma note (560×380) no pickShape e na ordem de movimento"`.

---

### Task 7: Comandos, eventos e janela `note` (Rust + roteamento mínimo)

**Files:**
- Create: `src-tauri/src/note_window.rs`, `src/NoteWindow.tsx` (provisório)
- Modify: `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src/main.tsx`, `src/lib/tauri.ts`

**Interfaces:**
- Consumes: `NotesShared`, `Note`, `store_image`, `read_image`, `prune_images`, `mime_for` (Tasks 3 e 4), `NotePlacement` (Task 1).
- Produces (Rust): `note_window::{NOTE_SIZE, wants_window, is_open, set_overlay_open, open, focus_and_flash, close_window}`; comandos `list_notes`, `save_note(note)`, `delete_note(id)`, `save_note_image(data_base64, ext) -> String`, `read_note_image(file) -> String` (data URL), `read_image_file(path) -> {ext, data_base64}`, `open_note(id)`, `close_note_window`, `set_note_overlay_open(open)`; eventos `notes-changed`, `open-note` (payload `string | null`), `note-flash`.
- Produces (TS, `tauri.ts`): `listNotes`, `saveNote`, `deleteNote`, `saveNoteImage`, `readNoteImage`, `readImageFile`, `openNote`, `closeNoteWindow`, `setNoteOverlayOpen`, `onNotesChanged`, `onOpenNote`, `onNoteFlash`.

- [ ] **Step 1: Teste que falha** — criar `src-tauri/src/note_window.rs` só com:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::NotePlacement;

    #[test]
    fn a_note_opens_in_a_window_when_asked_or_when_the_widget_is_hidden() {
        assert!(!wants_window(NotePlacement::Overlay, true));
        assert!(wants_window(NotePlacement::Overlay, false));
        assert!(wants_window(NotePlacement::Window, true));
        assert!(wants_window(NotePlacement::Window, false));
    }
}
```

Adicionar `mod note_window;` em `lib.rs`. Rodar `cargo test --manifest-path src-tauri/Cargo.toml note_window`. Expected: erro de compilação (`wants_window`).

- [ ] **Step 2: Implementar `note_window.rs`** — antes do bloco de testes:

```rust
//! The quick note's own window, and the bookkeeping that tells the shortcut
//! whether a note is already open (in that window or over the widget).

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::config::NotePlacement;

/// The whole note (bar + sheet), in logical px.
pub const NOTE_SIZE: (f64, f64) = (560.0, 380.0);

/// Whether the note is open over the widget (set by the front-end).
static OVERLAY_OPEN: AtomicBool = AtomicBool::new(false);

pub fn set_overlay_open(open: bool) {
    OVERLAY_OPEN.store(open, Ordering::Relaxed);
}

fn window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("note").and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

pub fn is_open(app: &AppHandle) -> bool {
    window_visible(app) || OVERLAY_OPEN.load(Ordering::Relaxed)
}

/// A hidden widget has no panel to hang the note from: it gets a window.
pub fn wants_window(placement: NotePlacement, widget_visible: bool) -> bool {
    placement == NotePlacement::Window || !widget_visible
}

/// Centers the window on the monitor the mouse is on.
fn center_on_cursor_monitor(app: &AppHandle, window: &WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size)) = (monitor, window.outer_size()) else { return };
    let (pos, area) = (monitor.position(), monitor.size());
    let x = pos.x + (area.width as i32 - size.width as i32) / 2;
    let y = pos.y + (area.height as i32 - size.height as i32) / 2;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Opens a note (`None` = a new one) in its window or over the widget.
pub fn open(app: &AppHandle, id: Option<String>, in_window: bool) {
    if !in_window {
        if let Some(widget) = app.get_webview_window("widget") {
            let _ = widget.set_focus();
        }
        let _ = app.emit_to("widget", "open-note", id);
        return;
    }
    if let Some(window) = app.get_webview_window("note") {
        if !window.is_visible().unwrap_or(false) {
            center_on_cursor_monitor(app, &window);
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = app.emit_to("note", "open-note", id);
        return;
    }
    let query = id.as_deref().unwrap_or("new");
    let url = WebviewUrl::App(format!("index.html?note={query}").into());
    if let Ok(window) = WebviewWindowBuilder::new(app, "note", url)
        .title("focusbrew — Nota")
        .inner_size(NOTE_SIZE.0, NOTE_SIZE.1)
        .resizable(false)
        .maximizable(false)
        .build()
    {
        center_on_cursor_monitor(app, &window);
        let _ = window.set_focus();
    }
}

/// The shortcut with a note already open: bring it to the front and blink.
pub fn focus_and_flash(app: &AppHandle) {
    if window_visible(app) {
        if let Some(window) = app.get_webview_window("note") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        let _ = app.emit_to("note", "note-flash", ());
    } else {
        if let Some(widget) = app.get_webview_window("widget") {
            let _ = widget.set_focus();
        }
        let _ = app.emit_to("widget", "note-flash", ());
    }
}

pub fn close_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("note") {
        let _ = window.hide();
    }
}
```

- [ ] **Step 3: Rodar e ver passar** — `cargo test --manifest-path src-tauri/Cargo.toml note_window`. (Se `monitor_from_point` ou `cursor_position` não existirem nesta versão do Tauri, registre um Ruling e use `window.primary_monitor()` apenas.)

- [ ] **Step 4: Comandos** — em `commands.rs`, imports: `use base64::{engine::general_purpose::STANDARD as B64, Engine};`, `use tauri::Emitter;` (se ainda não houver), `use crate::notes::{self, Note, NotesShared};`, `use crate::note_window;`. Adicionar no fim do arquivo:

```rust
#[tauri::command]
pub fn list_notes(notes: State<'_, NotesShared>) -> Vec<Note> {
    notes.lock().notes.clone()
}

#[tauri::command]
pub fn save_note(note: Note, app: AppHandle, notes: State<'_, NotesShared>) -> Result<(), String> {
    let mut store = notes.lock();
    store.upsert(note, now_ms())?;
    notes::save(&store).map_err(|e| e.to_string())?;
    drop(store);
    let _ = app.emit("notes-changed", ());
    Ok(())
}

/// Deleting a note also deletes the images no other note uses.
#[tauri::command]
pub fn delete_note(id: String, app: AppHandle, notes: State<'_, NotesShared>) -> Result<(), String> {
    let mut store = notes.lock();
    store.remove(&id);
    notes::save(&store).map_err(|e| e.to_string())?;
    let in_use = store.images_in_use();
    drop(store);
    notes::prune_images(&in_use);
    let _ = app.emit("notes-changed", ());
    Ok(())
}

#[tauri::command]
pub fn save_note_image(data_base64: String, ext: String) -> Result<String, String> {
    let bytes = B64.decode(data_base64.trim()).map_err(|_| "imagem inválida".to_string())?;
    notes::store_image(&bytes, &ext)
}

/// A stored image as a `data:` URL, ready for an `<image>`/`<img>`.
#[tauri::command]
pub fn read_note_image(file: String) -> Result<String, String> {
    let bytes = notes::read_image(&file)?;
    Ok(format!("data:{};base64,{}", notes::mime_for(&file), B64.encode(bytes)))
}

#[derive(serde::Serialize)]
pub struct ImagePayload {
    pub ext: String,
    pub data_base64: String,
}

/// An image file dropped on the note (the path comes from the OS drag-and-drop).
#[tauri::command]
pub fn read_image_file(path: String) -> Result<ImagePayload, String> {
    let path = std::path::PathBuf::from(path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|e| matches!(e.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif"))
        .ok_or_else(|| "formato de imagem não suportado".to_string())?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > 20 * 1024 * 1024 {
        return Err("arquivo grande demais".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(ImagePayload { ext, data_base64: B64.encode(bytes) })
}

/// Opens a note (`None` = new) where the settings say.
#[tauri::command]
pub fn open_note(id: Option<String>, app: AppHandle, shared: State<'_, Shared>) {
    let (placement, visible) = {
        let state = shared.lock();
        (state.config.note_placement, state.config.widget_visible)
    };
    note_window::open(&app, id, note_window::wants_window(placement, visible));
}

#[tauri::command]
pub fn close_note_window(app: AppHandle) {
    note_window::close_window(&app);
}

/// The front-end says the note is (or is no longer) open over the widget.
#[tauri::command]
pub fn set_note_overlay_open(open: bool) {
    note_window::set_overlay_open(open);
}
```

Em `lib.rs`: `.manage(notes::NotesShared(Mutex::new(notes::load())))` junto do `.manage(Shared(...))`; registrar os 9 comandos no `generate_handler!` (`commands::list_notes`, `save_note`, `delete_note`, `save_note_image`, `read_note_image`, `read_image_file`, `open_note`, `close_note_window`, `set_note_overlay_open`); trocar o corpo de `note_action`:

```rust
/// The note shortcut: a new note, or — with one already open — bring it forward and blink.
fn note_action(app: &AppHandle) {
    if note_window::is_open(app) {
        note_window::focus_and_flash(app);
        return;
    }
    let (placement, visible) = {
        let shared = app.state::<Shared>();
        let state = shared.lock();
        (state.config.note_placement, state.config.widget_visible)
    };
    note_window::open(app, None, note_window::wants_window(placement, visible));
}
```

No `setup`, depois de `widget::create(app.handle())?;`: limpeza no início (nada está em edição ainda):

```rust
            {
                let notes = handle.state::<notes::NotesShared>();
                let in_use = notes.lock().images_in_use();
                notes::prune_images(&in_use);
            }
```

`capabilities/default.json`: `"windows": ["main", "widget", "note"]`.

- [ ] **Step 5: Lado TypeScript** — em `src/lib/tauri.ts` (import `Note` de `./note` será criado na Task 8; **nesta task** use `import type { Note } from "./note";` e crie antes o arquivo mínimo `src/lib/note.ts` com os tipos da Task 8 Step 3 — ver Interfaces dela), adicionar:

```ts
export const listNotes = () => invoke<Note[]>("list_notes");
export const saveNote = (note: Note) => invoke<void>("save_note", { note });
export const deleteNote = (id: string) => invoke<void>("delete_note", { id });
export const saveNoteImage = (dataBase64: string, ext: string) => invoke<string>("save_note_image", { dataBase64, ext });
/** A stored image as a data: URL. */
export const readNoteImage = (file: string) => invoke<string>("read_note_image", { file });
export const readImageFile = (path: string) => invoke<{ ext: string; data_base64: string }>("read_image_file", { path });
/** `null` opens a new note, where the settings say (over the panel or in a window). */
export const openNote = (id: string | null) => invoke<void>("open_note", { id });
export const closeNoteWindow = () => invoke<void>("close_note_window");
export const setNoteOverlayOpen = (open: boolean) => invoke<void>("set_note_overlay_open", { open });

export const onNotesChanged = (cb: () => void) => listen("notes-changed", () => cb());
/** Show this note (`null` = a new one). */
export const onOpenNote = (cb: (id: string | null) => void) => listen<string | null>("open-note", (e) => cb(e.payload));
export const onNoteFlash = (cb: () => void) => listen("note-flash", () => cb());
```

`src/NoteWindow.tsx` provisório:

```tsx
export default function NoteWindow() {
  return <div style={{ padding: 16, color: "#f2f2f3", background: "#0b0b0d", height: "100vh" }}>Nota</div>;
}
```

`src/main.tsx`: trocar `resolveIsWidget` por `windowKind(): "widget" | "note" | "settings"` (mesmo `try/catch`, devolvendo `"settings"` fora do Tauri) e renderizar `kind === "widget" ? <Widget /> : kind === "note" ? <NoteWindow /> : <App />` (importar `NoteWindow`).

- [ ] **Step 6: Verificar** — `cargo test --manifest-path src-tauri/Cargo.toml`, `bun run test`, `bun run build`. Expected: tudo verde, sem warnings do Rust.

- [ ] **Step 7: Commit** — `git add src-tauri src && git commit -m "feat: comandos, eventos e janela das notas rápidas (sem o editor ainda)"`.

---

### Task 8: Modelo e lógica pura das notas (TypeScript)

**Files:**
- Create: `src/lib/note.ts`, `src/lib/noteGeometry.ts`, `src/lib/noteHistory.ts`, `src/lib/noteMeta.ts` e os `*.test.ts` de cada um
- Modify: nenhum

**Interfaces:**
- Produces: tipos `Note`, `NoteObject`, `ShapeKind`, `Rect`, `Point`, `Handle`, `SHEET`; funções listadas em cada Step (assinaturas exatas abaixo).

**Ruling (registrar no ledger):** a spec fala em "folha de 560×380"; aqui a nota inteira é 560×380 e a folha de desenho 560×320 (barra de modos 28 + faixa de ferramentas 28 + respiro 4). Custo se errado: trocar `SHEET.height` e o CSS.

- [ ] **Step 1: Tipos** — `src/lib/note.ts`:

```ts
/** The drawing sheet, in the units every object coordinate uses. */
export const SHEET = { width: 560, height: 320 } as const;

export type ShapeKind = "rect" | "ellipse" | "triangle" | "line" | "arrow";
export type Point = [number, number];

export type NoteObject =
  | { type: "stroke"; color: string; width: number; points: Point[] }
  | { type: "shape"; kind: ShapeKind; color: string; width: number; fill: boolean; x1: number; y1: number; x2: number; y2: number }
  | { type: "image"; file: string; x: number; y: number; w: number; h: number };

export interface Note {
  id: string;
  created_ms: number;
  updated_ms: number;
  text: string;
  objects: NoteObject[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
```

- [ ] **Step 2: Testes que falham da geometria** — `src/lib/noteGeometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { NoteObject, Point } from "./note";
import {
  arrowHead, constrainShape, fitObject, hitHandle, hitObject, normRect, objectBounds, resizeRect,
  segmentDistance, simplifyPoints, topObjectAt, translateObject, triangleVertices,
} from "./noteGeometry";

const stroke = (points: Point[], width = 4): NoteObject => ({ type: "stroke", color: "#fff", width, points });
const shape = (kind: "rect" | "ellipse" | "triangle" | "line" | "arrow", x1: number, y1: number, x2: number, y2: number, fill = false): NoteObject =>
  ({ type: "shape", kind, color: "#fff", width: 2, fill, x1, y1, x2, y2 });
const image = (x: number, y: number, w: number, h: number): NoteObject => ({ type: "image", file: "0123456789abcdef.png", x, y, w, h });

describe("segmentDistance and simplifyPoints", () => {
  it("measures the distance to a segment, including past its ends", () => {
    expect(segmentDistance(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(segmentDistance(-4, 3, 0, 0, 10, 0)).toBe(5);
    expect(segmentDistance(3, 4, 0, 0, 0, 0)).toBe(5);
  });

  it("drops points closer than the minimum to the last kept one but keeps the first and last", () => {
    const pts: Point[] = [[0, 0], [0.5, 0], [1, 0], [3, 0], [3.2, 0], [3.4, 0]];
    expect(simplifyPoints(pts, 1.5)).toEqual([[0, 0], [3, 0], [3.4, 0]]);
    expect(simplifyPoints([[1, 1]], 1.5)).toEqual([[1, 1]]);
    expect(simplifyPoints([[1, 1], [1, 1]], 1.5)).toEqual([[1, 1], [1, 1]]);
  });
});

describe("bounds, move and resize", () => {
  it("gives the bounds of every kind of object", () => {
    expect(objectBounds(stroke([[10, 20], [30, 5]]))).toEqual({ x: 10, y: 5, w: 20, h: 15 });
    expect(objectBounds(shape("rect", 50, 40, 10, 20))).toEqual({ x: 10, y: 20, w: 40, h: 20 });
    expect(objectBounds(image(1, 2, 3, 4))).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(normRect(5, 5, 1, 9)).toEqual({ x: 1, y: 5, w: 4, h: 4 });
  });

  it("moves any object without touching its size", () => {
    expect(translateObject(shape("line", 0, 0, 10, 5), 3, -2)).toEqual(shape("line", 3, -2, 13, 3));
    expect(translateObject(image(1, 1, 5, 5), 2, 2)).toEqual(image(3, 3, 5, 5));
    expect(translateObject(stroke([[0, 0], [1, 1]]), 5, 5)).toEqual(stroke([[5, 5], [6, 6]]));
  });

  it("scales an object from one box to another", () => {
    const from = { x: 0, y: 0, w: 10, h: 10 };
    const to = { x: 10, y: 10, w: 20, h: 40 };
    expect(fitObject(image(0, 0, 10, 10), from, to)).toEqual(image(10, 10, 20, 40));
    expect(fitObject(shape("rect", 0, 0, 10, 10), from, to)).toEqual(shape("rect", 10, 10, 30, 50));
    expect(fitObject(stroke([[5, 5]]), from, to)).toEqual(stroke([[20, 30]]));
  });

  it("does not divide by zero for a flat box", () => {
    const flat = { x: 0, y: 5, w: 10, h: 0 };
    const moved = fitObject(shape("line", 0, 5, 10, 5), flat, { x: 0, y: 5, w: 20, h: 0 });
    expect(JSON.stringify(moved)).not.toContain("null");
  });

  it("finds the corner handle under the pointer and resizes from the opposite corner", () => {
    const b = { x: 10, y: 10, w: 40, h: 30 };
    expect(hitHandle(b, 11, 9)).toBe("nw");
    expect(hitHandle(b, 50, 40)).toBe("se");
    expect(hitHandle(b, 30, 25)).toBeNull();
    expect(resizeRect(b, "se", 90, 70)).toEqual({ x: 10, y: 10, w: 80, h: 60 });
    expect(resizeRect(b, "nw", 0, 0)).toEqual({ x: 0, y: 0, w: 50, h: 40 });
    expect(resizeRect(b, "se", 0, 0)).toEqual({ x: 10, y: 10, w: 6, h: 6 }); // never smaller than the minimum
  });
});

describe("shapes: Shift and the arrow head", () => {
  it("makes rectangles and ellipses proportional with Shift, in any direction", () => {
    expect(constrainShape("rect", 10, 10, 50, 30, true)).toEqual([50, 50]);
    expect(constrainShape("ellipse", 50, 50, 10, 40, true)).toEqual([10, 10]);
    expect(constrainShape("rect", 10, 10, 50, 30, false)).toEqual([50, 30]);
  });

  it("locks lines and arrows to 45 degree steps with Shift", () => {
    const [x, y] = constrainShape("line", 0, 0, 10, 3, true);
    expect(x).toBeCloseTo(Math.hypot(10, 3), 5);
    expect(y).toBeCloseTo(0, 5);
    const [dx, dy] = constrainShape("arrow", 0, 0, 7, 8, true);
    expect(dx).toBeCloseTo(dy, 5);
    expect(constrainShape("arrow", 5, 5, 5, 5, true)).toEqual([5, 5]);
  });

  it("puts the triangle apex at the top middle of its box", () => {
    expect(triangleVertices(0, 0, 10, 20)).toEqual([[5, 0], [10, 20], [0, 20]]);
    expect(triangleVertices(10, 20, 0, 0)).toEqual([[5, 0], [10, 20], [0, 20]]);
  });

  it("draws the two barbs of the arrow head behind its tip", () => {
    const [a, b] = arrowHead(0, 0, 10, 0, 4);
    expect(a[0]).toBeCloseTo(10 - 4 * Math.cos(Math.PI / 6), 5);
    expect(Math.abs(a[1])).toBeCloseTo(2, 5);
    expect(a[1]).toBeCloseTo(-b[1], 5);
  });
});

describe("hit testing", () => {
  it("hits a stroke near its line and not far from it", () => {
    const s = stroke([[0, 0], [100, 0]], 4);
    expect(hitObject(s, 50, 5)).toBe(true);
    expect(hitObject(s, 50, 20)).toBe(false);
    expect(hitObject(stroke([[10, 10]]), 12, 12)).toBe(true);
  });

  it("hits the outline of an unfilled rectangle and the inside only when it is filled", () => {
    const empty = shape("rect", 0, 0, 100, 100);
    expect(hitObject(empty, 0, 50)).toBe(true);
    expect(hitObject(empty, 50, 50)).toBe(false);
    expect(hitObject(shape("rect", 0, 0, 100, 100, true), 50, 50)).toBe(true);
  });

  it("hits ellipses, triangles, lines and images", () => {
    expect(hitObject(shape("ellipse", 0, 0, 100, 60), 50, 0)).toBe(true);
    expect(hitObject(shape("ellipse", 0, 0, 100, 60), 50, 30)).toBe(false);
    expect(hitObject(shape("ellipse", 0, 0, 100, 60, true), 50, 30)).toBe(true);
    expect(hitObject(shape("triangle", 0, 0, 100, 100, true), 50, 60)).toBe(true);
    expect(hitObject(shape("triangle", 0, 0, 100, 100, true), 5, 5)).toBe(false);
    expect(hitObject(shape("line", 0, 0, 100, 100), 50, 52)).toBe(true);
    expect(hitObject(shape("arrow", 0, 0, 100, 0), 50, 40)).toBe(false);
    expect(hitObject(image(10, 10, 50, 50), 30, 30)).toBe(true);
    expect(hitObject(image(10, 10, 50, 50), 70, 30)).toBe(false);
  });

  it("picks the top object first and prefers drawing over a picture under it", () => {
    const objects = [image(0, 0, 200, 200), shape("rect", 20, 20, 60, 60, true), shape("rect", 30, 30, 70, 70, true)];
    expect(topObjectAt(objects, 40, 40)).toBe(2);
    expect(topObjectAt(objects, 25, 25)).toBe(1);
    expect(topObjectAt(objects, 150, 150)).toBe(0);
    expect(topObjectAt(objects, 150, 150, 6, true)).toBe(-1);
    expect(topObjectAt(objects, 500, 500)).toBe(-1);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `bun run test -- src/lib/noteGeometry.test.ts`. Expected: FAIL (módulo inexistente).

- [ ] **Step 4: Implementar** — `src/lib/noteGeometry.ts`:

```ts
import type { NoteObject, Point, Rect, ShapeKind } from "./note";

export type Handle = "nw" | "ne" | "sw" | "se";

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Distance from (px, py) to the segment a-b. */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return dist(px, py, ax + t * dx, ay + t * dy);
}

/** Drops points closer than `minDist` to the last kept one; the ends stay. */
export function simplifyPoints(points: Point[], minDist = 1.5): Point[] {
  if (points.length <= 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    if (dist(points[i][0], points[i][1], last[0], last[1]) >= minDist) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

export function normRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function objectBounds(o: NoteObject): Rect {
  if (o.type === "image") return { x: o.x, y: o.y, w: o.w, h: o.h };
  if (o.type === "shape") return normRect(o.x1, o.y1, o.x2, o.y2);
  if (o.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = o.points.map((p) => p[0]);
  const ys = o.points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function translateObject(o: NoteObject, dx: number, dy: number): NoteObject {
  if (o.type === "image") return { ...o, x: o.x + dx, y: o.y + dy };
  if (o.type === "shape") return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
  return { ...o, points: o.points.map(([x, y]): Point => [x + dx, y + dy]) };
}

/** Maps the object from the box `from` to the box `to` (move + scale). */
export function fitObject(o: NoteObject, from: Rect, to: Rect): NoteObject {
  const sx = from.w === 0 ? 1 : to.w / from.w;
  const sy = from.h === 0 ? 1 : to.h / from.h;
  const mx = (x: number) => to.x + (x - from.x) * sx;
  const my = (y: number) => to.y + (y - from.y) * sy;
  if (o.type === "image") return { ...o, x: mx(o.x), y: my(o.y), w: o.w * sx, h: o.h * sy };
  if (o.type === "shape") return { ...o, x1: mx(o.x1), y1: my(o.y1), x2: mx(o.x2), y2: my(o.y2) };
  return { ...o, points: o.points.map(([x, y]): Point => [mx(x), my(y)]) };
}

export function hitHandle(b: Rect, x: number, y: number, size = 9): Handle | null {
  const corners: [Handle, number, number][] = [
    ["nw", b.x, b.y],
    ["ne", b.x + b.w, b.y],
    ["sw", b.x, b.y + b.h],
    ["se", b.x + b.w, b.y + b.h],
  ];
  for (const [handle, cx, cy] of corners) {
    if (Math.abs(x - cx) <= size && Math.abs(y - cy) <= size) return handle;
  }
  return null;
}

/** The box after dragging `handle` to (x, y); the opposite corner stays put. */
export function resizeRect(b: Rect, handle: Handle, x: number, y: number, minSize = 6): Rect {
  const right = b.x + b.w;
  const bottom = b.y + b.h;
  let x1 = b.x;
  let y1 = b.y;
  let x2 = right;
  let y2 = bottom;
  if (handle.endsWith("w")) x1 = Math.min(x, right - minSize);
  else x2 = Math.max(x, b.x + minSize);
  if (handle.startsWith("n")) y1 = Math.min(y, bottom - minSize);
  else y2 = Math.max(y, b.y + minSize);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** The far corner of a shape being dragged: Shift makes boxes square and locks lines to 45 degrees. */
export function constrainShape(kind: ShapeKind, x1: number, y1: number, x2: number, y2: number, shift: boolean): Point {
  if (!shift) return [x2, y2];
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (kind === "line" || kind === "arrow") {
    const len = Math.hypot(dx, dy);
    if (len === 0) return [x2, y2];
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    return [x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len];
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return [x1 + Math.sign(dx || 1) * size, y1 + Math.sign(dy || 1) * size];
}

export function triangleVertices(x1: number, y1: number, x2: number, y2: number): [Point, Point, Point] {
  const r = normRect(x1, y1, x2, y2);
  return [[r.x + r.w / 2, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
}

/** The two barbs of an arrow head whose tip is (x2, y2). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): [Point, Point] {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 6;
  return [
    [x2 - size * Math.cos(a - spread), y2 - size * Math.sin(a - spread)],
    [x2 - size * Math.cos(a + spread), y2 - size * Math.sin(a + spread)],
  ];
}

function inTriangle(px: number, py: number, [a, b, c]: [Point, Point, Point]): boolean {
  const side = (p: Point, q: Point) => (px - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (py - q[1]);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Whether (x, y) touches the object: its line within `tol`, or its inside if it is a filled shape or a picture. */
export function hitObject(o: NoteObject, x: number, y: number, tol = 6): boolean {
  if (o.type === "image") return x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
  const r = o.width / 2 + tol;
  if (o.type === "stroke") {
    if (o.points.length === 1) return dist(x, y, o.points[0][0], o.points[0][1]) <= r;
    for (let i = 1; i < o.points.length; i++) {
      if (segmentDistance(x, y, o.points[i - 1][0], o.points[i - 1][1], o.points[i][0], o.points[i][1]) <= r) return true;
    }
    return false;
  }
  const b = normRect(o.x1, o.y1, o.x2, o.y2);
  switch (o.kind) {
    case "line":
    case "arrow":
      return segmentDistance(x, y, o.x1, o.y1, o.x2, o.y2) <= r;
    case "rect": {
      if (o.fill && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
      const edges: [number, number, number, number][] = [
        [b.x, b.y, b.x + b.w, b.y],
        [b.x + b.w, b.y, b.x + b.w, b.y + b.h],
        [b.x + b.w, b.y + b.h, b.x, b.y + b.h],
        [b.x, b.y + b.h, b.x, b.y],
      ];
      return edges.some(([ax, ay, bx, by]) => segmentDistance(x, y, ax, ay, bx, by) <= r);
    }
    case "ellipse": {
      const a = b.w / 2;
      const c = b.h / 2;
      if (a === 0 || c === 0) return segmentDistance(x, y, o.x1, o.y1, o.x2, o.y2) <= r;
      const k = Math.hypot((x - (b.x + a)) / a, (y - (b.y + c)) / c);
      const scale = Math.min(a, c);
      return o.fill ? k <= 1 + r / scale : Math.abs(k - 1) * scale <= r;
    }
    case "triangle": {
      const v = triangleVertices(o.x1, o.y1, o.x2, o.y2);
      if (o.fill && inTriangle(x, y, v)) return true;
      return [0, 1, 2].some((i) => segmentDistance(x, y, v[i][0], v[i][1], v[(i + 1) % 3][0], v[(i + 1) % 3][1]) <= r);
    }
  }
}

/** Index of the object under the pointer: the last drawn first, pictures only after every drawing. -1 for none. */
export function topObjectAt(objects: NoteObject[], x: number, y: number, tol = 6, skipImages = false): number {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (objects[i].type !== "image" && hitObject(objects[i], x, y, tol)) return i;
  }
  if (!skipImages) {
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].type === "image" && hitObject(objects[i], x, y, tol)) return i;
    }
  }
  return -1;
}
```

- [ ] **Step 5: Rodar e ver passar** — `bun run test -- src/lib/noteGeometry.test.ts`. Se algum caso numérico falhar (por exemplo as tolerâncias do elipse/triângulo), conserte **o teste só se o cálculo estiver certo e o número do teste errado**, e registre um Ruling; senão conserte o código.

- [ ] **Step 6: Histórico, título, filtro, medidas — testes que falham** — `src/lib/noteHistory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commit, createHistory, redo, undo } from "./noteHistory";

describe("noteHistory", () => {
  it("undoes and redoes in order", () => {
    let h = createHistory<number[]>([]);
    h = commit(h, [1]);
    h = commit(h, [1, 2]);
    expect(h.present).toEqual([1, 2]);
    h = undo(h);
    expect(h.present).toEqual([1]);
    h = undo(h);
    expect(h.present).toEqual([]);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toEqual([1]);
    expect(canRedo(h)).toBe(true);
  });

  it("forgets the redo branch after a new change", () => {
    let h = commit(commit(createHistory<number[]>([]), [1]), [1, 2]);
    h = undo(h);
    h = commit(h, [1, 9]);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toEqual([1, 9]);
  });

  it("does nothing at the ends and keeps at most `limit` steps", () => {
    const h = createHistory<number[]>([5]);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
    let long = createHistory<number[]>([]);
    for (let i = 1; i <= 10; i++) long = commit(long, [i], 3);
    expect(long.past).toHaveLength(3);
    expect(long.present).toEqual([10]);
  });

  it("ignores a commit that changes nothing", () => {
    const h = createHistory<number[]>([1]);
    const same = h.present;
    expect(commit(h, same)).toBe(h);
  });
});
```

`src/lib/noteMeta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Note } from "./note";
import { filterNotes, fitInto, formatNoteDate, newNote, noteTitle, scaleToMax, wrapText } from "./noteMeta";

const base = (over: Partial<Note>): Note => ({ id: "a", created_ms: 0, updated_ms: new Date(2026, 9, 8, 14, 5).getTime(), text: "", objects: [], ...over });

describe("noteTitle", () => {
  it("is the first non-empty line, trimmed and cut at 60 characters", () => {
    expect(noteTitle(base({ text: "\n  \n  Fluxo do login  \nresto" }))).toBe("Fluxo do login");
    expect(noteTitle(base({ text: "x".repeat(80) }))).toBe(`${"x".repeat(57)}…`);
  });

  it("falls back to Desenho + date for a note with only drawing, and to Nota vazia", () => {
    const obj = { type: "stroke", color: "#fff", width: 2, points: [[0, 0]] } as const;
    expect(noteTitle(base({ objects: [obj] }))).toBe("Desenho · 08/10 14:05");
    expect(noteTitle(base({}))).toBe("Nota vazia");
  });
});

describe("formatNoteDate and newNote", () => {
  it("writes dd/MM HH:mm with zeros", () => {
    expect(formatNoteDate(new Date(2026, 0, 3, 7, 9).getTime())).toBe("03/01 07:09");
  });

  it("starts a note empty with the given id and dates", () => {
    expect(newNote(123, "abc")).toEqual({ id: "abc", created_ms: 123, updated_ms: 123, text: "", objects: [] });
  });
});

describe("filterNotes", () => {
  const notes = [base({ id: "1", text: "Reunião com o cliente" }), base({ id: "2", text: "lista de compras" })];

  it("matches ignoring case and accents, and returns everything for an empty query", () => {
    expect(filterNotes(notes, "reuniao").map((n) => n.id)).toEqual(["1"]);
    expect(filterNotes(notes, "COMPRAS").map((n) => n.id)).toEqual(["2"]);
    expect(filterNotes(notes, "  ")).toHaveLength(2);
    expect(filterNotes(notes, "xyz")).toHaveLength(0);
  });
});

describe("image and text measures", () => {
  it("scales an image down to at most `max` on its longest side and never up", () => {
    expect(scaleToMax(3200, 1600, 1600)).toEqual({ w: 1600, h: 800 });
    expect(scaleToMax(800, 600, 1600)).toEqual({ w: 800, h: 600 });
  });

  it("fits an image into a box keeping its proportion, never enlarging it", () => {
    expect(fitInto(600, 300, 300, 220)).toEqual({ w: 300, h: 150 });
    expect(fitInto(100, 50, 300, 220)).toEqual({ w: 100, h: 50 });
  });

  it("wraps text by measured width and keeps blank lines", () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapText("aaa bbb ccc", 70, measure)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapText("a\n\nb", 100, measure)).toEqual(["a", "", "b"]);
    expect(wrapText("supercalifragilistic", 50, measure)).toEqual(["supercalifragilistic"]);
  });
});
```

- [ ] **Step 7: Rodar e ver falhar** — `bun run test -- src/lib/noteHistory.test.ts src/lib/noteMeta.test.ts`.

- [ ] **Step 8: Implementar** — `src/lib/noteHistory.ts`:

```ts
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const createHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [] });

export function commit<T>(h: History<T>, next: T, limit = 100): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

export const canUndo = <T,>(h: History<T>) => h.past.length > 0;
export const canRedo = <T,>(h: History<T>) => h.future.length > 0;
```

`src/lib/noteMeta.ts`:

```ts
import type { Note } from "./note";

const pad = (n: number) => String(n).padStart(2, "0");

/** "08/10 14:05" (local time). */
export function formatNoteDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The first non-empty line of the text; a note with only drawing is "Desenho · date". */
export function noteTitle(note: Pick<Note, "text" | "objects" | "updated_ms">): string {
  const line = note.text.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  if (line) return line.length > 60 ? `${line.slice(0, 57)}…` : line;
  return note.objects.length > 0 ? `Desenho · ${formatNoteDate(note.updated_ms)}` : "Nota vazia";
}

export function newNote(now: number, id: string): Note {
  return { id, created_ms: now, updated_ms: now, text: "", objects: [] };
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Notes whose text contains `query`, ignoring case and accents. */
export function filterNotes<T extends Pick<Note, "text">>(notes: T[], query: string): T[] {
  const q = fold(query.trim());
  return q ? notes.filter((n) => fold(n.text).includes(q)) : notes;
}

/** Shrinks (never enlarges) a size so its longest side is at most `max`. */
export function scaleToMax(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Fits an image into a box keeping its proportion, never enlarging it. */
export function fitInto(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Breaks text into lines no wider than `maxWidth` (by the measuring function); blank lines stay. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}
```

- [ ] **Step 9: Rodar e ver passar** — `bun run test` e `bun run build`.

- [ ] **Step 10: Commit** — `git add src/lib && git commit -m "feat: lógica pura das notas (geometria, formas, seleção, histórico, título e filtro)"`.

---

### Task 9: `NoteSvg`, ícones, documento com autosave e o editor básico (texto + caneta)

**Files:**
- Create: `src/note/NoteSvg.tsx`, `src/note/NoteSvg.test.tsx`, `src/note/noteIcons.tsx`, `src/note/useNoteDoc.ts`, `src/note/NoteEditor.tsx`, `src/note/note.css`
- Modify: `src/NoteWindow.tsx`

**Interfaces:**
- Consumes: Tasks 7 e 8.
- Produces: `NoteSvg` (props `objects`, `images`, `layer?: "images" | "drawing" | "all"`, `width?`, `height?`, `children?`, e as props de `<svg>`); `strokePath(points) -> string`; `NOTE_ICONS`; hook `useNoteDoc()` → `{ note, images, load(id|null), flush(), setText, commitObjects, undo, redo, canUndo, canRedo, addImageData(file, dataUrl) }`; `NoteEditor` (props `request: { id: string | null; nonce: number }`, `placement`, `config`, `onClose`).

- [ ] **Step 1: Testes que falham do `NoteSvg`** — `src/note/NoteSvg.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { NoteObject } from "../lib/note";
import { NoteSvg, strokePath } from "./NoteSvg";

const html = (objects: NoteObject[], layer?: "images" | "drawing" | "all") =>
  renderToStaticMarkup(<NoteSvg objects={objects} images={{ "0123456789abcdef.png": "data:image/png;base64,AAAA" }} layer={layer} />);

const shape = (kind: "rect" | "ellipse" | "triangle" | "line" | "arrow", fill = false): NoteObject =>
  ({ type: "shape", kind, color: "#ff0000", width: 3, fill, x1: 10, y1: 20, x2: 110, y2: 80 });

describe("strokePath", () => {
  it("writes a path through the points with one decimal", () => {
    expect(strokePath([[0, 0], [10.04, 5.06], [20, 9]])).toBe("M 0 0 L 10 5.1 L 20 9");
  });
});

describe("NoteSvg", () => {
  it("is a 560x320 sheet with the svg namespace so it can be rasterized", () => {
    const out = html([]);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('viewBox="0 0 560 320"');
  });

  it("draws a stroke as a round path and a single point as a dot", () => {
    expect(html([{ type: "stroke", color: "#fff", width: 4, points: [[0, 0], [5, 5]] }])).toContain('<path d="M 0 0 L 5 5"');
    expect(html([{ type: "stroke", color: "#fff", width: 4, points: [[3, 3]] }])).toContain("<circle");
  });

  it("draws each shape with its own element, outline by default and filled with some opacity", () => {
    expect(html([shape("rect")])).toContain("<rect");
    expect(html([shape("ellipse")])).toContain("<ellipse");
    expect(html([shape("triangle")])).toContain("<polygon");
    expect(html([shape("line")])).toContain("<line");
    const arrow = html([shape("arrow")]);
    expect(arrow).toContain("<line");
    expect(arrow).toContain("<polyline");
    expect(html([shape("rect")])).toContain('fill="none"');
    const filled = html([shape("rect", true)]);
    expect(filled).toContain('fill="#ff0000"');
    expect(filled).toContain('fill-opacity="0.25"');
  });

  it("splits pictures and drawing into layers", () => {
    const objects: NoteObject[] = [{ type: "image", file: "0123456789abcdef.png", x: 1, y: 2, w: 30, h: 40 }, shape("rect")];
    expect(html(objects, "images")).toContain("<image");
    expect(html(objects, "images")).not.toContain("<rect");
    expect(html(objects, "drawing")).toContain("<rect");
    expect(html(objects, "drawing")).not.toContain("<image");
    expect(html(objects, "all")).toContain("<image");
  });

  it("skips a picture whose file is not loaded", () => {
    expect(html([{ type: "image", file: "ffffffffffffffff.png", x: 0, y: 0, w: 5, h: 5 }])).not.toContain("<image");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun run test -- src/note/NoteSvg.test.tsx`.

- [ ] **Step 3: `NoteSvg.tsx`**:

```tsx
import type { ReactNode, SVGProps } from "react";
import { SHEET } from "../lib/note";
import type { NoteObject, Point } from "../lib/note";
import { arrowHead, normRect, triangleVertices } from "../lib/noteGeometry";

const r1 = (n: number) => Math.round(n * 10) / 10;

export function strokePath(points: Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${r1(x)} ${r1(y)}`).join(" ");
}

type Layer = "images" | "drawing" | "all";

interface Props extends Omit<SVGProps<SVGSVGElement>, "children"> {
  objects: NoteObject[];
  /** `file` -> data: URL of the picture. */
  images: Record<string, string>;
  layer?: Layer;
  children?: ReactNode;
}

function ObjectEl({ o, images }: { o: NoteObject; images: Record<string, string> }) {
  if (o.type === "image") {
    const href = images[o.file];
    return href ? <image href={href} x={o.x} y={o.y} width={o.w} height={o.h} preserveAspectRatio="none" /> : null;
  }
  if (o.type === "stroke") {
    if (o.points.length === 1) return <circle cx={o.points[0][0]} cy={o.points[0][1]} r={o.width / 2} fill={o.color} />;
    return <path d={strokePath(o.points)} fill="none" stroke={o.color} strokeWidth={o.width} strokeLinecap="round" strokeLinejoin="round" />;
  }
  const paint = { stroke: o.color, strokeWidth: o.width, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const fill = o.fill ? { fill: o.color, fillOpacity: 0.25 } : { fill: "none" };
  switch (o.kind) {
    case "rect": {
      const b = normRect(o.x1, o.y1, o.x2, o.y2);
      return <rect x={b.x} y={b.y} width={b.w} height={b.h} {...paint} {...fill} />;
    }
    case "ellipse": {
      const b = normRect(o.x1, o.y1, o.x2, o.y2);
      return <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} {...paint} {...fill} />;
    }
    case "triangle": {
      const points = triangleVertices(o.x1, o.y1, o.x2, o.y2).map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");
      return <polygon points={points} {...paint} {...fill} />;
    }
    case "line":
      return <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} {...paint} />;
    case "arrow": {
      const [a, b] = arrowHead(o.x1, o.y1, o.x2, o.y2, 8 + o.width * 1.5);
      return (
        <g>
          <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} {...paint} />
          <polyline points={`${r1(a[0])},${r1(a[1])} ${o.x2},${o.y2} ${r1(b[0])},${r1(b[1])}`} fill="none" {...paint} />
        </g>
      );
    }
  }
}

/** Everything drawn on the sheet (pictures and/or drawing). Also used for the thumbnails and the exported image. */
export function NoteSvg({ objects, images, layer = "all", children, ...rest }: Props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${SHEET.width} ${SHEET.height}`} width={SHEET.width} height={SHEET.height} {...rest}>
      {objects.map((o, i) => {
        const isImage = o.type === "image";
        if ((layer === "images" && !isImage) || (layer === "drawing" && isImage)) return null;
        return <ObjectEl key={i} o={o} images={images} />;
      })}
      {children}
    </svg>
  );
}
```

- [ ] **Step 4: Rodar e ver passar** — `bun run test -- src/note/NoteSvg.test.tsx`.

- [ ] **Step 5: Ícones** — `src/note/noteIcons.tsx` (mesma convenção dos ícones da configuração, tamanho 16; não precisa de teste de família próprio, mas **adicione** ao arquivo de teste `src/note/NoteSvg.test.tsx` um teste "all note icons use currentColor and the 24 grid"):

```tsx
import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const NOTE_ICONS = {
  history: () => (<Icon><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></Icon>),
  plus: () => (<Icon><path d="M12 5v14" /><path d="M5 12h14" /></Icon>),
  close: () => (<Icon><path d="M6 6l12 12" /><path d="M18 6L6 18" /></Icon>),
  undo: () => (<Icon><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Icon>),
  redo: () => (<Icon><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></Icon>),
  copy: () => (<Icon><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icon>),
  placement: () => (<Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18" /></Icon>),
  select: () => (<Icon><path d="M5 3l14 8-6 2-2 6z" /></Icon>),
  pen: () => (<Icon><path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z" /><path d="M14 7l3 3" /></Icon>),
  rect: () => (<Icon><rect x="4" y="5" width="16" height="14" rx="1" /></Icon>),
  ellipse: () => (<Icon><ellipse cx="12" cy="12" rx="9" ry="7" /></Icon>),
  triangle: () => (<Icon><path d="M12 4l9 16H3z" /></Icon>),
  line: () => (<Icon><path d="M5 19L19 5" /></Icon>),
  arrow: () => (<Icon><path d="M5 19L19 5" /><path d="M9 5h10v10" /></Icon>),
  eraser: () => (<Icon><path d="M7 21h12" /><path d="M5.5 14.5l8-8a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L11 20H7l-1.5-1.5a2 2 0 0 1 0-3z" /></Icon>),
  fill: () => (<Icon><rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" fillOpacity="0.35" /></Icon>),
};
```

- [ ] **Step 6: `useNoteDoc.ts`** (documento aberto + autosave + histórico):

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, NoteObject } from "../lib/note";
import { canRedo, canUndo, commit, createHistory, redo as redoHistory, undo as undoHistory } from "../lib/noteHistory";
import type { History } from "../lib/noteHistory";
import { newNote } from "../lib/noteMeta";
import { listNotes, readNoteImage, saveNote } from "../lib/tauri";

const SAVE_DELAY_MS = 400;
const imageCache = new Map<string, string>();

/** The note being edited: its objects have an undo history, every change is saved a moment later. */
export function useNoteDoc() {
  const [note, setNote] = useState<Note>(() => newNote(Date.now(), crypto.randomUUID()));
  const [images, setImages] = useState<Record<string, string>>({});
  const [, setTick] = useState(0);
  const noteRef = useRef(note);
  const history = useRef<History<NoteObject[]>>(createHistory([]));
  const timer = useRef(0);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    await saveNote(noteRef.current).catch((e) => console.warn("focusbrew:", e));
  }, []);

  const update = useCallback(
    (next: Note) => {
      noteRef.current = next;
      setNote(next);
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  const refreshImages = useCallback(async (objects: NoteObject[]) => {
    const files = objects.flatMap((o) => (o.type === "image" ? [o.file] : []));
    await Promise.all(
      files.map(async (file) => {
        if (imageCache.has(file)) return;
        try {
          imageCache.set(file, await readNoteImage(file));
        } catch {
          /* a missing file: the picture just does not show */
        }
      }),
    );
    setImages(Object.fromEntries(imageCache));
  }, []);

  /** Opens a note by id (an unknown id starts a new note with it; `null` a new one). Saves the current one first. */
  const load = useCallback(
    async (id: string | null) => {
      await flush();
      let next: Note | undefined;
      if (id) next = (await listNotes().catch(() => [])).find((n) => n.id === id);
      if (!next) next = newNote(Date.now(), id ?? crypto.randomUUID());
      noteRef.current = next;
      history.current = createHistory(next.objects);
      dirty.current = false;
      setNote(next);
      setTick((t) => t + 1);
      await refreshImages(next.objects);
    },
    [flush, refreshImages],
  );

  const setText = useCallback((text: string) => update({ ...noteRef.current, text }), [update]);

  const apply = useCallback(
    (h: History<NoteObject[]>) => {
      history.current = h;
      setTick((t) => t + 1);
      update({ ...noteRef.current, objects: h.present });
    },
    [update],
  );
  const commitObjects = useCallback((objects: NoteObject[]) => apply(commit(history.current, objects)), [apply]);
  const undo = useCallback(() => apply(undoHistory(history.current)), [apply]);
  const redo = useCallback(() => apply(redoHistory(history.current)), [apply]);

  /** A picture was just stored: remember its data URL so it shows at once. */
  const addImageData = useCallback((file: string, dataUrl: string) => {
    imageCache.set(file, dataUrl);
    setImages(Object.fromEntries(imageCache));
  }, []);

  useEffect(() => () => void flush(), [flush]);

  return {
    note,
    images,
    load,
    flush,
    setText,
    commitObjects,
    undo,
    redo,
    canUndo: canUndo(history.current),
    canRedo: canRedo(history.current),
    addImageData,
  };
}
```

- [ ] **Step 7: `note.css`** (escopo `.note-editor`):

```css
.note-editor {
  position: relative;
  width: 560px;
  height: 380px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: #0b0b0d;
  color: #f2f2f3;
  font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
  font-size: 13px;
  outline: none;
  user-select: none;
  -webkit-user-select: none;
}
.note-editor.flash::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border: 2px solid var(--accent, #0a84ff);
  animation: note-flash 450ms ease-out;
}
@keyframes note-flash {
  from { opacity: 1; }
  to { opacity: 0; }
}
.note-editor button {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.note-bar,
.note-tools {
  flex: none;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  box-sizing: border-box;
}
.note-bar { border-bottom: 1px solid #1c1c1f; }
.note-tools { background: #101013; gap: 4px; }
.note-spacer { flex: 1; }
.note-btn {
  height: 22px;
  min-width: 22px;
  padding: 0 5px;
  display: inline-grid;
  place-items: center;
  border-radius: 6px;
  color: #b8b8be;
}
.note-btn:hover { background: #26262a; color: #f2f2f3; }
.note-btn.active { background: var(--accent, #0a84ff); color: #fff; }
.note-btn:disabled { opacity: 0.35; cursor: default; }
.note-sep { width: 1px; height: 14px; background: #2a2a2d; margin: 0 3px; }
.note-swatch { width: 14px; height: 14px; border-radius: 50%; border: 2px solid transparent; }
.note-swatch.active { border-color: #fff; }
.note-width { width: 22px; height: 22px; display: inline-grid; place-items: center; border-radius: 6px; }
.note-width i { display: block; background: currentColor; border-radius: 50%; }
.note-width.active { background: #26262a; color: #fff; }
.note-hint { color: #8a8a90; font-size: 12px; padding-left: 4px; }

.note-sheet { position: relative; width: 560px; height: 320px; flex: none; overflow: hidden; }
.note-sheet > svg { position: absolute; inset: 0; width: 560px; height: 320px; }
.note-layer-images { pointer-events: none; }
.note-text {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 12px;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: #f2f2f3;
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  user-select: text;
  -webkit-user-select: text;
}
.note-sheet.drawing .note-text { pointer-events: none; }
.note-sheet.text .note-draw { pointer-events: none; }
.note-draw { touch-action: none; cursor: crosshair; }
.note-sheet.tool-select .note-draw { cursor: default; }
.note-toast {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  padding: 5px 10px;
  border-radius: 8px;
  background: #26262a;
  color: #f2f2f3;
  font-size: 12px;
}
```

- [ ] **Step 8: `NoteEditor.tsx` básico (texto + caneta + autosave + fechar)** — esta task entrega o editor só com os modos Aa/✎, a **caneta**, cores/espessuras, desfazer/refazer e fechar; as formas/borracha/seleção (Task 10), imagens/copiar (Task 11) e histórico/novo/trocar posição (Task 12) entram nas próximas, **no mesmo arquivo**. Código:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { AppConfig } from "../lib/types";
import { SHEET } from "../lib/note";
import type { NoteObject, Point } from "../lib/note";
import { simplifyPoints } from "../lib/noteGeometry";
import { onNoteFlash } from "../lib/tauri";
import { NOTE_ICONS } from "./noteIcons";
import { NoteSvg } from "./NoteSvg";
import { useNoteDoc } from "./useNoteDoc";
import "./note.css";

export type NoteRequest = { id: string | null; nonce: number };

interface Props {
  /** Which note to show; a new `nonce` shows it again (the shortcut or the history). */
  request: NoteRequest;
  placement: "overlay" | "window";
  config: AppConfig;
  onClose: () => void;
}

export const COLORS = ["#f2f2f3", "#ffd60a", "#ff453a", "#30d158", "#0a84ff", "#ff6bd6"];
export const WIDTHS = [2, 4, 8];

type Mode = "text" | "draw";
type Tool = "pen";

export default function NoteEditor({ request, config, onClose }: Props) {
  const doc = useNoteDoc();
  const [mode, setMode] = useState<Mode>("text");
  const [tool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [widthIdx, setWidthIdx] = useState(1);
  const [live, setLive] = useState<NoteObject[] | null>(null);
  const [flash, setFlash] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const draft = useRef<NoteObject | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Open the requested note (and again every time the request changes).
  useEffect(() => {
    void doc.load(request.id).then(() => textRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.nonce]);

  // The shortcut with the note already open: blink.
  useEffect(() => {
    const un = onNoteFlash(() => {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 450);
    });
    return () => void un.then((f) => f());
  }, []);

  const close = useCallback(async () => {
    await doc.flush();
    onClose();
  }, [doc, onClose]);

  const toSheet = (e: ReactPointerEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * SHEET.width) / r.width, ((e.clientY - r.top) * SHEET.height) / r.height];
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSheet(e);
    draft.current = { type: "stroke", color, width: WIDTHS[widthIdx], points: [p] };
    setLive([...doc.note.objects, draft.current]);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = draft.current;
    if (!d || d.type !== "stroke") return;
    const next: NoteObject = { ...d, points: [...d.points, toSheet(e)] };
    draft.current = next;
    setLive([...doc.note.objects, next]);
  };
  const onUp = () => {
    const d = draft.current;
    draft.current = null;
    setLive(null);
    if (d && d.type === "stroke") doc.commitObjects([...doc.note.objects, { ...d, points: simplifyPoints(d.points) }]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      void close();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && mode === "draw") {
      e.preventDefault();
      if (e.shiftKey) doc.redo();
      else doc.undo();
    }
  };

  const shown = live ?? doc.note.objects;
  return (
    <div className={`note-editor${flash ? " flash" : ""}`} tabIndex={-1} onKeyDown={onKeyDown} style={{ ["--accent" as string]: config.accent_color }}>
      <header className="note-bar">
        <button className={mode === "text" ? "note-btn active" : "note-btn"} onClick={() => setMode("text")} title="Escrever">Aa</button>
        <button className={mode === "draw" ? "note-btn active" : "note-btn"} onClick={() => setMode("draw")} title="Desenhar">{NOTE_ICONS.pen()}</button>
        <span className="note-spacer" />
        <button className="note-btn" disabled={!doc.canUndo} onClick={doc.undo} title="Desfazer (Ctrl+Z)">{NOTE_ICONS.undo()}</button>
        <button className="note-btn" disabled={!doc.canRedo} onClick={doc.redo} title="Refazer (Ctrl+Shift+Z)">{NOTE_ICONS.redo()}</button>
        <button className="note-btn" onClick={() => void close()} title="Fechar (Esc)">{NOTE_ICONS.close()}</button>
      </header>
      <div className="note-tools">
        {mode === "draw" ? (
          <>
            {COLORS.map((c) => (
              <button key={c} className={c === color ? "note-swatch active" : "note-swatch"} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Cor ${c}`} />
            ))}
            <span className="note-sep" />
            {WIDTHS.map((w, i) => (
              <button key={w} className={i === widthIdx ? "note-width active" : "note-width"} onClick={() => setWidthIdx(i)} aria-label={`Espessura ${w}`}>
                <i style={{ width: w + 2, height: w + 2 }} />
              </button>
            ))}
          </>
        ) : (
          <span className="note-hint">Escreva aqui. Use o lápis para desenhar.</span>
        )}
      </div>
      <div className={`note-sheet ${mode === "draw" ? "drawing" : "text"} tool-${tool}`}>
        <NoteSvg className="note-layer-images" objects={doc.note.objects} images={doc.images} layer="images" />
        <textarea ref={textRef} className="note-text" value={doc.note.text} maxLength={20000} onChange={(e) => doc.setText(e.currentTarget.value)} spellCheck={false} />
        <NoteSvg
          ref={svgRef as never}
          className="note-draw"
          objects={shown}
          images={doc.images}
          layer="drawing"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
    </div>
  );
}
```

Observação: `NoteSvg` precisa repassar `ref`. Em React 19 `ref` é prop comum; como o componente espalha `...rest` no `<svg>`, `ref` já funciona (retire o cast `as never` se o TypeScript aceitar; registre Ruling se precisar ajustar a tipagem de `Props` com `ref?: Ref<SVGSVGElement>`).

`src/NoteWindow.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { AppConfig, StateSnapshot } from "./lib/types";
import { closeNoteWindow, getState, onOpenNote, onStateChanged } from "./lib/tauri";
import NoteEditor from "./note/NoteEditor";
import type { NoteRequest } from "./note/NoteEditor";

function initialRequest(): NoteRequest {
  const id = new URLSearchParams(window.location.search).get("note");
  return { id: id && id !== "new" ? id : null, nonce: 0 };
}

/** The quick note in its own window. */
export default function NoteWindow() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [request, setRequest] = useState<NoteRequest>(initialRequest);

  useEffect(() => {
    document.documentElement.style.background = "#0b0b0d";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.style.background = "#0b0b0d";
    getState().then((s: StateSnapshot) => setConfig(s.config));
    const unState = onStateChanged((s) => setConfig(s.config));
    const unOpen = onOpenNote((id) => setRequest((r) => ({ id, nonce: r.nonce + 1 })));
    return () => {
      void unState.then((f) => f());
      void unOpen.then((f) => f());
    };
  }, []);

  if (!config) return null;
  return <NoteEditor request={request} placement="window" config={config} onClose={() => void closeNoteWindow()} />;
}
```

- [ ] **Step 9: Verificar** — `bun run test`, `bun run build`. Não há teste automático do componente; a verificação do comportamento fica na Task 15 (build + teste de usuário). Confira que o autosave não grava nota vazia (o backend já garante).

- [ ] **Step 10: Commit** — `git add src && git commit -m "feat: editor de nota com texto, caneta, desfazer e autosave"`.

---

### Task 10: Formas, borracha e seleção no editor

**Files:**
- Modify: `src/note/NoteEditor.tsx`, `src/note/note.css`

**Interfaces:**
- Consumes: `noteGeometry` (Task 8), `NOTE_ICONS` (Task 9).
- Produces: ferramentas `select | pen | rect | ellipse | triangle | line | arrow | eraser`, preenchimento, Shift, `Delete`.

- [ ] **Step 1: Estender o estado e os gestos** em `NoteEditor.tsx` (substituir os trechos da caneta):

```tsx
import { constrainShape, fitObject, hitHandle, objectBounds, resizeRect, simplifyPoints, topObjectAt, translateObject } from "../lib/noteGeometry";
import type { Handle } from "../lib/noteGeometry";
import type { Rect, ShapeKind } from "../lib/note";

type Tool = "select" | "pen" | ShapeKind | "eraser";

type Gesture =
  | { kind: "draw"; draft: NoteObject }
  | { kind: "erase"; objects: NoteObject[] }
  | { kind: "move"; start: Point; index: number; original: NoteObject[] }
  | { kind: "resize"; index: number; handle: Handle; from: Rect; original: NoteObject[] };
```

Estado novo: `const [tool, setTool] = useState<Tool>("pen"); const [fill, setFill] = useState(false); const [selected, setSelected] = useState<number | null>(null); const gesture = useRef<Gesture | null>(null);` (remover `draft`/`tool` antigos).

Handlers:

```tsx
  const objects = doc.note.objects;
  const eraseAt = (g: Extract<Gesture, { kind: "erase" }>, p: Point) => {
    const i = topObjectAt(g.objects, p[0], p[1], 6, true);
    if (i >= 0) {
      g.objects = g.objects.filter((_, k) => k !== i);
      setLive(g.objects);
    }
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSheet(e);
    if (tool === "select") {
      if (selected !== null && objects[selected]) {
        const handle = hitHandle(objectBounds(objects[selected]), p[0], p[1]);
        if (handle) {
          gesture.current = { kind: "resize", index: selected, handle, from: objectBounds(objects[selected]), original: objects };
          return;
        }
      }
      const i = topObjectAt(objects, p[0], p[1]);
      setSelected(i >= 0 ? i : null);
      if (i >= 0) gesture.current = { kind: "move", start: p, index: i, original: objects };
    } else if (tool === "eraser") {
      const g: Gesture = { kind: "erase", objects };
      gesture.current = g;
      eraseAt(g, p);
    } else if (tool === "pen") {
      const d: NoteObject = { type: "stroke", color, width: WIDTHS[widthIdx], points: [p] };
      gesture.current = { kind: "draw", draft: d };
      setLive([...objects, d]);
    } else {
      const d: NoteObject = { type: "shape", kind: tool, color, width: WIDTHS[widthIdx], fill, x1: p[0], y1: p[1], x2: p[0], y2: p[1] };
      gesture.current = { kind: "draw", draft: d };
      setLive([...objects, d]);
    }
  };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = toSheet(e);
    if (g.kind === "draw") {
      const d = g.draft;
      g.draft =
        d.type === "stroke"
          ? { ...d, points: [...d.points, p] }
          : d.type === "shape"
            ? (() => {
                const [x2, y2] = constrainShape(d.kind, d.x1, d.y1, p[0], p[1], e.shiftKey);
                return { ...d, x2, y2 };
              })()
            : d;
      setLive([...objects, g.draft]);
    } else if (g.kind === "move") {
      const [dx, dy] = [p[0] - g.start[0], p[1] - g.start[1]];
      setLive(g.original.map((o, i) => (i === g.index ? translateObject(o, dx, dy) : o)));
    } else if (g.kind === "resize") {
      const to = resizeRect(g.from, g.handle, p[0], p[1]);
      setLive(g.original.map((o, i) => (i === g.index ? fitObject(o, g.from, to) : o)));
    } else {
      eraseAt(g, p);
    }
  };

  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    const result = live;
    setLive(null);
    if (!g) return;
    if (g.kind === "draw") {
      let d = g.draft;
      if (d.type === "stroke") d = { ...d, points: simplifyPoints(d.points) };
      if (d.type === "shape" && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 3) return; // a click, not a shape
      doc.commitObjects([...objects, d]);
    } else if (result) {
      doc.commitObjects(result);
      if (g.kind === "erase") setSelected(null);
    }
  };
```

Tecla `Delete` em `onKeyDown`: `else if (e.key === "Delete" && mode === "draw" && selected !== null && (e.target as HTMLElement).tagName !== "TEXTAREA") { e.preventDefault(); doc.commitObjects(objects.filter((_, i) => i !== selected)); setSelected(null); }`. Ao mudar de nota ou de ferramenta, `setSelected(null)` (efeito em `[request.nonce]` e em `setTool`).

Faixa de ferramentas (no `mode === "draw"`), antes das cores:

```tsx
            {(["select", "pen", "rect", "ellipse", "triangle", "line", "arrow", "eraser"] as Tool[]).map((t) => (
              <button key={t} className={t === tool ? "note-btn active" : "note-btn"} onClick={() => { setTool(t); setSelected(null); }} title={TOOL_TITLES[t]}>
                {NOTE_ICONS[t]()}
              </button>
            ))}
            <button className={fill ? "note-btn active" : "note-btn"} onClick={() => setFill((f) => !f)} title="Preencher formas">{NOTE_ICONS.fill()}</button>
            <span className="note-sep" />
```

com `const TOOL_TITLES: Record<Tool, string> = { select: "Selecionar (mover, redimensionar, Delete)", pen: "Caneta", rect: "Quadrado (Shift = proporcional)", ellipse: "Círculo (Shift = proporcional)", triangle: "Triângulo", line: "Linha (Shift = ângulos de 45°)", arrow: "Seta (Shift = ângulos de 45°)", eraser: "Borracha" };`. A classe da folha passa a `tool-${tool}`.

Sobreposição da seleção: dentro de `<NoteSvg ...>` do desenho, passar `children` com o contorno e as 4 alças quando `tool === "select" && selected !== null && shown[selected]`:

```tsx
          {tool === "select" && selected !== null && shown[selected] && (() => {
            const b = objectBounds(shown[selected]);
            const corners: Point[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
            return (
              <g pointerEvents="none">
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#0a84ff" strokeDasharray="4 3" />
                {corners.map(([x, y], i) => <rect key={i} x={x - 4} y={y - 4} width={8} height={8} fill="#fff" stroke="#0a84ff" />)}
              </g>
            );
          })()}
```

CSS: nenhum extra além do cursor (já em `.tool-select`); `.note-btn svg` ok.

- [ ] **Step 2: Verificar** — `bun run test` e `bun run build` (sem erros de tipo).

- [ ] **Step 3: Commit** — `git add src/note && git commit -m "feat: formas, borracha e seleção (mover, redimensionar, Delete) nas notas"`.

---

### Task 11: Imagens (colar, arrastar) e copiar como imagem

**Files:**
- Create: `src/note/imageImport.ts`, `src/note/exportImage.ts`
- Modify: `src/note/NoteEditor.tsx`, `src/note/note.css`

**Interfaces:**
- Consumes: `scaleToMax`, `fitInto`, `wrapText` (Task 8), `saveNoteImage`, `readImageFile` (Task 7), `NoteSvg` (Task 9).
- Produces: `prepareImage(blob) -> Promise<{ ext: "png" | "jpg"; base64: string; dataUrl: string; w: number; h: number }>`, `blobFromBase64(ext, base64)`, `copyNoteAsImage(note, images)`.

- [ ] **Step 1: `imageImport.ts`**:

```ts
import { scaleToMax } from "../lib/noteMeta";

export const MAX_SIDE = 1600;

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Shrinks a picture to at most 1600 px on its longest side and re-encodes it (PNG, or JPEG for a JPEG). */
export async function prepareImage(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const { w, h } = scaleToMax(bitmap.width, bitmap.height, MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const jpeg = blob.type === "image/jpeg";
  const out = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), jpeg ? "image/jpeg" : "image/png", 0.9),
  );
  const base64 = await blobToBase64(out);
  const ext = jpeg ? ("jpg" as const) : ("png" as const);
  return { ext, base64, dataUrl: `data:${jpeg ? "image/jpeg" : "image/png"};base64,${base64}`, w, h };
}

/** A file read by the backend (extension + base64) as a Blob the browser can decode. */
export async function blobFromBase64(ext: string, base64: string): Promise<Blob> {
  const type = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/png";
  return (await fetch(`data:${type};base64,${base64}`)).blob();
}
```

- [ ] **Step 2: `exportImage.ts`**:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { SHEET } from "../lib/note";
import type { Note } from "../lib/note";
import { wrapText } from "../lib/noteMeta";
import { NoteSvg } from "./NoteSvg";

const SCALE = 2;

async function drawLayer(ctx: CanvasRenderingContext2D, note: Note, images: Record<string, string>, layer: "images" | "drawing") {
  const markup = renderToStaticMarkup(<NoteSvg objects={note.objects} images={images} layer={layer} />);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg"));
      img.src = url;
    });
    ctx.drawImage(img, 0, 0, SHEET.width, SHEET.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draws the whole sheet (pictures, text, drawing) on a dark background and puts it on the clipboard as a PNG. */
export async function copyNoteAsImage(note: Note, images: Record<string, string>): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = SHEET.width * SCALE;
  canvas.height = SHEET.height * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, SHEET.width, SHEET.height);
  await drawLayer(ctx, note, images, "images");
  ctx.fillStyle = "#f2f2f3";
  ctx.font = '14px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = "top";
  wrapText(note.text, SHEET.width - 24, (s) => ctx.measureText(s).width).forEach((line, i) => ctx.fillText(line, 12, 12 + i * 20));
  await drawLayer(ctx, note, images, "drawing");
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
```

- [ ] **Step 3: Ligar no editor** — em `NoteEditor.tsx`:

Imports: `import { getCurrentWebview } from "@tauri-apps/api/webview"; import { readImageFile, saveNoteImage } from "../lib/tauri"; import { fitInto } from "../lib/noteMeta"; import { blobFromBase64, prepareImage } from "./imageImport"; import { copyNoteAsImage } from "./exportImage";`. Estado `const [toast, setToast] = useState<string | null>(null);` com `const say = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 2200); };`.

```tsx
  const importBlob = useCallback(
    async (blob: Blob) => {
      const current = doc.note.objects;
      if (current.filter((o) => o.type === "image").length >= 10) return say("Máximo de 10 imagens por nota");
      try {
        const img = await prepareImage(blob);
        const file = await saveNoteImage(img.base64, img.ext);
        doc.addImageData(file, img.dataUrl);
        const size = fitInto(img.w, img.h, 300, 220);
        const object: NoteObject = { type: "image", file, x: (SHEET.width - size.w) / 2, y: (SHEET.height - size.h) / 2, w: size.w, h: size.h };
        doc.commitObjects([...doc.note.objects, object]);
        setMode("draw");
        setTool("select");
        setSelected(doc.note.objects.length); // the new object is the last one
      } catch (e) {
        say(`Não deu para usar a imagem: ${String(e)}`);
      }
    },
    [doc],
  );
```

Colar: no `div.note-editor`, `onPaste={(e) => { const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/")); if (file) { e.preventDefault(); void importBlob(file); } }}`.

Arrastar (evento do Tauri, só enquanto o editor está montado):

```tsx
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop") return;
      for (const path of event.payload.paths) {
        try {
          const file = await readImageFile(path);
          await importBlob(await blobFromBase64(file.ext, file.data_base64));
        } catch {
          say("Esse arquivo não é uma imagem aceita");
        }
      }
    });
    return () => void un.then((f) => f());
  }, [importBlob]);
```

Botão copiar na barra: `<button className="note-btn" onClick={() => void copyNoteAsImage(doc.note, doc.images).then(() => say("Copiado como imagem"), () => say("Não consegui copiar"))} title="Copiar como imagem">{NOTE_ICONS.copy()}</button>` (antes do desfazer). Toast: `{toast && <div className="note-toast">{toast}</div>}` dentro de `.note-sheet`.

- [ ] **Step 4: Verificar** — `bun run test` e `bun run build`.

- [ ] **Step 5: Commit** — `git add src/note && git commit -m "feat: imagens nas notas (colar e arrastar) e copiar a nota como imagem"`.

---

### Task 12: Histórico, nota nova, apagar com confirmação e trocar a posição

**Files:**
- Create: `src/note/NoteHistory.tsx`, `src/note/NoteThumb.tsx`
- Modify: `src/note/NoteEditor.tsx`, `src/note/note.css`

**Interfaces:**
- Consumes: `listNotes`, `deleteNote`, `onNotesChanged`, `openNote`, `updateSettings` (Task 7 e existentes), `noteTitle`, `filterNotes`, `formatNoteDate` (Task 8), `NoteSvg` (Task 9).
- Produces: `NoteThumb({ note, images })`; `NoteHistory({ currentId, onPick, onNew })`; hook/função `useNotesList()` exportada de `NoteHistory.tsx` para reutilizar na aba Notas (Task 14): `useNotesList(): { notes: Note[]; images: Record<string,string> }`.

- [ ] **Step 1: `NoteThumb.tsx`**:

```tsx
import type { Note } from "../lib/note";
import { NoteSvg } from "./NoteSvg";

/** A small picture of a note: the drawing and the first lines of text. */
export default function NoteThumb({ note, images }: { note: Note; images: Record<string, string> }) {
  return (
    <div className="note-thumb">
      <NoteSvg objects={note.objects} images={images} />
      <p>{note.text.trim().slice(0, 90)}</p>
    </div>
  );
}
```

- [ ] **Step 2: `NoteHistory.tsx`**:

```tsx
import { useEffect, useState } from "react";
import type { Note } from "../lib/note";
import { filterNotes, formatNoteDate, noteTitle } from "../lib/noteMeta";
import { deleteNote, listNotes, onNotesChanged, readNoteImage } from "../lib/tauri";
import { NOTE_ICONS } from "./noteIcons";
import NoteThumb from "./NoteThumb";

/** The saved notes (most recent first), kept up to date, with the pictures they use loaded. */
export function useNotesList() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = await listNotes().catch(() => [] as Note[]);
      if (!alive) return;
      setNotes(list);
      const files = list.flatMap((n) => n.objects.flatMap((o) => (o.type === "image" ? [o.file] : [])));
      const loaded: Record<string, string> = {};
      await Promise.all(files.map(async (f) => { try { loaded[f] = await readNoteImage(f); } catch { /* missing */ } }));
      if (alive) setImages((old) => ({ ...old, ...loaded }));
    };
    void load();
    const un = onNotesChanged(() => void load());
    return () => {
      alive = false;
      void un.then((f) => f());
    };
  }, []);

  return { notes, images };
}

/** The list that slides over the sheet: filter, open, delete (with a quiet confirmation). */
export default function NoteHistory({ currentId, onPick, onNew }: { currentId: string; onPick: (id: string) => void; onNew: () => void }) {
  const { notes, images } = useNotesList();
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const shown = filterNotes(notes, query);

  return (
    <aside className="note-history" onKeyDown={(e) => e.key === "Escape" && confirming && (e.stopPropagation(), setConfirming(null))}>
      <div className="note-history-head">
        <input autoFocus placeholder="Filtrar notas…" value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <button className="note-btn" onClick={onNew} title="Nota nova (Ctrl+N)">{NOTE_ICONS.plus()}</button>
      </div>
      <div className="note-history-list">
        {shown.length === 0 && <p className="note-hint">{notes.length === 0 ? "Nenhuma nota salva ainda." : "Nada encontrado."}</p>}
        {shown.map((n) => (
          <div key={n.id} className={n.id === currentId ? "note-item current" : "note-item"}>
            <button className="note-item-open" onClick={() => onPick(n.id)}>
              <NoteThumb note={n} images={images} />
              <span className="note-item-title">{noteTitle(n)}</span>
              <span className="note-item-date">{formatNoteDate(n.updated_ms)}</span>
            </button>
            {confirming === n.id ? (
              <span className="note-confirm">
                Apagar?
                <button onClick={() => { void deleteNote(n.id); setConfirming(null); }}>Sim</button>
                <button onClick={() => setConfirming(null)}>Não</button>
              </span>
            ) : (
              <button className="note-btn note-item-del" onClick={() => setConfirming(n.id)} title="Apagar">{NOTE_ICONS.close()}</button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Ligar no editor** — em `NoteEditor.tsx`: estado `historyOpen`; `const newNote = () => setRequest...` — como o `request` é dado pelo host, o editor precisa trocar de nota por conta própria: adicionar `const openId = async (id: string | null) => { setSelected(null); await doc.load(id); setHistoryOpen(false); textRef.current?.focus(); };`. Botões na barra (antes de `Aa`): `<button className="note-btn" onClick={() => setHistoryOpen((o) => !o)} title="Histórico (Ctrl+H)">{NOTE_ICONS.history()}</button><button className="note-btn" onClick={() => void openId(null)} title="Nota nova (Ctrl+N)">{NOTE_ICONS.plus()}</button><span className="note-sep" />`. Teclas em `onKeyDown`: `Ctrl+N` → `openId(null)`; `Ctrl+H` → alterna o histórico (ambos com `preventDefault`). Renderizar `{historyOpen && <NoteHistory currentId={doc.note.id} onPick={(id) => void openId(id)} onNew={() => void openId(null)} />}` como último filho de `.note-editor`.

Trocar a posição (botão ao lado de copiar):

```tsx
  const switchPlacement = async () => {
    await doc.flush();
    const next = placement === "overlay" ? "window" : "overlay";
    await updateSettings({ ...config, note_placement: next });
    await openNote(doc.note.id);
    onClose();
  };
```
com `<button className="note-btn" onClick={() => void switchPlacement()} title={placement === "overlay" ? "Abrir numa janela" : "Abrir sobre o painel"}>{NOTE_ICONS.placement()}</button>`; importar `updateSettings`, `openNote`. (`NoteWindow.onClose` fecha a janela; `overlay` fecha o overlay.)

CSS adicional em `note.css`:

```css
.note-history {
  position: absolute;
  top: 28px;
  left: 0;
  bottom: 0;
  width: 220px;
  display: flex;
  flex-direction: column;
  background: #121215;
  border-right: 1px solid #2a2a2d;
  box-shadow: 8px 0 18px rgba(0, 0, 0, 0.4);
  z-index: 3;
  animation: note-slide 160ms ease-out;
}
@keyframes note-slide { from { transform: translateX(-12px); opacity: 0; } }
.note-history-head { display: flex; gap: 4px; padding: 6px; }
.note-history-head input { flex: 1; min-width: 0; background: #1a1a1d; border: 1px solid #2a2a2d; border-radius: 6px; color: #f2f2f3; padding: 3px 6px; font: inherit; outline: none; user-select: text; }
.note-history-list { flex: 1; overflow-y: auto; padding: 0 6px 6px; display: flex; flex-direction: column; gap: 6px; }
.note-item { position: relative; background: #1a1a1d; border-radius: 8px; }
.note-item.current { box-shadow: inset 0 0 0 1px var(--accent, #0a84ff); }
.note-item-open { display: block; width: 100%; text-align: left; padding: 6px; }
.note-item-title { display: block; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px; }
.note-item-date { color: #8a8a90; font-size: 11px; }
.note-item-del { position: absolute; top: 4px; right: 4px; opacity: 0; }
.note-item:hover .note-item-del { opacity: 1; }
.note-confirm { position: absolute; top: 4px; right: 4px; display: flex; gap: 6px; align-items: center; background: #26262a; border-radius: 6px; padding: 2px 6px; font-size: 12px; }
.note-confirm button { color: var(--accent, #0a84ff); }
.note-thumb { position: relative; width: 100%; aspect-ratio: 560 / 320; overflow: hidden; border-radius: 4px; background: #0b0b0d; }
.note-thumb svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.note-thumb p { position: absolute; inset: 0; margin: 0; padding: 4px 6px; font-size: 9px; line-height: 11px; color: #b8b8be; white-space: pre-wrap; overflow: hidden; pointer-events: none; }
```

- [ ] **Step 2 (verificar):** `bun run test`, `bun run build`.

- [ ] **Step 4: Commit** — `git add src/note && git commit -m "feat: histórico da nota (filtro, nova nota, apagar com confirmação) e troca de posição"`.

---

### Task 13: A nota sobre o painel do widget + botão "Nota"

**Files:**
- Modify: `src/Widget.tsx`, `src/Widget.css`, `src/widget/Panel.tsx`, `src/widget/icons.tsx`

**Interfaces:**
- Consumes: `NoteEditor` (Task 9), `onOpenNote`, `setNoteOverlayOpen`, `setWidgetExpanded`, `openNote` (Task 7), `pickShape` com `noteOpen` (Task 6).
- Produces: estado `note: { open: boolean; request: NoteRequest }` no `Widget`; botão "Nota" no cabeçalho do painel; CSS `.note-root` por borda.

- [ ] **Step 1: Ícone e botão** — em `widget/icons.tsx` adicionar `export const NoteIcon = ({ size = 13 }: IconProps) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M15 3v4h4" /><path d="M9 12h6" /><path d="M9 16h4" /></svg>);`. Em `Panel.tsx`: prop `onNote: () => void`, import `NoteIcon`, e, antes do botão `pin`: `<button type="button" className="pin" aria-label="Nota rápida" title="Nota rápida" onClick={onNote}><NoteIcon /></button>`.

- [ ] **Step 2: Widget** — em `Widget.tsx`:

Imports: `import { onOpenNote, openNote, setNoteOverlayOpen } from "./lib/tauri"; import NoteEditor from "./note/NoteEditor"; import type { NoteRequest } from "./note/NoteEditor";`.

Estado e ref: 

```tsx
  const [note, setNote] = useState<{ open: boolean; request: NoteRequest }>({ open: false, request: { id: null, nonce: 0 } });
  const noteOpen = useRef(false);
  noteOpen.current = note.open;
```

Eventos (junto dos outros `useEffect`s):

```tsx
  useEffect(() => {
    const un = onOpenNote((id) => {
      setNote((n) => ({ open: true, request: { id, nonce: n.request.nonce + 1 } }));
      fire(setNoteOverlayOpen(true));
      fire(setWidgetExpanded(true));
    });
    return () => void un.then((f) => f());
  }, []);

  const closeNote = () => {
    setNote((n) => ({ ...n, open: false }));
    fire(setNoteOverlayOpen(false));
    if (!pinned) hover.closeNow();
    if (!pinned && phase === "closed") fire(setWidgetExpanded(false));
  };
```

Guardas: no `onChange` do `useHoverOpen`, primeira linha `if (noteOpen.current) return;`; em `togglePanel.current`: `if (noteOpen.current) return;` no início; no efeito do `pinned` (Esc/blur), as funções `onKey`/`onBlur` ganham `if (noteOpen.current) return;`; em `useIdleClose`: `pinned && phase === "open" && !note.open`. `pickShape`: `noteOpen: note.open,`. Classe da forma: `const shownPhase = note.open ? "open" : phase;` usada em `className={`shell-frame ${shownPhase} ...`}` e `shell ${shownPhase}`. Conteúdo: `{note.open ? <NoteEditor request={note.request} placement="overlay" config={config} onClose={closeNote} /> : phase === "closed" ? <Notch .../> : <Panel ... onNote={() => fire(openNote(null))} />}` (envolver o `NoteEditor` num `<div className="note-root">`). `ProgressLine` recebe `visible={config.progress_line && timer.status !== "idle" && !note.open}`.

- [ ] **Step 3: CSS** — em `Widget.css`, perto do `.panel`:

```css
/* The quick note over the panel: laid out at its full size and revealed by the
   growing shape, hanging from the screen edge like the panel. */
.note-root {
  position: absolute;
  top: 0;
  left: 50%;
  width: 560px;
  height: 380px;
  margin-left: -280px;
}
.widget-root[data-edge="left"] .note-root {
  top: 50%;
  left: 0;
  margin-left: 0;
  margin-top: -190px;
}
.widget-root[data-edge="right"] .note-root {
  top: 50%;
  left: auto;
  right: 0;
  margin-left: 0;
  margin-top: -190px;
}
```

(O `.widget-root` tem `user-select: none` e `color`; o `note.css` já define o seu próprio.)

- [ ] **Step 4: Verificar** — `bun run test`, `bun run build`, `cargo test --manifest-path src-tauri/Cargo.toml`.

- [ ] **Step 5: Commit** — `git add src && git commit -m "feat: nota sobre o painel do widget, botão Nota no painel e guardas do hover"`.

---

### Task 14: Aba "Notas", ícone, atalho em Geral e README

**Files:**
- Create: `src/settings/NotesSection.tsx`
- Modify: `src/App.tsx`, `src/settings/icons.tsx`, `src/settings/icons.test.tsx`, `src/settings/GeneralSection.tsx`, `src/App.css`, `README.md`

**Interfaces:**
- Consumes: `useNotesList`, `NoteThumb` (Task 12), `openNote`, `deleteNote`, `setShortcut`, `AppConfig.note_placement`.

- [ ] **Step 1: Ícone (teste primeiro)** — em `icons.test.tsx`, trocar a lista esperada para `["focus", "general", "github", "notch", "notes"]` e rodar `bun run test -- src/settings/icons.test.tsx` (FAIL). Em `icons.tsx`, adicionar (antes de `notch`):

```tsx
  notes: () => (
    <Icon>
      <path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </Icon>
  ),
```

e rodar de novo (PASS).

- [ ] **Step 2: `NotesSection.tsx`**:

```tsx
import { useState } from "react";
import { deleteNote, openNote } from "../lib/tauri";
import { formatNoteDate, noteTitle } from "../lib/noteMeta";
import NoteThumb from "../note/NoteThumb";
import { useNotesList } from "../note/NoteHistory";
import type { NotePlacement } from "../lib/types";
import Row from "./Row";
import type { SectionProps } from "./Row";

const PLACEMENTS: { id: NotePlacement; label: string }[] = [
  { id: "overlay", label: "Sobre o painel" },
  { id: "window", label: "Em janela" },
];

export default function NotesSection({ config, set }: SectionProps) {
  const { notes, images } = useNotesList();
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <>
      <p className="lead">Rascunhos rápidos para escrever e desenhar. Abra uma nota nova de qualquer lugar com o atalho (em Geral).</p>
      <div className="group">
        <Row title="Abrir a nota" hint="Sobre o painel do widget, ou numa janela no meio do monitor.">
          <div className="segmented" role="radiogroup" aria-label="Onde a nota abre">
            {PLACEMENTS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={config.note_placement === p.id} onClick={() => set({ note_placement: p.id })}>
                {p.label}
              </button>
            ))}
          </div>
        </Row>
      </div>
      <button type="button" className="notes-new" onClick={() => void openNote(null)}>Nova nota</button>
      {notes.length === 0 ? (
        <p className="empty">Nenhuma nota ainda.</p>
      ) : (
        <div className="notes-grid">
          {notes.map((n) => (
            <div key={n.id} className="notes-card">
              <button type="button" className="notes-open" onClick={() => void openNote(n.id)}>
                <NoteThumb note={n} images={images} />
                <strong>{noteTitle(n)}</strong>
                <span>{formatNoteDate(n.updated_ms)}</span>
              </button>
              {confirming === n.id ? (
                <span className="notes-confirm">
                  Apagar?
                  <button type="button" onClick={() => { void deleteNote(n.id); setConfirming(null); }}>Sim</button>
                  <button type="button" onClick={() => setConfirming(null)}>Não</button>
                </span>
              ) : (
                <button type="button" className="notes-del" aria-label="Apagar a nota" onClick={() => setConfirming(n.id)}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Ligar** — `App.tsx`: `type Section = "focus" | "notes" | "notch" | "general" | "github";`; em `SECTIONS`, depois de `focus`: `{ id: "notes", label: "Notas", color: "#bf5af2" },`; importar `NotesSection` e renderizar `{section === "notes" && <NotesSection config={state.config} set={set} />}`; importar `"./note/note.css"` não é necessário (as miniaturas usam as classes `.note-thumb`, que ficam em `note.css`: **importe** `./note/note.css` em `NotesSection.tsx` para o CSS existir na janela de configuração).

`GeneralSection.tsx`: `saveShortcut` aceita `"toggle" | "panel" | "note"`; novo `Row`: `<Row title="Nota rápida" hint="Abre uma nota nova em qualquer lugar. Com uma nota aberta, só traz ela pra frente."><ShortcutInput label="Atalho de nota rápida" value={config.shortcut_note} onChange={(text) => saveShortcut("note", text)} /></Row>` depois do `Row` do painel.

`App.css` (escopo `.settings`): 

```css
.settings .notes-new { margin: 0 0 14px; padding: 6px 12px; border: none; border-radius: 8px; background: var(--accent); color: #fff; font: inherit; cursor: pointer; }
.settings .notes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.settings .notes-card { position: relative; background: #232326; border-radius: 10px; }
.settings .notes-open { display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 8px; border: none; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.settings .notes-open strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.settings .notes-open span { color: #8a8a90; font-size: 11px; }
.settings .notes-del { position: absolute; top: 6px; right: 8px; border: none; background: #000a; border-radius: 6px; color: #fff; width: 20px; height: 20px; cursor: pointer; opacity: 0; }
.settings .notes-card:hover .notes-del { opacity: 1; }
.settings .notes-confirm { position: absolute; top: 6px; right: 6px; display: flex; gap: 8px; align-items: center; background: #000c; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.settings .notes-confirm button { border: none; background: none; color: var(--accent); font: inherit; cursor: pointer; }
```

README: no bloco "O que tem nas configurações" (tabela), no lugar da linha do Projetos (já removida), adicionar `| **Notas** | galeria das notas rápidas (escrever, desenhar, imagens), onde elas abrem e o atalho em **Geral** |`; e, depois do parágrafo da posição do widget, um parágrafo: `**Notas rápidas:** `Ctrl+Alt+N` (ou o botão "Nota" do painel) abre uma nota nova em qualquer lugar: escreva, desenhe (caneta, quadrado, círculo, triângulo, linha, seta), cole ou arraste imagens e copie a nota como imagem. Tudo é salvo sozinho; o histórico fica no botão ☰ da nota e na aba **Notas** da configuração.`

- [ ] **Step 4: Verificar** — `bun run test`, `bun run build`.

- [ ] **Step 5: Commit** — `git add src README.md && git commit -m "feat: aba Notas na configuração, atalho em Geral, ícone e README"`.

---

### Task 15: Verificação no app real e teste de usuário

**Files:** nenhum código novo (correções, se houver, na task dona, em commits `fix:`).

- [ ] **Step 1: Suítes** — `cargo test --manifest-path src-tauri/Cargo.toml`, `bun run test`, `bun run build`. Expected: tudo verde, sem warnings.

- [ ] **Step 2: Build** — fechar o `focusbrew` aberto (`Stop-Process -Name focusbrew -Force`), `bun run dist`, e fazer backup de `%APPDATA%\sthevandev\focusbrew\data` e `config\settings.json` para a pasta temporária da sessão (inclui `notes.json` e `notes\images` se existirem).

- [ ] **Step 3: Teste de usuário por subagente** (rodada 1): o subagente usa o app como uma pessoa e confere, com capturas de tela: atalho `Ctrl+Alt+N` abre nota nova (sobre o painel e em janela); escrever; desenhar com caneta; as 5 formas (Shift); preencher; selecionar, mover, redimensionar, `Delete`; borracha; desfazer/refazer; colar uma imagem (`Ctrl+V` de um print) e arrastar um arquivo; copiar como imagem (colar em outro lugar); histórico (☰, filtro, trocar de nota, nota nova, apagar com a confirmação); trocar a posição; atalho com a nota aberta (traz para frente e pisca, sem criar nota); aba **Notas** (cartões, abrir, apagar, "Abrir a nota", ícone); atalho novo em **Geral**; **regressão**: painel, hover, arrastar tarefas, as 3 bordas do widget com a janela agora de 380 de altura, auto-close do painel; fechar e reabrir o app e ver as notas guardadas. O subagente **só digita com o app em foco** (guarda de janela) e restaura os backups no fim.

- [ ] **Step 4: Corrigir** o que a rodada achar (cada correção com teste que falha antes, quando for lógica), rebuildar e repetir uma rodada curta só do que foi corrigido.

- [ ] **Step 5: Final** — instalar o build final por cima do app instalado, conferir que os dados do usuário estão intactos (hashes), e registrar a sessão no vault (nota principal do focusbrew + nota de sessão).

---

## Self-Review

**Cobertura da spec:** §2 acesso → Tasks 1, 2, 7, 13, 14; §3 onde abre/overlay/janela → Tasks 5, 6, 7, 13 (+ troca na 12); §4 folha, ferramentas, copiar → Tasks 8–11; §5 imagens → Tasks 4, 7, 11; §6 histórico/título/apagar → Tasks 8 e 12; §7 aba Notas → Task 14; §8 dados/limites/config/comandos/eventos → Tasks 1, 3, 4, 7; §9 impacto → Tasks 2, 5, 6, 7, 13; §10 testes → cada task + Task 15.

**Placeholders:** nenhum "TBD"/"TODO"; o único ponto de decisão deixado ao executor é o Ruling da altura da folha (já decidido: 560×320), a tipagem do `ref` do `NoteSvg` (Task 9, instrução explícita) e a disponibilidade de `monitor_from_point` (Task 7, com fallback explícito).

**Consistência de tipos:** `Note`/`NoteObject` em Rust (`type` em minúsculas: `stroke`/`shape`/`image`, `kind` em minúsculas) ↔ TS (`src/lib/note.ts`); `NotePlacement` `overlay`/`window` nos dois lados; comandos com argumentos em camelCase no JS (`dataBase64`) ↔ snake_case no Rust (`data_base64`); eventos `notes-changed`, `open-note`, `note-flash`; `NOTE_ICONS` e `SECTION_ICONS.notes`; `NoteRequest { id, nonce }` usado por `NoteWindow`, `Widget` e `NoteEditor`.
