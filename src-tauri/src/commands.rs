use crate::projects::{Project, ProjectStore, directory_path};
use std::path::Path;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

#[tauri::command(async)]
pub fn set_project_notes(
    store: State<'_, ProjectStore>,
    project: Project,
    last_work: String,
    next_task: String,
) -> Result<Project, String> {
    store.set_notes(&project, last_work, next_task)
}

#[tauri::command(async)]
pub fn list_projects(store: State<'_, ProjectStore>) -> Result<Vec<Project>, String> {
    store.list()
}

#[tauri::command(async)]
pub fn add_project(
    store: State<'_, ProjectStore>,
    name: String,
    path: String,
) -> Result<Project, String> {
    store.add(&name, Path::new(&path))
}

#[tauri::command(async)]
pub fn update_project(
    store: State<'_, ProjectStore>,
    project: Project,
    name: String,
    path: String,
) -> Result<Project, String> {
    store.update(&project, &name, Path::new(&path))
}

#[tauri::command(async)]
pub fn remove_project(store: State<'_, ProjectStore>, project: Project) -> Result<(), String> {
    store.remove(&project)
}

#[tauri::command]
pub async fn get_git_status(
    store: State<'_, ProjectStore>,
    project_id: String,
) -> Result<crate::git_status::GitStatus, String> {
    let project = store
        .list()?
        .into_iter()
        .find(|project| project.id == project_id)
        .ok_or("このプロジェクトは登録されていません。一覧を再読み込みしてください。")?;
    tauri::async_runtime::spawn_blocking(move || crate::git_status::read(Path::new(&project.path)))
        .await
        .map_err(|error| format!("Gitの状態取得を完了できません: {error}"))?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedDirectory {
    path: String,
    suggested_name: String,
}

#[tauri::command]
pub async fn select_project_directory(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<SelectedDirectory>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("プロジェクトフォルダを選択")
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let path = selected
            .into_path()
            .map_err(|error| format!("選択したパスを取得できません: {error}"))?;
        let suggested_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("プロジェクト")
            .to_owned();
        Ok(Some(SelectedDirectory {
            path: directory_path(&path)?,
            suggested_name,
        }))
    })
    .await
    .map_err(|error| format!("フォルダ選択を完了できません: {error}"))?
}

#[tauri::command(async)]
pub fn set_project_launch_url(
    store: State<'_, ProjectStore>,
    project: Project,
    url: Option<String>,
) -> Result<Project, String> {
    store.set_launch_url(&project, url.as_deref())
}

#[tauri::command]
pub async fn resume_project(
    app: tauri::AppHandle,
    store: State<'_, ProjectStore>,
    settings: State<'_, crate::settings::SettingsStore>,
    project: Project,
) -> Result<crate::launch::ResumeReport, String> {
    let project = store.get_matching(&project)?;
    let editor = settings.load()?.default_editor;
    tauri::async_runtime::spawn_blocking(move || crate::launch::resume(&app, &project, editor))
        .await
        .map_err(|error| format!("起動処理を完了できません: {error}"))?
}

#[tauri::command(async)]
pub fn get_settings(
    store: State<'_, crate::settings::SettingsStore>,
) -> Result<crate::settings::Settings, String> {
    store.load()
}

#[tauri::command(async)]
pub fn save_settings(
    store: State<'_, crate::settings::SettingsStore>,
    expected: crate::settings::Settings,
    settings: crate::settings::Settings,
) -> Result<crate::settings::Settings, String> {
    store.save(&expected, settings)
}
