// Nothing is generated at build time. The service is registered with Windows by
// install-service.ps1, which runs against the built binary.
fn main() {
    println!("cargo:rerun-if-changed=build.rs");
}
