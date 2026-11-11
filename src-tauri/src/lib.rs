mod commands;
mod git_status;
mod launch;
mod projects;
mod settings;
mod shortcuts;
mod storage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(shortcuts::on_shortcut)
            .build(),
    );
    builder
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            app.manage(projects::ProjectStore::new(directory.clone()));
            app.manage(settings::SettingsStore::new(directory));
            #[cfg(target_os = "macos")]
            {
                app.manage(shortcuts::ShortcutRuntime::default());
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = shortcuts::restore(handle).await {
                        eprintln!("ショートカットを復元できません: {error}");
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::get_settings,
            commands::save_settings,
            commands::apply_theme,
            commands::set_project_notes,
            commands::get_git_status,
            commands::set_project_launch_url,
            commands::resume_project,
            commands::add_project,
            commands::update_project,
            commands::remove_project,
            commands::set_project_shortcut,
            commands::get_shortcut_errors,
            commands::select_project_directory
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Reentry");
}

#[cfg(test)]
mod tests {
    #[test]
    fn main_window_disables_native_drag_drop_handler() {
        let config: tauri::Config =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let main_window = config
            .app
            .windows
            .iter()
            .find(|window| window.label == "main")
            .expect("main window config should exist");

        assert!(!main_window.drag_drop_enabled);
    }
}
