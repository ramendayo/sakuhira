use tauri::{
    WebviewUrl, WebviewWindowBuilder,
    ipc::{CallbackFn, InvokeBody},
    test::{INVOKE_KEY, get_ipc_response, mock_builder},
    webview::InvokeRequest,
};

#[test]
fn application_command_acl_restricts_calls_by_window() {
    let app = mock_builder()
        // A harmless handler proves which requests get past Tauri's ACL.
        .invoke_handler(|invoke| {
            invoke.resolver.resolve("handler reached");
            true
        })
        .build(tauri::generate_context!())
        .unwrap();
    let main = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
        .build()
        .unwrap();
    let quick_resume = WebviewWindowBuilder::new(&app, "quick-resume", WebviewUrl::default())
        .build()
        .unwrap();

    for (command, main_allowed, quick_resume_allowed) in [
        ("list_projects", true, true),
        ("get_settings", true, true),
        ("apply_theme", true, true),
        ("resume_project", true, true),
        ("close_quick_resume", false, true),
        ("open_main_window", false, true),
        ("open_reentry", false, false),
        ("add_project", true, false),
        ("update_project", true, false),
        ("remove_project", true, false),
        ("select_project_directory", true, false),
        ("set_project_notes", true, false),
        ("open_note_link", true, false),
        ("get_git_status", true, false),
        ("set_project_launch_url", true, false),
        ("set_project_app_launch_targets", true, false),
        ("set_project_shortcut", true, false),
        ("set_shortcut_capture", true, false),
        ("get_shortcut_errors", true, false),
        ("set_quick_resume_shortcut", true, false),
        ("get_quick_resume_shortcut_error", true, false),
        ("save_settings", true, false),
        ("unlisted_command", false, false),
    ] {
        for (window, allowed) in [(&main, main_allowed), (&quick_resume, quick_resume_allowed)] {
            let result = get_ipc_response(
                window,
                InvokeRequest {
                    cmd: command.into(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: if cfg!(any(windows, target_os = "android")) {
                        "http://tauri.localhost"
                    } else {
                        "tauri://localhost"
                    }
                    .parse()
                    .unwrap(),
                    body: InvokeBody::default(),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.into(),
                },
            );
            if allowed {
                assert_eq!(
                    result.unwrap().deserialize::<String>().unwrap(),
                    "handler reached",
                    "{command} in {}",
                    window.label()
                );
            } else {
                let error = result.expect_err("Tauri ACL should deny the command");
                assert!(
                    error
                        .as_str()
                        .is_some_and(|message| message.contains("not allowed")),
                    "{command} in {}: {error}",
                    window.label()
                );
            }
        }
    }
}
