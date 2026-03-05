//! r3ditor Desktop Application — Tauri 2 entry point
//!
//! Exposes Tauri commands for the React frontend to interact
//! with the CAD kernel, renderer, DFM analyzer, and CAM engine.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use editor_shell::EditorApp;
use std::sync::Mutex;

mod commands;

/// Application state managed by Tauri
pub struct AppState {
    pub editor: Mutex<EditorApp>,
}

fn main() {
    // Initialize tracing — use stderr so it does not interfere with stdout
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_max_level(tracing::Level::INFO)
        .init();

    tracing::info!("Starting r3ditor desktop application...");

    let state = AppState {
        editor: Mutex::new(EditorApp::new()),
    };

    tracing::info!("Building Tauri application...");

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::create_box,
            commands::create_cylinder,
            commands::delete_entity,
            commands::get_entities,
            commands::undo,
            commands::redo,
            commands::import_file,
            commands::export_file,
            commands::analyze_dfm,
            commands::get_materials,
            commands::estimate_cost,
        ]);

    tracing::info!("Running Tauri event loop...");

    match builder.run(tauri::generate_context!()) {
        Ok(()) => tracing::info!("r3ditor shut down cleanly"),
        Err(e) => {
            tracing::error!("r3ditor failed to start: {:#}", e);
            eprintln!("ERROR: r3ditor failed to start: {:#}", e);
            std::process::exit(1);
        }
    }
}
