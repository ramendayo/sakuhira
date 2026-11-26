use tauri::{ActivationPolicy, AppHandle, Manager, WebviewWindow};

pub const WINDOW_LABEL: &str = "main";

// Every path that shows or hides the main window goes through here so that
// app-wide presentation (such as the Dock icon) can change in one place.
pub fn show(app: &AppHandle) -> tauri::Result<()> {
    let window = window(app)?;
    // Become a regular app before showing so the window gets the menu bar
    // (and its Edit shortcuts), the Dock icon, and a place in ⌘Tab.
    app.set_activation_policy(ActivationPolicy::Regular)?;
    if window.is_minimized()? {
        window.unminimize()?;
    }
    window.show()?;
    window.set_focus()
}

pub fn hide(app: &AppHandle) -> tauri::Result<()> {
    window(app)?.hide()?;
    // Stay resident for global shortcuts without a Dock icon, like a menu bar app.
    // The quick resume window still opens in this mode.
    app.set_activation_policy(ActivationPolicy::Accessory)
}

fn window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    app.get_webview_window(WINDOW_LABEL)
        .ok_or(tauri::Error::WindowNotFound)
}
