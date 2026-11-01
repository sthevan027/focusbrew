//! Safe loading of the data files: a file that could not be read must never be
//! overwritten by a later save. Loading says whether the file is `writable`;
//! saves skip a blocked file until it is known to be safe again.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

pub struct Loaded<T> {
    pub value: T,
    /// `false` = the file exists but was neither read nor moved aside: do not write it.
    pub writable: bool,
    /// The file existed with content and parsed (the value is that content).
    #[allow(dead_code)]
    pub had_data: bool,
}

/// Describes a JSON error without echoing the text of the file.
pub fn serde_reason(e: &serde_json::Error) -> String {
    format!("{:?} at line {} column {}", e.classify(), e.line(), e.column())
}

pub fn io_reason(e: &io::Error) -> String {
    format!("{:?}", e.kind())
}

type Quarantine<'a> = &'a dyn Fn(&Path, i64) -> io::Result<PathBuf>;

enum Disk<T> {
    Absent,
    Data(T),
    Unreadable(String),
    Corrupt(String),
}

type Reader<'a> = &'a dyn Fn(&Path) -> io::Result<Vec<u8>>;

fn inspect<T>(path: &Path, read: Reader, parse: &dyn Fn(&str) -> Result<T, serde_json::Error>) -> Disk<T> {
    match read(path) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(raw) if raw.trim().is_empty() => Disk::Absent,
            Ok(raw) => match parse(&raw) {
                Ok(v) => Disk::Data(v),
                Err(e) => Disk::Corrupt(serde_reason(&e)),
            },
            // Bad bytes are bad content (a parse problem), not a lock problem.
            Err(_) => Disk::Corrupt("invalid UTF-8".to_string()),
        },
        Err(e) if e.kind() == io::ErrorKind::NotFound => Disk::Absent,
        Err(e) => Disk::Unreadable(io_reason(&e)),
    }
}

fn move_aside(path: &Path, stamp_ms: i64, what: &str, reason: &str, quarantine: Quarantine) -> bool {
    match quarantine(path, stamp_ms) {
        Ok(dest) => {
            tracing::error!(what, from = %path.display(), to = %dest.display(), reason, "file unreadable, moved aside");
            true
        }
        Err(e) => {
            tracing::error!(what, path = %path.display(), reason, error = %io_reason(&e), "file unreadable and could not be moved aside; writes to it are blocked");
            false
        }
    }
}

pub fn load_guarded<T: Default>(
    path: &Path,
    stamp_ms: i64,
    what: &str,
    parse: &dyn Fn(&str) -> Result<T, serde_json::Error>,
    quarantine: Quarantine,
) -> Loaded<T> {
    load_guarded_with(path, stamp_ms, what, &|p| fs::read(p), parse, quarantine)
}

fn load_guarded_with<T: Default>(
    path: &Path,
    stamp_ms: i64,
    what: &str,
    read: Reader,
    parse: &dyn Fn(&str) -> Result<T, serde_json::Error>,
    quarantine: Quarantine,
) -> Loaded<T> {
    match inspect(path, read, parse) {
        Disk::Absent => Loaded { value: T::default(), writable: true, had_data: false },
        Disk::Data(value) => Loaded { value, writable: true, had_data: true },
        Disk::Unreadable(reason) => {
            tracing::error!(what, path = %path.display(), reason, "file could not be read; writes to it are blocked");
            Loaded { value: T::default(), writable: false, had_data: false }
        }
        Disk::Corrupt(reason) => {
            let moved = move_aside(path, stamp_ms, what, &reason, quarantine);
            Loaded { value: T::default(), writable: moved, had_data: false }
        }
    }
}

/// Second look at a blocked file. `true` only when it is gone/blank or its
/// corrupt content has now been moved aside. A file that reads fine now holds
/// data this session never loaded, so it stays blocked until the next start.
pub fn recheck_writable<T>(
    path: &Path,
    parse: &dyn Fn(&str) -> Result<T, serde_json::Error>,
    quarantine: Quarantine,
) -> bool {
    match inspect(path, &|p| fs::read(p), parse) {
        Disk::Absent => true,
        Disk::Data(_) | Disk::Unreadable(_) => false,
        Disk::Corrupt(reason) => move_aside(path, chrono::Utc::now().timestamp_millis(), "recheck", &reason, quarantine),
    }
}

/// Runs `save` unless `blocked`; a blocked file is re-checked first and the
/// skip is logged (what/path only).
pub fn save_unless_blocked(
    what: &str,
    path: &Path,
    blocked: &AtomicBool,
    recheck: &dyn Fn() -> bool,
    save: impl FnOnce() -> io::Result<()>,
) -> io::Result<()> {
    if blocked.load(Ordering::SeqCst) {
        if recheck() {
            blocked.store(false, Ordering::SeqCst);
        } else {
            tracing::error!(what, path = %path.display(), "save skipped: the file could not be read at startup");
            return Ok(());
        }
    }
    save()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};

    fn temp_dir() -> PathBuf {
        let d = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn parse(raw: &str) -> Result<Vec<String>, serde_json::Error> {
        serde_json::from_str(raw)
    }

    fn failing_quarantine(_: &Path, _: i64) -> io::Result<PathBuf> {
        Err(io::Error::new(io::ErrorKind::PermissionDenied, "locked"))
    }

    #[test]
    fn a_non_utf8_file_is_corrupt_so_it_is_quarantined_and_stays_writable() {
        let dir = temp_dir();
        let p = dir.join("x.json");
        fs::write(&p, [0xff, 0xfe, 0xfd]).unwrap();
        let l = load_guarded::<Vec<String>>(&p, 3, "x", &parse, &crate::fsutil::quarantine);
        assert!(l.value.is_empty());
        assert!(l.writable);
        assert!(!p.exists());
        assert_eq!(fs::read(dir.join("x.corrupt-3.json")).unwrap(), vec![0xff, 0xfe, 0xfd]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_real_read_error_is_not_quarantined_and_blocks_writes() {
        let dir = temp_dir();
        let p = dir.join("x.json");
        fs::write(&p, "[\"keep\"]").unwrap();
        let denied = |_: &Path| -> io::Result<Vec<u8>> { Err(io::Error::from(io::ErrorKind::PermissionDenied)) };
        let l = load_guarded_with::<Vec<String>>(&p, 1, "x", &denied, &parse, &crate::fsutil::quarantine);
        assert!(l.value.is_empty());
        assert!(!l.writable);
        assert_eq!(fs::read_to_string(&p).unwrap(), "[\"keep\"]", "original untouched");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1, "nothing quarantined");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_parse_error_with_a_failing_quarantine_blocks_and_a_save_leaves_the_file() {
        let dir = temp_dir();
        let p = dir.join("x.json");
        fs::write(&p, "{\"x\"").unwrap();
        let l = load_guarded::<Vec<String>>(&p, 1, "x", &parse, &failing_quarantine);
        assert!(!l.writable);
        let blocked = AtomicBool::new(!l.writable);
        let mut wrote = false;
        let r = save_unless_blocked("x", &p, &blocked, &|| recheck_writable(&p, &parse, &failing_quarantine), || {
            wrote = true;
            fs::write(&p, "[]")
        });
        assert!(r.is_ok());
        assert!(!wrote);
        assert_eq!(fs::read_to_string(&p).unwrap(), "{\"x\"");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_parse_error_with_a_working_quarantine_quarantines_and_allows_saves() {
        let dir = temp_dir();
        let p = dir.join("x.json");
        fs::write(&p, "{\"x\"").unwrap();
        let l = load_guarded::<Vec<String>>(&p, 7, "x", &parse, &crate::fsutil::quarantine);
        assert!(l.writable);
        assert!(l.value.is_empty());
        assert!(!p.exists());
        assert_eq!(fs::read_to_string(dir.join("x.corrupt-7.json")).unwrap(), "{\"x\"");
        let blocked = AtomicBool::new(!l.writable);
        save_unless_blocked("x", &p, &blocked, &|| false, || fs::write(&p, "[]")).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "[]");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_block_lifts_when_the_quarantine_later_succeeds() {
        let dir = temp_dir();
        let p = dir.join("x.json");
        fs::write(&p, "{\"x\"").unwrap();
        let blocked = AtomicBool::new(true);
        save_unless_blocked("x", &p, &blocked, &|| recheck_writable(&p, &parse, &crate::fsutil::quarantine), || {
            fs::write(&p, "[]")
        })
        .unwrap();
        assert!(!blocked.load(Ordering::SeqCst));
        assert_eq!(fs::read_to_string(&p).unwrap(), "[]");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2, "x.json + the quarantined copy");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_that_became_readable_stays_blocked_so_its_data_is_not_overwritten() {
        let dir = temp_dir();
        let p = dir.join("x.json");
        fs::write(&p, "[\"keep\"]").unwrap();
        let blocked = AtomicBool::new(true);
        save_unless_blocked("x", &p, &blocked, &|| recheck_writable(&p, &parse, &crate::fsutil::quarantine), || {
            fs::write(&p, "[]")
        })
        .unwrap();
        assert!(blocked.load(Ordering::SeqCst));
        assert_eq!(fs::read_to_string(&p).unwrap(), "[\"keep\"]");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_logged_reason_never_contains_the_file_text() {
        let e = serde_json::from_str::<Vec<u32>>("[\"comprar leite\"]").unwrap_err();
        assert!(e.to_string().contains("comprar leite"), "premise: serde echoes the text");
        let reason = serde_reason(&e);
        assert!(!reason.contains("comprar leite"), "{reason}");
        assert!(reason.contains("line 1"), "{reason}");
        let io = io_reason(&io::Error::new(io::ErrorKind::PermissionDenied, "comprar leite"));
        assert!(!io.contains("comprar leite"), "{io}");
    }
}
