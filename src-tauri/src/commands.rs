use crate::projects::{
    Project, ProjectIcon, ProjectRegistrationError, ProjectStore, directory_path,
};
use std::path::Path;
use tauri::{Manager, State};
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
pub fn open_note_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = crate::launch::normalize_url(Some(&url))?.ok_or("リンク先のURLがありません。")?;
    crate::launch::open_in_browser(&app, &url)
}

#[tauri::command(async)]
pub fn list_projects(store: State<'_, ProjectStore>) -> Result<Vec<Project>, String> {
    store.list()
}

#[tauri::command]
pub async fn add_project(
    app: tauri::AppHandle,
    name: String,
    path: Option<String>,
    launch_url: Option<String>,
    icon: Option<ProjectIcon>,
    shortcut: Option<String>,
) -> Result<Project, ProjectRegistrationError> {
    tauri::async_runtime::spawn_blocking(move || {
        let save = |store: &ProjectStore, key: Option<&str>| {
            store.add_with_options(
                &name,
                path.as_deref().map(Path::new),
                launch_url.as_deref(),
                icon.unwrap_or_default(),
                key,
            )
        };
        if let Some(key) = shortcut {
            #[cfg(target_os = "macos")]
            return crate::shortcuts::register_new_project(&app, &key, |store, key| {
                save(store, Some(key))
            });
            #[cfg(not(target_os = "macos"))]
            {
                let _ = key;
                return Err(ProjectRegistrationError::shortcut(
                    "グローバルショートカットはmacOSのみ対応しています。".into(),
                ));
            }
        }
        save(&app.state::<ProjectStore>(), None)
    })
    .await
    .map_err(|error| format!("プロジェクトを登録できません: {error}"))?
}

#[derive(serde::Deserialize)]
pub struct ShortcutChange {
    shortcut: Option<String>,
}

#[tauri::command]
pub async fn update_project(
    app: tauri::AppHandle,
    project: Project,
    name: String,
    path: Option<String>,
    icon: Option<ProjectIcon>,
    shortcut_change: Option<ShortcutChange>,
) -> Result<Project, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = path.as_deref().map(Path::new);
        if let Some(change) = shortcut_change {
            #[cfg(target_os = "macos")]
            return crate::shortcuts::set_with_save(
                &app,
                project,
                change.shortcut,
                |store, current, key| {
                    store.update_with_shortcut(current, &name, path, icon, Some(key))
                },
            );
            #[cfg(not(target_os = "macos"))]
            {
                let _ = change.shortcut;
                return Err("グローバルショートカットはmacOSのみ対応しています。".into());
            }
        }
        app.state::<ProjectStore>()
            .update(&project, &name, path, icon)
    })
    .await
    .map_err(|error| format!("プロジェクトを更新できません: {error}"))?
}

#[tauri::command]
pub fn set_shortcut_capture(window: tauri::WebviewWindow, capturing: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if window.label() != "main"
            || (capturing && !window.is_focused().map_err(|error| error.to_string())?)
        {
            return Err("sakuhiraのウィンドウでショートカットを入力してください。".into());
        }
        crate::shortcuts::set_capture(window.app_handle(), capturing)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, capturing);
        Err("グローバルショートカットはmacOSのみ対応しています。".into())
    }
}

#[tauri::command]
pub async fn remove_project(app: tauri::AppHandle, project: Project) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || remove_project_blocking(app, project))
        .await
        .map_err(|error| format!("プロジェクトを削除できません: {error}"))?
}

fn remove_project_blocking(app: tauri::AppHandle, project: Project) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        crate::shortcuts::remove(&app, &project)
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.state::<ProjectStore>().remove(&project)
    }
}

#[tauri::command]
pub async fn set_project_shortcut(
    app: tauri::AppHandle,
    project: Project,
    shortcut: Option<String>,
) -> Result<Project, String> {
    tauri::async_runtime::spawn_blocking(move || {
        set_project_shortcut_blocking(app, project, shortcut)
    })
    .await
    .map_err(|error| format!("ショートカットを更新できません: {error}"))?
}

fn set_project_shortcut_blocking(
    app: tauri::AppHandle,
    project: Project,
    shortcut: Option<String>,
) -> Result<Project, String> {
    #[cfg(target_os = "macos")]
    {
        crate::shortcuts::set(&app, project, shortcut)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, project, shortcut);
        Err("グローバルショートカットはmacOSのみ対応しています。".into())
    }
}

#[tauri::command]
pub async fn get_shortcut_errors(
    app: tauri::AppHandle,
) -> Result<Vec<crate::shortcuts::ShortcutError>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(crate::shortcuts::errors(&app))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(Vec::new())
    }
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
    let path = project
        .path
        .ok_or("URLのみのプロジェクトにはGit情報がありません。")?;
    tauri::async_runtime::spawn_blocking(move || crate::git_status::read(Path::new(&path)))
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
    window: tauri::WebviewWindow,
    store: State<'_, ProjectStore>,
    project: Project,
) -> Result<crate::launch::ResumeReport, String> {
    let project = store.get_matching(&project)?;
    #[cfg(target_os = "macos")]
    if window.label() == crate::quick_resume::WINDOW_LABEL {
        return crate::quick_resume::resume(&window, project).await;
    }
    let _ = window;
    crate::launch::resume_and_record(app, project).await
}

#[tauri::command(async)]
pub fn get_settings(
    store: State<'_, crate::settings::SettingsStore>,
) -> Result<crate::settings::Settings, String> {
    store.load()
}

#[tauri::command(async)]
pub fn apply_theme(
    store: State<'_, crate::settings::SettingsStore>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let theme = store.load()?.theme;
    window
        .set_theme(theme.native_theme())
        .map_err(|error| format!("ウィンドウの表示テーマを反映できません: {error}"))
}

#[tauri::command(async)]
pub fn save_settings(
    store: State<'_, crate::settings::SettingsStore>,
    expected: crate::settings::Settings,
    settings: crate::settings::Settings,
) -> Result<crate::settings::Settings, String> {
    store.save(&expected, settings)
}

#[tauri::command]
pub async fn set_quick_resume_shortcut(
    app: tauri::AppHandle,
    expected: crate::settings::Settings,
    shortcut: Option<String>,
) -> Result<crate::settings::Settings, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            crate::shortcuts::set_quick_resume(&app, &expected, shortcut.as_deref())
        })
        .await
        .map_err(|error| format!("クイック再開のショートカットを更新できません: {error}"))?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, expected, shortcut);
        Err("グローバルショートカットはmacOSのみ対応しています。".into())
    }
}

#[tauri::command]
pub fn get_quick_resume_shortcut_error(app: tauri::AppHandle) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        crate::shortcuts::quick_resume_error(&app)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        None
    }
}

#[tauri::command]
pub fn close_quick_resume(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    if window.label() == crate::quick_resume::WINDOW_LABEL {
        return crate::quick_resume::dismiss(&window)
            .map_err(|error| format!("クイック再開を閉じられません: {error}"));
    }
    let _ = window;
    Err("クイック再開ウィンドウから実行してください。".into())
}

#[tauri::command]
pub fn open_reentry(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    if window.label() == crate::quick_resume::WINDOW_LABEL {
        return crate::quick_resume::open_main(&window);
    }
    let _ = window;
    Err("クイック再開ウィンドウから実行してください。".into())
}
