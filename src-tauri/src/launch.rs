use crate::projects::{Project, directory_path};
use crate::settings::Editor;
use serde::Serialize;
use std::path::Path;
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
    pub editor: LaunchOutcome,
    pub browser: Option<LaunchOutcome>,
    pub history: ResumeHistory,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ResumeHistory {
    Skipped,
    Saved { timestamp: u64 },
    Error { message: String },
}

pub fn record_history(
    store: &crate::projects::ProjectStore,
    project: &Project,
    mut report: ResumeReport,
) -> ResumeReport {
    if report.editor == LaunchOutcome::Success {
        report.history = match store.record_resume(project) {
            Ok(timestamp) => ResumeHistory::Saved { timestamp },
            Err(message) => ResumeHistory::Error { message },
        };
    }
    report
}

pub fn resume(
    app: &tauri::AppHandle,
    project: &Project,
    selected: Editor,
) -> Result<ResumeReport, String> {
    resume_with(
        project,
        selected,
        |path| open_editor(selected, path),
        |url| {
            app.opener()
                .open_url(url, None::<&str>)
                .map_err(|error| format!("既定ブラウザにURLを渡せません: {error}"))
        },
    )
}

fn resume_with(
    project: &Project,
    selected: Editor,
    editor: impl FnOnce(&str) -> Result<(), String>,
    browser: impl FnOnce(&str) -> Result<(), String>,
) -> Result<ResumeReport, String> {
    // 起動前にすべて検証し、不正な設定で一部だけ起動することを避ける。
    let path = directory_path(Path::new(&project.path))?;
    let url = normalize_url(project.launch_url.as_deref())?;
    let editor = editor(&path).into();
    let browser = url.as_deref().map(|url| browser(url).into());
    Ok(ResumeReport {
        editor_name: selected.name().into(),
        editor,
        browser,
        history: ResumeHistory::Skipped,
    })
}

#[cfg(target_os = "macos")]
fn open_editor(editor: Editor, path: &str) -> Result<(), String> {
    use std::process::{Command, Stdio};
    // 起動対象と実行ファイルは固定し、パスは独立した引数で渡す。
    let (selector, target) = editor.macos_target();
    let output = Command::new("/usr/bin/open")
        .args([selector, target, path])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("{}への起動要求に失敗しました: {error}", editor.name()))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "{}を開けません。インストール状況を確認してください: {}",
            editor.name(),
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(not(target_os = "macos"))]
fn open_editor(_editor: Editor, _path: &str) -> Result<(), String> {
    Err("エディタの起動は現在macOSのみ対応しています。".into())
}

#[cfg(test)]
mod tests;
