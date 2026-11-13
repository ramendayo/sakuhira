use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication, NSWorkspace};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const WINDOW_LABEL: &str = "quick-resume";

#[derive(Default)]
pub struct QuickResumeWindow {
    previous_app: Mutex<Option<i32>>,
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
