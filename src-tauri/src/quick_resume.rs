use crate::{
    launch::{self, LaunchOutcome, ResumeHistory, ResumeReport},
    projects::Project,
};
use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication, NSWorkspace};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const WINDOW_LABEL: &str = "quick-resume";

#[derive(Default)]
pub struct QuickResumeWindow {
    previous_app: Mutex<Option<i32>>,
    launching: tauri::async_runtime::Mutex<()>,
}

pub fn request_open(app: &AppHandle) -> tauri::Result<()> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = open(&handle) {
            eprintln!("クイック再開を開けません: {error}");
        }
    })
}

fn open(app: &AppHandle) -> tauri::Result<()> {
    let state = app.state::<QuickResumeWindow>();
    let Ok(_idle) = state.launching.try_lock() else {
        return Ok(());
    };
    let previous_app = frontmost_pid().filter(|pid| *pid != std::process::id() as i32);
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        if previous_app.is_some() || !window.is_focused()? {
            remember_previous_app(app, previous_app);
        }
        window.reload()?;
        window.show()?;
        return window.set_focus();
    }

    let window = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title("クイック再開")
        .inner_size(560.0, 430.0)
        .center()
        .resizable(false)
        .minimizable(false)
        .build()?;
    remember_previous_app(app, previous_app);
    window.set_focus()
}

pub async fn resume(window: &WebviewWindow, project: Project) -> Result<ResumeReport, String> {
    let state = window.state::<QuickResumeWindow>();
    let _launch = state
        .launching
        .try_lock()
        .map_err(|_| "プロジェクトを再開中です。")?;
    let project_id = project.id.clone();
    let app = window.app_handle();
    let report = launch::resume_and_record(app.clone(), project).await?;
    launch::notify_shortcut_resume(app, &project_id, &report.history);
    if resume_completed(&report) {
        // The launched app should keep focus after a successful resume.
        window
            .hide()
            .map_err(|error| format!("再開しましたが、クイック再開を閉じられません: {error}"))?;
        remember_previous_app(app, None);
    }
    Ok(report)
}

fn resume_completed(report: &ResumeReport) -> bool {
    matches!(report.history, ResumeHistory::Saved { .. })
        && [&report.editor, &report.browser]
            .into_iter()
            .flatten()
            .all(|outcome| *outcome == LaunchOutcome::Success)
}

pub fn open_main(window: &WebviewWindow) -> Result<(), String> {
    let state = window.state::<QuickResumeWindow>();
    let _idle = state
        .launching
        .try_lock()
        .map_err(|_| "プロジェクトを再開中です。")?;
    let app = window.app_handle();
    let main = app
        .get_webview_window("main")
        .ok_or("メインウィンドウが見つかりません。")?;
    let display_error = |error| format!("メインウィンドウを表示できません: {error}");

    if main.is_minimized().map_err(display_error)? {
        main.unminimize().map_err(display_error)?;
    }
    main.show().map_err(display_error)?;
    app.emit_to("main", "show-project-list", ())
        .map_err(|error| format!("プロジェクト一覧を開けません: {error}"))?;
    main.set_focus().map_err(display_error)?;
    // Keep focus in sakuhira instead of returning to the previous app.
    window
        .hide()
        .map_err(|error| format!("クイック再開を閉じられません: {error}"))?;
    remember_previous_app(app, None);
    Ok(())
}

fn remember_previous_app(app: &AppHandle, previous_app: Option<i32>) {
    *app.state::<QuickResumeWindow>()
        .previous_app
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = previous_app;
}

pub fn dismiss(window: &WebviewWindow) -> tauri::Result<()> {
    let was_frontmost = frontmost_pid() == Some(std::process::id() as i32);
    window.hide()?;
    let previous_app = window
        .state::<QuickResumeWindow>()
        .previous_app
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .take();
    if was_frontmost
        && let Some(previous_app) =
            previous_app.and_then(NSRunningApplication::runningApplicationWithProcessIdentifier)
        && !previous_app.activateWithOptions(NSApplicationActivationOptions::empty())
    {
        eprintln!("クイック再開を開く前のアプリに戻れませんでした。");
    }
    Ok(())
}

fn frontmost_pid() -> Option<i32> {
    NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .map(|app| app.processIdentifier())
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_full_success_with_saved_history_closes_the_window() {
        let mut report = ResumeReport {
            editor_name: "VS Code".into(),
            editor: Some(LaunchOutcome::Success),
            browser: Some(LaunchOutcome::Error {
                message: "ブラウザの起動に失敗しました。".into(),
            }),
            history: ResumeHistory::Saved { timestamp: 100 },
        };
        assert!(!resume_completed(&report));
        report.browser = Some(LaunchOutcome::Success);
        assert!(resume_completed(&report));
        report.history = ResumeHistory::Error {
            message: "ディスクに書き込めませんでした。".into(),
        };
        assert!(!resume_completed(&report));
        report.editor = None;
        report.history = ResumeHistory::Saved { timestamp: 101 };
        assert!(resume_completed(&report));
    }
}
