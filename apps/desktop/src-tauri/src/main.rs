#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    automate_plus_native::run().expect("failed to start AutomatePlus native host");
}
