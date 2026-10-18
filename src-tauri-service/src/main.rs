fn main() {
    println!("focusbrew-tracker: detector check");
    match focusbrew_tracker::detector::detect_active_app(10) {
        Ok(app) => println!("Active app: {} (idle: {})", app.app_name, app.is_idle),
        Err(e) => eprintln!("detector error: {e}"),
    }
}
