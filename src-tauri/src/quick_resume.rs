use crate::{
    launch::{self, ResumeHistory, ResumeReport},
    projects::Project,
};
use objc2_app_kit::{
    NSApplicationActivationOptions, NSRunningApplication, NSWindow, NSWindowCollectionBehavior,
    NSWorkspace,
};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const WINDOW_LABEL: &str = "quick-resume";

#[derive(Default)]
pub struct QuickResumeWindow {
    presentation: Mutex<Presentation>,
    launching: tauri::async_runtime::Mutex<()>,
}

impl QuickResumeWindow {
    fn presentation(&self) -> MutexGuard<'_, Presentation> {
        self.presentation
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }
}

#[derive(Default)]
struct Presentation {
    focus: PresentationFocus,
    previous_app: Option<i32>,
    resume_failed: bool,
}

impl Presentation {
    fn should_reload(&self) -> bool {
        !self.resume_failed
    }

    fn finish_failed_resume(&mut self, is_focused: bool) {
        if self.focus == PresentationFocus::Hidden {
            return;
        }
        self.resume_failed = true;
        // A queued blur from the launched app must not dismiss the retained result.
        if !is_focused {
            self.focus = PresentationFocus::AwaitingFocus;
        }
    }
}

#[derive(Default, PartialEq, Eq)]
enum PresentationFocus {
    #[default]
    Hidden,
    AwaitingFocus,
    Focused,
}

impl PresentationFocus {
    fn event(&mut self, focused: bool, is_focused: bool, handoff_in_progress: bool) -> bool {
        if *self == Self::Hidden || focused != is_focused {
            return false;
        }
        if focused {
            *self = Self::Focused;
            return false;
        }

        let gained_focus = *self == Self::Focused;
        // A launch can activate another app before its success or failure is known.
        if handoff_in_progress {
            *self = Self::AwaitingFocus;
            return false;
        }
        gained_focus
    }
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
    let existing = app.get_webview_window(WINDOW_LABEL);
    let restore_search_focus = existing.is_some() && !state.presentation().should_reload();
    let window = if let Some(window) = existing {
        if !restore_search_focus {
            window.reload()?;
        }
        window
    } else {
        WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
            .title("sakuhira")
            .inner_size(560.0, 430.0)
            .center()
            .resizable(false)
            .minimizable(false)
            .visible(false)
            .focused(false)
            .build()?
    };
    // Configure the window before show() can make it key and trigger a Space switch.
    move_to_active_space(&window)?;
    let already_focused = window.is_focused()?;
    {
        let mut presentation = state.presentation();
        if previous_app.is_some() || !already_focused {
            presentation.previous_app = previous_app;
        }
        presentation.focus = if already_focused {
            PresentationFocus::Focused
        } else {
            PresentationFocus::AwaitingFocus
        };
    }
    window.show()?;
    window.set_focus()?;
    if restore_search_focus {
        app.emit_to(WINDOW_LABEL, "quick-resume-focus-search", ())?;
    }
    Ok(())
}

fn move_to_active_space(window: &WebviewWindow) -> tauri::Result<()> {
    // SAFETY: open() runs on the AppKit main thread and the handle is the NSWindow
    // owned by this live WebviewWindow.
    let native_window = unsafe { &*window.ns_window()?.cast::<NSWindow>() };
    let current = native_window.collectionBehavior();
    let behavior = (current - NSWindowCollectionBehavior::CanJoinAllSpaces)
        | NSWindowCollectionBehavior::MoveToActiveSpace;
    if behavior != current {
        native_window.setCollectionBehavior(behavior);
    }
    Ok(())
}

pub fn focus_changed(window: &WebviewWindow, focused: bool) -> tauri::Result<()> {
    // An AppKit event may have been queued before the window was reopened.
    let is_focused = window.is_focused()?;
    let state = window.state::<QuickResumeWindow>();
    let handoff = state.launching.try_lock();
    let should_hide = state
        .presentation()
        .focus
        .event(focused, is_focused, handoff.is_err());
    if should_hide {
        hide(window)?;
    }
    Ok(())
}

pub async fn resume(window: &WebviewWindow, project: Project) -> Result<ResumeReport, String> {
    let state = window.state::<QuickResumeWindow>();
    let _launch = state
        .launching
        .try_lock()
        .map_err(|_| "プロジェクトを再開中です。")?;
    let project_id = project.id.clone();
    let app = window.app_handle();
    let result = launch::resume_and_record(app.clone(), project)
        .await
        .and_then(|report| {
            launch::notify_shortcut_resume(app, &project_id, &report.history);
            if resume_completed(&report) {
                // The launched app should keep focus after a successful resume.
                hide(window).map_err(|error| {
                    format!("再開しましたが、クイック再開を閉じられません: {error}")
                })?;
            }
            Ok(report)
        });
    if !result.as_ref().is_ok_and(resume_completed) {
        let is_focused = window.is_focused().unwrap_or(true);
        state.presentation().finish_failed_resume(is_focused);
    }
    result
}

fn resume_completed(report: &ResumeReport) -> bool {
    matches!(report.history, ResumeHistory::Saved { .. }) && !report.has_errors()
}

pub fn open_main_window(window: &WebviewWindow) -> Result<(), String> {
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
    hide(window).map_err(|error| format!("クイック再開を閉じられません: {error}"))?;
    Ok(())
}

fn hide(window: &WebviewWindow) -> tauri::Result<Option<i32>> {
    window.hide()?;
    let state = window.state::<QuickResumeWindow>();
    Ok(std::mem::take(&mut *state.presentation()).previous_app)
}

pub fn dismiss(window: &WebviewWindow) -> tauri::Result<()> {
    let was_frontmost = frontmost_pid() == Some(std::process::id() as i32);
    let previous_app = hide(window)?;
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
    use crate::launch::LaunchOutcome;

    #[test]
    fn only_a_focused_presentation_can_close_on_focus_loss() {
        let mut focus = PresentationFocus::Hidden;
        assert!(!focus.event(true, true, false));

        focus = PresentationFocus::AwaitingFocus;
        assert!(!focus.event(false, false, false));
        assert!(!focus.event(true, true, false));
        assert!(focus.event(false, false, false));
    }

    #[test]
    fn stale_focus_events_do_not_close_a_reopened_window() {
        let mut focus = PresentationFocus::AwaitingFocus;
        assert!(!focus.event(true, false, false));
        assert!(!focus.event(false, false, false));

        assert!(!focus.event(true, true, false));
        assert!(!focus.event(false, true, false));
        assert!(focus.event(false, false, false));
    }

    #[test]
    fn a_handoff_can_finish_or_report_an_error_after_losing_focus() {
        let mut focus = PresentationFocus::Focused;
        assert!(!focus.event(false, false, true));
        assert!(!focus.event(false, false, false));
        assert!(!focus.event(true, true, false));
        assert!(focus.event(false, false, false));
    }

    #[test]
    fn failed_resume_retains_the_view_even_if_the_blur_is_delivered_late() {
        let mut presentation = Presentation {
            focus: PresentationFocus::Focused,
            ..Presentation::default()
        };
        assert!(presentation.should_reload());

        presentation.finish_failed_resume(false);
        assert!(!presentation.focus.event(false, false, false));
        assert!(!presentation.should_reload());

        assert!(!presentation.focus.event(true, true, false));
        assert!(presentation.focus.event(false, false, false));
    }

    #[test]
    fn closing_resets_the_view_even_if_a_resume_is_still_finishing() {
        let mut presentation = Presentation {
            focus: PresentationFocus::Focused,
            ..Presentation::default()
        };
        presentation.finish_failed_resume(true);
        assert!(!presentation.should_reload());

        std::mem::take(&mut presentation);
        presentation.finish_failed_resume(false);
        assert!(presentation.should_reload());
    }

    #[test]
    fn only_full_success_with_saved_history_closes_the_window() {
        let mut report = ResumeReport {
            editor_name: "VS Code".into(),
            editor: Some(LaunchOutcome::Success),
            browser: Some(LaunchOutcome::Error {
                message: "ブラウザの起動に失敗しました。".into(),
            }),
            history: ResumeHistory::Saved { timestamp: 100 },
            apps: Vec::new(),
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
        report.apps.push(crate::launch::AppLaunchOutcome {
            target: crate::projects::AppLaunchTarget {
                app_path: "/Applications/Preview.app".into(),
                file_path: Some("/tmp/missing.pdf".into()),
            },
            outcome: LaunchOutcome::Error {
                message: "ファイルが見つかりません。".into(),
            },
        });
        assert!(!resume_completed(&report));
    }
}
