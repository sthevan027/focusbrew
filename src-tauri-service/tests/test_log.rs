use focusbrew_tracker::log;

fn temp_log(name: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("focusbrew-{name}-{}.log", std::process::id()));
    let _ = std::fs::remove_file(&path);
    path
}

#[test]
fn write_to_appends_timestamped_lines() {
    let path = temp_log("append");
    log::write_to(&path, "first");
    log::write_to(&path, "second");

    let text = std::fs::read_to_string(&path).unwrap();
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 2);
    assert!(lines[0].ends_with("first") && lines[1].ends_with("second"));
    assert!(lines[0].starts_with("20"), "line starts with a timestamp: {}", lines[0]);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn write_to_starts_over_when_the_file_is_too_large() {
    let path = temp_log("rotate");
    std::fs::write(&path, vec![b'x'; log::MAX_LOG_BYTES as usize + 1]).unwrap();

    log::write_to(&path, "fresh");

    let text = std::fs::read_to_string(&path).unwrap();
    assert_eq!(text.lines().count(), 1, "old content is dropped");
    assert!(text.trim_end().ends_with("fresh"));
    let _ = std::fs::remove_file(&path);
}
