mod commands;
mod git_status;
mod launch;
mod projects;
mod settings;
mod storage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            app.manage(projects::ProjectStore::new(directory.clone()));
            app.manage(settings::SettingsStore::new(directory));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::get_settings,
            commands::save_settings,
            commands::set_project_notes,
            commands::get_git_status,
            commands::set_project_launch_url,
            commands::resume_project,
            commands::add_project,
            commands::update_project,
            commands::remove_project,
            commands::select_project_directory
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Reentry");
}
