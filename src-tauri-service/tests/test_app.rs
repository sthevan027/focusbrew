use focusbrew_tracker::app::{db_path_in, port_from, DEFAULT_PORT};
use std::ffi::OsString;
use std::path::Path;

#[test]
fn db_lives_under_local_app_data_focusbrew() {
    let path = db_path_in(Some(OsString::from(r"C:\Users\x\AppData\Local")));
    assert_eq!(
        path,
        Path::new(r"C:\Users\x\AppData\Local").join("focusbrew").join("activity.db")
    );
}

#[test]
fn db_falls_back_to_the_current_directory_without_local_app_data() {
    assert_eq!(db_path_in(None), Path::new(".").join("focusbrew").join("activity.db"));
}

#[test]
fn port_override_is_used_when_valid() {
    assert_eq!(port_from(Some("9100")), 9100);
}

#[test]
fn missing_or_invalid_port_override_falls_back_to_default() {
    assert_eq!(port_from(None), DEFAULT_PORT);
    assert_eq!(port_from(Some("nope")), DEFAULT_PORT);
    assert_eq!(port_from(Some("0")), DEFAULT_PORT);
}
