use tauri::{AppHandle, Manager, WebviewWindow};

pub const WINDOW_LABEL: &str = "main";

// Every path that shows or hides the main window goes through here so that
// app-wide presentation (such as the Dock icon) can change in one place.
pub fn show(app: &AppHandle) -> tauri::Result<()> {
    let window = window(app)?;
    if window.is_minimized()? {
        window.unminimize()?;
    }
    window.show()?;
    window.set_focus()
}

pub fn hide(app: &AppHandle) -> tauri::Result<()> {
    window(app)?.hide()
}

fn window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    app.get_webview_window(WINDOW_LABEL)
        .ok_or(tauri::Error::WindowNotFound)
}
