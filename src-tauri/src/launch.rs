use crate::projects::{Project, directory_path};
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
    pub editor: LaunchOutcome,
    pub browser: Option<LaunchOutcome>,
}

pub fn resume(app: &tauri::AppHandle, project: &Project) -> Result<ResumeReport, String> {
    resume_with(project, open_vscode, |url| {
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|error| format!("既定ブラウザにURLを渡せません: {error}"))
    })
}

fn resume_with(
    project: &Project,
    editor: impl FnOnce(&str) -> Result<(), String>,
    browser: impl FnOnce(&str) -> Result<(), String>,
) -> Result<ResumeReport, String> {
    // 起動前にすべて検証し、不正な設定で一部だけ起動することを避ける。
    let path = directory_path(Path::new(&project.path))?;
    let url = normalize_url(project.launch_url.as_deref())?;
    let editor = editor(&path).into();
    let browser = url.as_deref().map(|url| browser(url).into());
    Ok(ResumeReport { editor, browser })
}

#[cfg(target_os = "macos")]
fn open_vscode(path: &str) -> Result<(), String> {
    use std::process::{Command, Stdio};
    // アプリ識別子と実行ファイルは固定し、パスは独立した引数で渡す。
    let output = Command::new("/usr/bin/open")
        .args(["-b", "com.microsoft.VSCode", path])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("VS Codeへの起動要求に失敗しました: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "VS Codeを開けません。インストール状況を確認してください: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(not(target_os = "macos"))]
fn open_vscode(_path: &str) -> Result<(), String> {
    Err("VS Codeの起動は現在macOSのみ対応しています。".into())
}

#[cfg(test)]
mod tests;
