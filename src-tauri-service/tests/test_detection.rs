use focusbrew_tracker::detector::detect_active_app;

#[test]
fn test_detect_active_app_returns_app_name_and_timestamp() {
    let app = detect_active_app(10).expect("a foreground window should exist on the desktop");
    assert!(!app.app_name.is_empty());
    assert!(app.timestamp > 0);
}

#[test]
fn test_app_name_is_exe_basename_without_path() {
    let app = detect_active_app(10).expect("a foreground window should exist on the desktop");
    assert!(!app.app_name.contains('\\'), "got {}", app.app_name);
    assert!(!app.app_name.contains('/'), "got {}", app.app_name);
}

#[test]
fn test_huge_idle_threshold_never_reports_idle() {
    // One year in minutes: no realistic input gap crosses it.
    let app = detect_active_app(60 * 24 * 365).expect("a foreground window should exist");
    assert!(!app.is_idle);
}
