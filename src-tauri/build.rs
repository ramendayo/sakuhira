fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "list_projects",
        "get_settings",
        "save_settings",
        "save_settings_with_shortcut",
        "apply_theme",
        "set_project_notes",
        "open_note_link",
        "get_git_status",
        "set_project_launch_url",
        "set_project_app_launch_targets",
        "resume_project",
        "add_project",
        "update_project",
        "remove_project",
        "set_project_shortcut",
        "set_shortcut_capture",
        "get_shortcut_errors",
        "set_quick_resume_shortcut",
        "get_quick_resume_shortcut_error",
        "close_quick_resume",
        "open_main_window",
        "select_project_directory",
        "select_project_launch_item",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to build sakuhira's Tauri configuration");
}
