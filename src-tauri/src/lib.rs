mod commands;
mod git_status;
mod launch;
mod projects;
#[cfg(target_os = "macos")]
mod quick_resume;
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
    let app = builder
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            app.manage(projects::ProjectStore::new(directory.clone()));
            app.manage(settings::SettingsStore::new(directory));
            #[cfg(target_os = "macos")]
            {
                app.manage(shortcuts::ShortcutRuntime::default());
                app.manage(quick_resume::QuickResumeWindow::default());
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = shortcuts::restore(handle.clone()).await {
                        eprintln!("ショートカットを復元できません: {error}");
                    }
                    if let Err(error) =
                        tauri::Emitter::emit(&handle, "project-shortcuts-restored", ())
                    {
                        eprintln!("ショートカットの復元結果を通知できません: {error}");
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
            commands::open_note_link,
            commands::get_git_status,
            commands::set_project_launch_url,
            commands::resume_project,
            commands::add_project,
            commands::update_project,
            commands::remove_project,
            commands::set_project_shortcut,
            commands::set_shortcut_capture,
            commands::get_shortcut_errors,
            commands::set_quick_resume_shortcut,
            commands::get_quick_resume_shortcut_error,
            commands::close_quick_resume,
            commands::open_reentry,
            commands::select_project_directory
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Reentry");

    #[cfg(target_os = "macos")]
    app.run(handle_macos_event);
    #[cfg(not(target_os = "macos"))]
    app.run(|_, _| {});
}

#[cfg(target_os = "macos")]
fn handle_macos_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    use tauri::{RunEvent, WindowEvent};

    match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } if label == quick_resume::WINDOW_LABEL => {
            api.prevent_close();
            if let Some(window) = app.get_webview_window(&label)
                && let Err(error) = quick_resume::dismiss(&window)
            {
                eprintln!("クイック再開を閉じられません: {error}");
            }
        }
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } if label == "main" => {
            if let Some(window) = app.get_webview_window(&label) {
                // Keep the webview and the shortcut listener alive after closing the window.
                api.prevent_close();
                if let Err(error) = window.hide() {
                    eprintln!("ウィンドウを非表示にできません: {error}");
                }
            }
        }
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::Focused(false),
            ..
        } if label == "main" => {
            if let Err(error) = shortcuts::set_capture(app, false) {
                eprintln!("{error}");
            }
        }
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => {
            if let Some(window) = app.get_webview_window("main")
                && let Err(error) = window.show().and_then(|()| window.set_focus())
            {
                eprintln!("ウィンドウを再表示できません: {error}");
            }
        }
        RunEvent::Exit => shortcuts::unregister_all(app),
        _ => {}
    }
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
