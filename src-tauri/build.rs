fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "list_projects",
        "get_settings",
        "save_settings",
        "apply_theme",
        "set_project_notes",
        "open_note_link",
        "get_git_status",
        "set_project_launch_url",
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
        "select_project_directory",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to build Reentry's Tauri configuration");
}
