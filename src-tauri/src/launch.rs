use crate::projects::{
    AppLaunchTarget, Project, ProjectStore, directory_path, validate_launch_targets,
};
use crate::settings::{Editor, SettingsStore};
use serde::Serialize;
use std::path::Path;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use url::Url;

pub fn normalize_url(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let lower = value.to_ascii_lowercase();
    if value.len() > 4096
        || value
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
        || !(lower.starts_with("http://") || lower.starts_with("https://"))
    {
        return Err(
            "起動URLには空白を含まないHTTP/HTTPSの絶対URLを入力してください（4096バイト以内）。"
                .into(),
        );
    }
    let url = Url::parse(value).map_err(|error| format!("起動URLを確認できません: {error}"))?;
    if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
        return Err(
            "起動URLにはホスト名が必要です。ユーザー名・パスワードは含められません。".into(),
        );
    }
    if url.as_str().len() > 4096 {
        return Err("起動URLはURLエンコード後も4096バイト以内にしてください。".into());
    }
    Ok(Some(url.to_string()))
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LaunchOutcome {
    Success,
    Error { message: String },
}

impl From<Result<(), String>> for LaunchOutcome {
    fn from(result: Result<(), String>) -> Self {
        match result {
            Ok(()) => Self::Success,
            Err(message) => Self::Error { message },
        }
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ResumeReport {
    #[serde(rename = "editorName")]
    pub editor_name: String,
    pub editor: Option<LaunchOutcome>,
    pub browser: Option<LaunchOutcome>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub apps: Vec<AppLaunchOutcome>,
    pub history: ResumeHistory,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct AppLaunchOutcome {
    pub target: AppLaunchTarget,
    pub outcome: LaunchOutcome,
}

impl ResumeReport {
    #[cfg(any(target_os = "macos", test))]
    pub fn has_errors(&self) -> bool {
        [&self.editor, &self.browser]
            .into_iter()
            .flatten()
            .chain(self.apps.iter().map(|app| &app.outcome))
            .any(|outcome| matches!(outcome, LaunchOutcome::Error { .. }))
            || matches!(self.history, ResumeHistory::Error { .. })
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ResumeHistory {
    Skipped,
    Saved { timestamp: u64 },
    Error { message: String },
}

#[cfg(target_os = "macos")]
pub fn notify_shortcut_resume(app: &tauri::AppHandle, project_id: &str, history: &ResumeHistory) {
    use tauri::Emitter;
    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ShortcutResumed<'a> {
        project_id: &'a str,
        timestamp: u64,
    }

    if let ResumeHistory::Saved { timestamp } = history
        && let Err(error) = app.emit(
            "project-shortcut-resumed",
            ShortcutResumed {
                project_id,
                timestamp: *timestamp,
            },
        )
    {
        eprintln!("最終再開日時を画面に通知できません: {error}");
    }
}

#[cfg(target_os = "macos")]
pub fn notify_project_shortcut_result(
    app: &tauri::AppHandle,
    project: &Project,
    result: &Result<ResumeReport, String>,
) {
    use tauri::Emitter;
    if let Ok(report) = result {
        notify_shortcut_resume(app, &project.id, &report.history);
        if !report.has_errors() {
            return;
        }
    }
    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ShortcutFailure<'a> {
        project_name: &'a str,
        result: &'a Result<ResumeReport, String>,
    }
    if let Err(error) = app.emit_to(
        "main",
        "project-shortcut-launch-failed",
        ShortcutFailure {
            project_name: &project.name,
            result,
        },
    ) {
        eprintln!("個別ショートカットの起動結果を画面に通知できません: {error}");
    }
}

fn record_history(
    store: &ProjectStore,
    project: &Project,
    mut report: ResumeReport,
) -> ResumeReport {
    let resumed = if project.path.is_some() {
        report.editor == Some(LaunchOutcome::Success)
    } else if report.browser.is_some() {
        report.browser == Some(LaunchOutcome::Success)
    } else {
        report
            .apps
            .iter()
            .any(|app| app.outcome == LaunchOutcome::Success)
    };
    if resumed {
        report.history = match store.record_resume(project) {
            Ok(timestamp) => ResumeHistory::Saved { timestamp },
            Err(message) => ResumeHistory::Error { message },
        };
    }
    report
}

pub async fn resume_and_record(
    app: tauri::AppHandle,
    project: Project,
) -> Result<ResumeReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let editor = if project.path.is_some() {
            app.state::<SettingsStore>().load()?.default_editor
        } else {
            Editor::default()
        };
        let report = resume(&app, &project, editor)?;
        let store = app.state::<ProjectStore>();
        Ok(record_history(&store, &project, report))
    })
    .await
    .map_err(|error| format!("起動処理を完了できません: {error}"))?
}

fn resume(
    app: &tauri::AppHandle,
    project: &Project,
    selected: Editor,
) -> Result<ResumeReport, String> {
    resume_with_apps(
        project,
        selected,
        |path| open_editor(selected, path),
        |url| open_in_browser(app, url),
        open_app,
    )
}

pub fn open_in_browser(app: &tauri::AppHandle, url: &str) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| format!("既定ブラウザにURLを渡せません: {error}"))
}

fn resume_with_apps(
    project: &Project,
    selected: Editor,
    editor: impl FnOnce(&str) -> Result<(), String>,
    browser: impl FnOnce(&str) -> Result<(), String>,
    mut open_app: impl FnMut(&AppLaunchTarget) -> Result<(), String>,
) -> Result<ResumeReport, String> {
    // 起動前にすべて検証し、不正な設定で一部だけ起動することを避ける。
    let path = project
        .path
        .as_deref()
        .map(|path| directory_path(Path::new(path)))
        .transpose()?;
    let url = normalize_url(project.launch_url.as_deref())?;
    validate_launch_targets(path.as_deref(), url.as_deref(), &project.app_launch_targets)?;
    let editor = path.as_deref().map(|path| editor(path).into());
    let browser = url.as_deref().map(|url| browser(url).into());
    let apps = project
        .app_launch_targets
        .iter()
        .map(|target| {
            let outcome = target
                .clone()
                .validated()
                .and_then(|validated| open_app(&validated));
            AppLaunchOutcome {
                target: target.clone(),
                outcome: outcome.into(),
            }
        })
        .collect();
    Ok(ResumeReport {
        editor_name: selected.name().into(),
        editor,
        browser,
        apps,
        history: ResumeHistory::Skipped,
    })
}

#[cfg(target_os = "macos")]
fn open_editor(editor: Editor, path: &str) -> Result<(), String> {
    let (selector, target) = editor.macos_target();
    request_macos_open(&[selector, target, path])
}

#[cfg(target_os = "macos")]
fn open_app(target: &AppLaunchTarget) -> Result<(), String> {
    let app = target.app_path.as_str();
    match target.file_path.as_deref() {
        Some(file) => request_macos_open(&["-a", app, file]),
        None => request_macos_open(&[app]),
    }
}

#[cfg(not(target_os = "macos"))]
fn open_app(_target: &AppLaunchTarget) -> Result<(), String> {
    Err("登録アプリの起動は現在macOSのみ対応しています。".into())
}

#[cfg(target_os = "macos")]
fn request_macos_open(args: &[&str]) -> Result<(), String> {
    use std::process::{Command, Stdio};
    // バンドルとローカルファイルの絶対パスを独立した引数として渡す。
    let output = Command::new("/usr/bin/open")
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("起動要求に失敗しました: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let reason = String::from_utf8_lossy(&output.stderr);
    let reason = reason.trim();
    if reason.is_empty() {
        return Err(format!(
            "macOSが起動要求を受け付けませんでした: {}",
            output.status
        ));
    }
    Err(reason.into())
}

#[cfg(not(target_os = "macos"))]
fn open_editor(_editor: Editor, _path: &str) -> Result<(), String> {
    Err("エディタの起動は現在macOSのみ対応しています。".into())
}

#[cfg(test)]
mod tests;
