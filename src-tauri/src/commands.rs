use crate::projects::{Project, ProjectStore, directory_path};
use std::path::Path;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

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
