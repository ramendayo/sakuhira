use serde::{Deserialize, Serialize};
use std::{fs, io::ErrorKind, path::Path};
use tauri::{AppHandle, Emitter, Runtime, plugin::TauriPlugin};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

// Passed only by the login item, so a launch from Finder or the Dock still shows the window.
pub const LAUNCHED_AT_LOGIN_ARG: &str = "--launched-at-login";
pub const CHANGED_EVENT: &str = "launch-at-login-changed";
const STATE_FILE: &str = "launch-at-login.json";

// The login item itself lives in the OS; this file only remembers that the
// default was applied once, so turning it off is not undone on the next launch.
#[derive(Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DefaultState {
    default_applied: bool,
}

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_autostart::Builder::new()
        .macos_launcher(MacosLauncher::LaunchAgent)
        .arg(LAUNCHED_AT_LOGIN_ARG)
        .build()
}

pub fn launched_at_login(mut args: impl Iterator<Item = String>) -> bool {
    args.any(|arg| arg == LAUNCHED_AT_LOGIN_ARG)
}

/// Turns launch at login on for the first launch only.
pub fn apply_default(app: &AppHandle, directory: &Path) -> Result<(), String> {
    // A debug build would register target/debug as the login item. Skipping
    // without recording the default leaves it for the first release launch.
    if cfg!(debug_assertions) {
        return Ok(());
    }
    apply_default_once(directory, || {
        app.autolaunch()
            .enable()
            .map_err(|error| format!("ログイン時の起動を設定できません: {error}"))
    })
}

fn apply_default_once(
    directory: &Path,
    enable: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    if read_state(directory)?.default_applied {
        return Ok(());
    }
    enable()?;
    fs::create_dir_all(directory).map_err(|error| format!("保存先を作成できません: {error}"))?;
    crate::storage::write_json(
        directory,
        STATE_FILE,
        &DefaultState {
            default_applied: true,
        },
    )
}

fn read_state(directory: &Path) -> Result<DefaultState, String> {
    let bytes = match fs::read(directory.join(STATE_FILE)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(DefaultState::default()),
        Err(error) => return Err(format!("ログイン時の起動の状態を読み込めません: {error}")),
    };
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("ログイン時の起動の状態の形式が不正です: {error}"))
}

pub fn is_enabled(app: &AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| format!("ログイン時の起動の状態を確認できません: {error}"))
}

/// Changes the login item and tells every view (settings page, menu bar) the resulting state.
pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    let changed = if enabled {
        manager.enable()
    } else {
        manager.disable()
    }
    .map_err(|error| format!("ログイン時の起動を変更できません: {error}"));
    // Report what the OS now says rather than what was requested, also after a
    // failure, so views that changed optimistically return to the real state.
    let actual = is_enabled(app);
    if let Ok(actual) = actual
        && let Err(error) = app.emit(CHANGED_EVENT, actual)
    {
        eprintln!("ログイン時の起動の変更を通知できません: {error}");
    }
    changed?;
    actual
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn detects_the_login_item_argument() {
        let args = |values: &[&str]| {
            values
                .iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        };
        assert!(launched_at_login(
            args(&["sakuhira", LAUNCHED_AT_LOGIN_ARG]).into_iter()
        ));
        assert!(!launched_at_login(args(&["sakuhira"]).into_iter()));
    }

    #[test]
    fn applies_the_default_only_once() {
        let directory = tempfile::tempdir().unwrap();
        let calls = Cell::new(0);
        let enable = || {
            calls.set(calls.get() + 1);
            Ok(())
        };

        apply_default_once(directory.path(), enable).unwrap();
        apply_default_once(directory.path(), enable).unwrap();

        assert_eq!(calls.get(), 1);
        assert!(read_state(directory.path()).unwrap().default_applied);
    }

    #[test]
    fn retries_the_default_after_a_failed_enable() {
        let directory = tempfile::tempdir().unwrap();

        let error = apply_default_once(directory.path(), || Err("failed".into())).unwrap_err();
        assert_eq!(error, "failed");
        assert!(!read_state(directory.path()).unwrap().default_applied);

        let calls = Cell::new(0);
        apply_default_once(directory.path(), || {
            calls.set(calls.get() + 1);
            Ok(())
        })
        .unwrap();
        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn keeps_the_default_unapplied_when_the_state_file_is_corrupt() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join(STATE_FILE), "{").unwrap();

        let error = apply_default_once(directory.path(), || panic!("must not enable")).unwrap_err();

        assert!(error.contains("形式が不正"));
    }
}
