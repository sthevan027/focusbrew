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
