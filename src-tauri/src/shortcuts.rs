pub(crate) fn normalize_shortcut(shortcut: &str) -> Result<String, String> {
    let parts: Vec<_> = shortcut.split('+').map(str::trim).collect();
    if parts.len() < 2 || parts.iter().any(|part| part.is_empty()) {
        return Err("ショートカットの形式が不正です。".into());
    }

    let mut command = false;
    let mut control = false;
    let mut alt = false;
    let mut shift = false;
    for modifier in &parts[..parts.len() - 1] {
        let slot = match modifier.to_ascii_lowercase().as_str() {
            "command" | "cmd" | "super" | "meta" => &mut command,
            "control" | "ctrl" => &mut control,
            "alt" | "option" => &mut alt,
            "shift" => &mut shift,
            _ => return Err("修飾キーが不正です。".into()),
        };
        if *slot {
            return Err("修飾キーを重複して指定できません。".into());
        }
        *slot = true;
    }
    if !command && !control && !alt {
        return Err("Command、Control、Altのいずれかが必要です。".into());
    }

    let key = parts[parts.len() - 1].to_ascii_uppercase();
    let normalized_key = if let Some(letter) = key
        .strip_prefix("KEY")
        .filter(|letter| letter.len() == 1 && letter.as_bytes()[0].is_ascii_alphabetic())
    {
        format!("Key{}", letter.to_ascii_uppercase())
    } else if let Some(digit) = key
        .strip_prefix("DIGIT")
        .filter(|digit| digit.len() == 1 && digit.as_bytes()[0].is_ascii_digit())
    {
        format!("Digit{digit}")
    } else if key.len() == 1 && key.as_bytes()[0].is_ascii_alphabetic() {
        format!("Key{}", key.to_ascii_uppercase())
    } else if key.len() == 1 && key.as_bytes()[0].is_ascii_digit() {
        format!("Digit{key}")
    } else if let Some(number) = key.strip_prefix('F').or_else(|| key.strip_prefix('f')) {
        match number.parse::<u8>() {
            Ok(parsed @ 1..=12) if parsed.to_string() == number => format!("F{parsed}"),
            _ => return Err("主キーが不正です。".into()),
        }
    } else {
        return Err("主キーが不正です。".into());
    };

    if command && !control && !alt && !shift && matches!(normalized_key.as_str(), "KeyQ" | "KeyW") {
        return Err("Command+QとCommand+Wは予約されています。".into());
    }

    let mut normalized = Vec::new();
    if command {
        normalized.push("Command");
    }
    if control {
        normalized.push("Control");
    }
    if alt {
        normalized.push("Alt");
    }
    if shift {
        normalized.push("Shift");
    }
    normalized.push(&normalized_key);
    Ok(normalized.join("+"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutError {
    pub project_id: String,
    pub reason: String,
}

#[cfg(any(target_os = "macos", test))]
fn transition_pressed(
    pressed: &mut std::collections::HashSet<String>,
    key: &str,
    is_pressed: bool,
) -> bool {
    if is_pressed {
        pressed.insert(key.to_owned())
    } else {
        pressed.remove(key);
        false
    }
}

#[cfg(any(target_os = "macos", test))]
fn register_then_save<T, E>(
    register: impl FnOnce() -> Result<(), E>,
    save: impl FnOnce() -> Result<T, E>,
    rollback: impl FnOnce(E) -> E,
) -> Result<T, E> {
    register()?;
    save().map_err(rollback)
}

#[cfg(target_os = "macos")]
mod runtime {
    use super::{normalize_shortcut, register_then_save, transition_pressed};
    use crate::{
        launch,
        projects::{Project, ProjectRegistrationError, ProjectStore, checked_shortcut},
    };
    use std::{
        collections::{HashMap, HashSet},
        sync::Mutex,
    };
    use tauri::{AppHandle, Emitter, Manager};
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

    #[derive(Default)]
    struct State {
        routes: HashMap<String, String>,
        errors: HashMap<String, String>,
        pressed: HashSet<String>,
        capturing: bool,
    }

    #[derive(Default)]
    pub struct ShortcutRuntime {
        operation: Mutex<()>,
        state: Mutex<State>,
    }

    #[derive(Clone, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ShortcutResumed {
        project_id: String,
        timestamp: u64,
    }

    pub fn on_shortcut(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
        let Some(key) = normalize_shortcut(&shortcut.into_string()).ok() else {
            return;
        };
        let runtime = app.state::<ShortcutRuntime>();
        let (capturing, project_id) = {
            let Ok(mut state) = runtime.state.lock() else {
                return;
            };
            match event.state {
                ShortcutState::Pressed if transition_pressed(&mut state.pressed, &key, true) => {
                    (state.capturing, state.routes.get(&key).cloned())
                }
                ShortcutState::Released => {
                    transition_pressed(&mut state.pressed, &key, false);
                    return;
                }
                _ => return,
            }
        };
        // A registered combination can be consumed by macOS before the webview sees it.
        if capturing {
            if let Err(error) = app.emit_to("main", "project-shortcut-captured", &key) {
                eprintln!("入力中のショートカットを表示できません: {error}");
            }
            return;
        }
        if let Some(project_id) = project_id {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let lookup_app = app.clone();
                let lookup_id = project_id.clone();
                let lookup_key = key.clone();
                let project = tauri::async_runtime::spawn_blocking(move || {
                    lookup_app
                        .state::<ProjectStore>()
                        .list()
                        .ok()?
                        .into_iter()
                        .find(|p| {
                            p.id == lookup_id && p.shortcut.as_deref() == Some(lookup_key.as_str())
                        })
                })
                .await;
                let Ok(Some(project)) = project else { return };
                let Ok(report) = launch::resume_and_record(app.clone(), project).await else {
                    return;
                };
                if let launch::ResumeHistory::Saved { timestamp } = report.history {
                    let _ = app.emit(
                        "project-shortcut-resumed",
                        ShortcutResumed {
                            project_id,
                            timestamp,
                        },
                    );
                }
            });
        }
    }

    pub fn set_capture(app: &AppHandle, capturing: bool) -> Result<(), String> {
        let runtime = app.state::<ShortcutRuntime>();
        let mut state = runtime
            .state
            .lock()
            .map_err(|_| "ショートカットの入力状態を変更できません。")?;
        state.capturing = capturing;
        Ok(())
    }

    pub async fn restore(app: AppHandle) -> Result<(), String> {
        tauri::async_runtime::spawn_blocking(move || restore_blocking(app))
            .await
            .map_err(|e| format!("ショートカットの復元を完了できません: {e}"))?
    }

    pub fn unregister_all(app: &AppHandle) {
        if let Err(error) = app.global_shortcut().unregister_all() {
            eprintln!("終了時にショートカットを解除できません: {error}");
        }
    }

    fn restore_blocking(app: AppHandle) -> Result<(), String> {
        let runtime = app.state::<ShortcutRuntime>();
        let _operation = runtime
            .operation
            .lock()
            .map_err(|_| "ショートカット処理を開始できません。")?;
        let projects = app.state::<ProjectStore>().list()?;
        let mut seen = HashMap::new();
        for project in projects {
            let Some(saved) = project.shortcut else {
                continue;
            };
            let key = match normalize_shortcut(&saved) {
                Ok(key) => key,
                Err(reason) => {
                    if let Ok(mut state) = runtime.state.lock() {
                        state.errors.insert(
                            project.id,
                            format!("保存済みショートカットが無効です: {reason}"),
                        );
                    }
                    continue;
                }
            };
            if let Some(owner_name) = seen.get(&key) {
                if let Ok(mut state) = runtime.state.lock() {
                    state.errors.insert(
                        project.id,
                        format!("ショートカットは「{owner_name}」と重複しています。"),
                    );
                }
                continue;
            }
            seen.insert(key.clone(), project.name.clone());
            let already_routed = runtime
                .state
                .lock()
                .map(|s| s.routes.get(&key) == Some(&project.id))
                .unwrap_or(false);
            if already_routed {
                continue;
            }
            match app.global_shortcut().register(key.as_str()) {
                Ok(()) => {
                    if let Ok(mut state) = runtime.state.lock() {
                        state.routes.insert(key, project.id);
                    }
                }
                Err(e) => {
                    if let Ok(mut state) = runtime.state.lock() {
                        state.errors.insert(
                            project.id,
                            format!("OSにショートカットを登録できません: {e}"),
                        );
                    }
                }
            }
        }
        Ok(())
    }

    pub fn errors(app: &AppHandle) -> Vec<super::ShortcutError> {
        let runtime = app.state::<ShortcutRuntime>();
        runtime
            .state
            .lock()
            .map(|s| {
                s.errors
                    .iter()
                    .map(|(project_id, reason)| super::ShortcutError {
                        project_id: project_id.clone(),
                        reason: reason.clone(),
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn set(
        app: &AppHandle,
        expected: Project,
        shortcut: Option<String>,
    ) -> Result<Project, String> {
        set_with_save(app, expected, shortcut, |store, current, key| {
            store.set_shortcut(current, key)
        })
    }

    pub fn register_new_project(
        app: &AppHandle,
        shortcut: &str,
        save: impl FnOnce(&ProjectStore, &str) -> Result<Project, ProjectRegistrationError>,
    ) -> Result<Project, ProjectRegistrationError> {
        let runtime = app.state::<ShortcutRuntime>();
        let _operation = runtime.operation.lock().map_err(|_| {
            ProjectRegistrationError::shortcut("ショートカット処理を開始できません。".into())
        })?;
        let store = app.state::<ProjectStore>();
        let key = checked_shortcut(&store.list()?, None, shortcut)
            .map_err(ProjectRegistrationError::shortcut)?;

        let project = register_then_save(
            || register_key(app, &key).map_err(ProjectRegistrationError::shortcut),
            || save(&store, &key),
            |error| match rollback_key(app, &key) {
                Ok(()) => error,
                Err(reason) => ProjectRegistrationError::shortcut(format!(
                    "プロジェクトを保存できず、ショートカットの解除にも失敗しました。Reentryを終了してから再試行してください。{reason}"
                )),
            },
        )?;

        runtime
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .routes
            .insert(key, project.id.clone());
        Ok(project)
    }

    fn register_key(app: &AppHandle, key: &str) -> Result<(), String> {
        app.global_shortcut()
            .register(key)
            .map_err(|error| format!("OSにショートカットを登録できません: {error}"))
    }

    fn rollback_key(app: &AppHandle, key: &str) -> Result<(), String> {
        let result = app.global_shortcut().unregister(key);
        if let Ok(mut state) = app.state::<ShortcutRuntime>().state.lock() {
            state.pressed.remove(key);
        }
        result.map_err(|error| error.to_string())
    }

    pub fn set_with_save(
        app: &AppHandle,
        expected: Project,
        shortcut: Option<String>,
        save: impl FnOnce(&ProjectStore, &Project, Option<&str>) -> Result<Project, String>,
    ) -> Result<Project, String> {
        let runtime = app.state::<ShortcutRuntime>();
        let _operation = runtime
            .operation
            .lock()
            .map_err(|_| "ショートカット処理を開始できません。")?;
        let store = app.state::<ProjectStore>();
        let current = store.get_matching(&expected)?;
        let normalized = match shortcut.as_deref() {
            Some(key) => Some(checked_shortcut(&store.list()?, Some(&expected.id), key)?),
            None => None,
        };
        let old = current.shortcut.clone();
        let already = normalized.as_ref().is_some_and(|key| {
            runtime
                .state
                .lock()
                .map(|s| s.routes.get(key) == Some(&expected.id))
                .unwrap_or(false)
        });
        let key = normalized.as_deref().filter(|_| !already);
        let updated = register_then_save(
            || key.map_or(Ok(()), |key| register_key(app, key)),
            || save(&store, &current, normalized.as_deref()),
            |save_error| {
                if let Some(key) = key
                    && let Err(error) = rollback_key(app, key)
                {
                    eprintln!("新規ショートカットのロールバックに失敗しました ({key}): {error}");
                }
                save_error
            },
        )?;
        let old_key_owned = {
            let mut state = runtime
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if let Some(key) = normalized.as_ref() {
                state.routes.insert(key.clone(), expected.id.clone());
            }
            let mut old_key_owned = false;
            if let Some(key) = old.as_ref().filter(|key| Some(*key) != normalized.as_ref())
                && state.routes.get(key) == Some(&expected.id)
            {
                state.routes.remove(key);
                state.pressed.remove(key);
                old_key_owned = true;
            }
            state.errors.remove(&expected.id);
            old_key_owned
        };
        if let Some(key) = old
            .as_ref()
            .filter(|key| Some(*key) != normalized.as_ref())
            .filter(|_| old_key_owned)
            && let Err(error) = app.global_shortcut().unregister(key.as_str())
            && let Ok(mut state) = runtime.state.lock()
        {
            state.errors.insert(
                expected.id,
                format!("保存後に旧ショートカットを解除できませんでした: {error}"),
            );
        }
        Ok(updated)
    }

    pub fn remove(app: &AppHandle, expected: &Project) -> Result<(), String> {
        let runtime = app.state::<ShortcutRuntime>();
        let _operation = runtime
            .operation
            .lock()
            .map_err(|_| "ショートカット処理を開始できません。")?;
        let project = app.state::<ProjectStore>().get_matching(expected)?;
        app.state::<ProjectStore>().remove(&project)?;
        if let Some(key) = project.shortcut {
            let owns_key = if let Ok(mut state) = runtime.state.lock() {
                let owns = state.routes.get(&key) == Some(&project.id);
                if owns {
                    state.routes.remove(&key);
                    state.pressed.remove(&key);
                }
                state.errors.remove(&project.id);
                owns
            } else {
                false
            };
            if owns_key && let Err(error) = app.global_shortcut().unregister(key.as_str()) {
                eprintln!(
                    "プロジェクト {} のショートカット解除に失敗しました ({key}): {error}",
                    project.id
                );
            }
        } else if let Ok(mut state) = runtime.state.lock() {
            state.errors.remove(&project.id);
        }
        Ok(())
    }
}

#[cfg(target_os = "macos")]
pub use runtime::{
    ShortcutRuntime, errors, on_shortcut, register_new_project, remove, restore, set, set_capture,
    set_with_save, unregister_all,
};

#[cfg(test)]
mod tests {
    use super::normalize_shortcut;

    #[test]
    fn normalizes_aliases_case_and_modifier_order() {
        assert_eq!(
            normalize_shortcut(" shift + option + ctrl + cmd + a ").unwrap(),
            "Command+Control+Alt+Shift+KeyA"
        );
        assert_eq!(normalize_shortcut("alt+f12").unwrap(), "Alt+F12");
        assert_eq!(normalize_shortcut("ctrl+7").unwrap(), "Control+Digit7");
        assert_eq!(normalize_shortcut("ctrl+keya").unwrap(), "Control+KeyA");
        for normalized in [
            "Command+Control+Alt+Shift+KeyA",
            "Alt+F12",
            "Control+Digit7",
        ] {
            assert_eq!(normalize_shortcut(normalized).unwrap(), normalized);
        }
    }

    #[test]
    fn rejects_invalid_and_reserved_shortcuts() {
        for value in [
            "Shift+A",
            "Control+Ctrl+A",
            "Ctrl++A",
            "Ctrl+A+Shift",
            "Cmd+Q",
            "Meta+W",
            "Ctrl+F13",
            "Ctrl+é",
        ] {
            assert!(normalize_shortcut(value).is_err(), "{value}");
        }
        assert_eq!(
            normalize_shortcut("Ctrl+Cmd+Q").unwrap(),
            "Command+Control+KeyQ"
        );
    }

    #[test]
    fn repeated_press_is_ignored_until_release() {
        let mut pressed = std::collections::HashSet::new();
        assert!(super::transition_pressed(
            &mut pressed,
            "Command+KeyA",
            true
        ));
        assert!(!super::transition_pressed(
            &mut pressed,
            "Command+KeyA",
            true
        ));
        assert!(!super::transition_pressed(
            &mut pressed,
            "Command+KeyA",
            false
        ));
        assert!(super::transition_pressed(
            &mut pressed,
            "Command+KeyA",
            true
        ));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn plugin_shortcut_round_trip_matches_saved_normal_form() {
        use tauri_plugin_global_shortcut::Shortcut;

        for saved in ["Command+Control+Alt+Shift+KeyA", "Control+Digit7"] {
            let parsed: Shortcut = saved.parse().unwrap();
            assert_eq!(normalize_shortcut(&parsed.into_string()).unwrap(), saved);
        }
    }

    #[test]
    fn registration_is_rolled_back_on_save_failure_before_old_key_changes() {
        let operations = std::cell::RefCell::new(Vec::new());
        let result: Result<(), String> = super::register_then_save(
            || {
                operations.borrow_mut().push("register new");
                Ok(())
            },
            || {
                operations.borrow_mut().push("save");
                Err("disk full".into())
            },
            |error| {
                operations.borrow_mut().push("unregister new");
                error
            },
        );
        assert!(result.is_err());
        assert_eq!(
            *operations.borrow(),
            ["register new", "save", "unregister new"]
        );
    }

    #[test]
    fn os_registration_failure_does_not_save_or_unregister() {
        let operations = std::cell::RefCell::new(Vec::new());
        let result: Result<(), String> = super::register_then_save(
            || {
                operations.borrow_mut().push("register new");
                Err("shortcut already owned by another app".into())
            },
            || {
                operations.borrow_mut().push("save");
                Ok(())
            },
            |error| {
                operations.borrow_mut().push("unregister new");
                error
            },
        );
        assert!(result.is_err());
        assert_eq!(*operations.borrow(), ["register new"]);
    }
}
