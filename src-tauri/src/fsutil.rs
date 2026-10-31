//! Escrita atômica e quarentena de arquivos de dados.

use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Grava em `<nome>.tmp` e faz `rename` sobre o destino, para que uma queda
/// no meio da escrita nunca deixe o arquivo real truncado. Cria a pasta.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let mut tmp_name: OsString = path.file_name().unwrap_or_default().to_os_string();
    tmp_name.push(".tmp");
    let tmp = path.with_file_name(tmp_name);
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e
    })
}

/// Move um arquivo ilegível para `<stem>.corrupt-<stamp>.json` (acrescenta
/// `-1`, `-2`... se já existir), sem nunca sobrescrever uma quarentena.
pub fn quarantine(path: &Path, stamp_ms: i64) -> io::Result<PathBuf> {
    let stem = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
    let mut n = 0u32;
    loop {
        let name = if n == 0 {
            format!("{stem}.corrupt-{stamp_ms}.json")
        } else {
            format!("{stem}.corrupt-{stamp_ms}-{n}.json")
        };
        let dest = path.with_file_name(name);
        if !dest.exists() {
            fs::rename(path, &dest)?;
            return Ok(dest);
        }
        n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir() -> std::path::PathBuf {
        std::env::temp_dir().join(uuid::Uuid::new_v4().to_string())
    }

    #[test]
    fn write_atomic_replaces_whole_file() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("tasks.json");
        write_atomic(&p, b"a").unwrap();
        write_atomic(&p, b"bb").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "bb");
        assert!(!dir.join("tasks.json.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_atomic_creates_missing_parent() {
        let dir = temp_dir();
        let p = dir.join("a").join("b").join("x.json");
        write_atomic(&p, b"ok").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "ok");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn quarantine_moves_and_never_overwrites() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("tasks.json");
        fs::write(&p, "one").unwrap();
        let q1 = quarantine(&p, 123).unwrap();
        assert!(!p.exists());
        fs::write(&p, "two").unwrap();
        let q2 = quarantine(&p, 123).unwrap();
        assert!(!p.exists());
        assert_ne!(q1, q2);
        assert_eq!(q1.file_name().unwrap(), "tasks.corrupt-123.json");
        assert_eq!(q2.file_name().unwrap(), "tasks.corrupt-123-1.json");
        assert_eq!(fs::read_to_string(&q1).unwrap(), "one");
        assert_eq!(fs::read_to_string(&q2).unwrap(), "two");
        let _ = fs::remove_dir_all(&dir);
    }
}
