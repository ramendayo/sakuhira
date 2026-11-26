use crate::{launch_at_login, main_window, quick_resume};
use tauri::{
    AppHandle, Listener,
    menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};

const TRAY_ID: &str = "main";
const OPEN_MAIN_WINDOW_ID: &str = "open-main-window";
const OPEN_QUICK_RESUME_ID: &str = "open-quick-resume";
const LAUNCH_AT_LOGIN_ID: &str = "launch-at-login";
const QUIT_ID: &str = "quit";

#[derive(Debug, PartialEq, Eq)]
enum TrayAction {
    OpenMainWindow,
    OpenQuickResume,
    ToggleLaunchAtLogin,
    Quit,
}

impl TrayAction {
    fn from_menu_id(id: &str) -> Option<Self> {
        match id {
            OPEN_MAIN_WINDOW_ID => Some(Self::OpenMainWindow),
            OPEN_QUICK_RESUME_ID => Some(Self::OpenQuickResume),
            LAUNCH_AT_LOGIN_ID => Some(Self::ToggleLaunchAtLogin),
            QUIT_ID => Some(Self::Quit),
            _ => None,
        }
    }
}

// While the Dock icon is hidden, this menu is the only way to reach the main
// window or quit without first opening quick resume.
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let launch_at_login_item = CheckMenuItem::with_id(
        app,
        LAUNCH_AT_LOGIN_ID,
        "ログイン時に起動",
        true,
        launch_at_login::is_enabled(app).unwrap_or_else(|error| {
            eprintln!("{error}");
            false
        }),
        None::<&str>,
    )?;
    // Follow changes made from the settings page as well as from this menu.
    let synced_item = launch_at_login_item.clone();
    app.listen(
        launch_at_login::CHANGED_EVENT,
        move |event| match serde_json::from_str::<bool>(event.payload()) {
            Ok(enabled) => {
                if let Err(error) = synced_item.set_checked(enabled) {
                    eprintln!("メニューバーの表示を更新できません: {error}");
                }
            }
            Err(error) => eprintln!("ログイン時の起動の変更を読み取れません: {error}"),
        },
    );
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(
                app,
                OPEN_MAIN_WINDOW_ID,
                "sakuhiraを開く",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                OPEN_QUICK_RESUME_ID,
                "クイック再開",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &launch_at_login_item,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, QUIT_ID, "sakuhiraを終了", true, None::<&str>)?,
        ],
    )?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tauri::include_image!("icons/tray-template.png"))
        // A template image lets macOS tint the icon for light, dark, and highlighted menu bars.
        .icon_as_template(true)
        .tooltip("sakuhira")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(handle_menu_event)
        .build(app)?;
    Ok(())
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let Some(action) = TrayAction::from_menu_id(event.id().as_ref()) else {
        return;
    };
    let result = match action {
        TrayAction::OpenMainWindow => main_window::show(app),
        TrayAction::OpenQuickResume => quick_resume::request_open(app),
        TrayAction::ToggleLaunchAtLogin => {
            // The click has already flipped the check mark; set_enabled reports the
            // state the OS ends up with, which resets the mark even after a failure.
            if let Err(error) = launch_at_login::is_enabled(app)
                .and_then(|enabled| launch_at_login::set_enabled(app, !enabled))
            {
                eprintln!("{error}");
            }
            Ok(())
        }
        TrayAction::Quit => {
            // Exit runs the same cleanup as ⌘Q, including unregistering shortcuts.
            app.exit(0);
            Ok(())
        }
    };
    if let Err(error) = result {
        eprintln!("メニューバーの操作を実行できません: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_ids_map_to_actions() {
        assert_eq!(
            TrayAction::from_menu_id(OPEN_MAIN_WINDOW_ID),
            Some(TrayAction::OpenMainWindow)
        );
        assert_eq!(
            TrayAction::from_menu_id(OPEN_QUICK_RESUME_ID),
            Some(TrayAction::OpenQuickResume)
        );
        assert_eq!(
            TrayAction::from_menu_id(LAUNCH_AT_LOGIN_ID),
            Some(TrayAction::ToggleLaunchAtLogin)
        );
        assert_eq!(TrayAction::from_menu_id(QUIT_ID), Some(TrayAction::Quit));
        assert_eq!(TrayAction::from_menu_id("unknown"), None);
    }
}
