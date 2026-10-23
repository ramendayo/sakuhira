mod commands;
mod git_status;
mod projects;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(projects::ProjectStore::new(app.path().app_data_dir()?));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::get_git_status,
            commands::add_project,
            commands::update_project,
            commands::remove_project,
            commands::select_project_directory
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Reentry");
}
