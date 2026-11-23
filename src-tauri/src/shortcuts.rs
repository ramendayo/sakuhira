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

#[cfg(any(target_os = "macos", test))]
fn check_quick_resume_conflict(assigned: Option<&str>, key: &str) -> Result<(), String> {
    if assigned
        .and_then(|shortcut| normalize_shortcut(shortcut).ok())
        .as_deref()
        == Some(key)
    {
        return Err("このショートカットはクイック再開に割り当てられています。".into());
    }
    Ok(())
}

#[cfg(any(target_os = "macos", test))]
fn persist_quick_resume_settings(
    mut settings: crate::settings::Settings,
    old_key: Option<&str>,
    projects: &[crate::projects::Project],
    register: impl FnOnce(&str) -> Result<(), String>,
    save: impl FnOnce(crate::settings::Settings) -> Result<crate::settings::Settings, String>,
    unregister: impl FnOnce(&str) -> Result<(), String>,
) -> Result<crate::settings::Settings, crate::settings::SettingsSaveError> {
    use crate::{projects::checked_shortcut, settings::SettingsSaveError};

    settings.quick_resume_shortcut = settings
        .quick_resume_shortcut
        .as_deref()
        .map(|key| checked_shortcut(projects, None, key))
        .transpose()
        .map_err(SettingsSaveError::shortcut)?;
    let normalized = settings.quick_resume_shortcut.clone();
    let new_registration = normalized.as_deref().filter(|key| Some(*key) != old_key);
    register_then_save(
        || {
            new_registration
                .map_or(Ok(()), register)
                .map_err(SettingsSaveError::shortcut)
        },
        || save(settings).map_err(SettingsSaveError::Settings),
        |save_error| {
            if let Some(key) = new_registration
                && let Err(reason) = unregister(key)
            {
                let message = save_error.message();
                return SettingsSaveError::Settings(format!(
                    "{message} 新しいショートカットの解除にも失敗しました。sakuhiraを終了してから再試行してください。{reason}"
                ));
            }
            save_error
        },
    )
}

#[cfg(any(target_os = "macos", test))]
#[derive(Default)]
struct QuickResumeRegistration {
    key: Option<String>,
    restore_error: Option<String>,
    release_errors: std::collections::BTreeMap<String, String>,
}

#[cfg(any(target_os = "macos", test))]
impl QuickResumeRegistration {
    fn replace_key(&mut self, key: Option<String>) -> Option<String> {
        self.restore_error = None;
        if key == self.key {
            return None;
        }
        if let Some(active_key) = key.as_ref() {
            self.release_errors.remove(active_key);
        }
        std::mem::replace(&mut self.key, key)
    }

    fn issue(&self) -> Option<String> {
        let mut issues: Vec<_> = self.restore_error.iter().cloned().collect();
        if !self.release_errors.is_empty() {
            issues.extend(self.release_errors.iter().map(|(key, reason)| {
                format!("旧ショートカット「{key}」を解除できませんでした: {reason}")
            }));
            issues.push("⌘Qでsakuhiraを完全終了してから起動し直してください。".into());
        }
        (!issues.is_empty()).then(|| issues.join("\n"))
    }
}

#[cfg(target_os = "macos")]
mod runtime {
    use super::{
        QuickResumeRegistration, check_quick_resume_conflict, normalize_shortcut,
        persist_quick_resume_settings, register_then_save, transition_pressed,
    };
    use crate::{
        launch,
        projects::{Project, ProjectRegistrationError, ProjectStore, checked_shortcut},
        settings::{Settings, SettingsSaveError, SettingsStore},
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
        quick_resume: QuickResumeRegistration,
        pressed: HashSet<String>,
        capturing: bool,
    }

    #[derive(Default)]
    pub struct ShortcutRuntime {
        operation: Mutex<()>,
        state: Mutex<State>,
    }

    pub fn on_shortcut(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
        let Some(key) = normalize_shortcut(&shortcut.into_string()).ok() else {
            return;
        };
        let runtime = app.state::<ShortcutRuntime>();
        let (capturing, quick_resume, project_id) = {
            let Ok(mut state) = runtime.state.lock() else {
                return;
            };
            match event.state {
                ShortcutState::Pressed if transition_pressed(&mut state.pressed, &key, true) => (
                    state.capturing,
                    state.quick_resume.key.as_deref() == Some(&key),
                    state.routes.get(&key).cloned(),
                ),
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
        if quick_resume {
            if let Err(error) = crate::quick_resume::request_open(app) {
                eprintln!("クイック再開を開けません: {error}");
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
                let result = launch::resume_and_record(app.clone(), project.clone()).await;
                launch::notify_project_shortcut_result(&app, &project, &result);
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
        let projects = app.state::<ProjectStore>().list().inspect_err(|reason| {
            record_quick_resume_restore_error(
                &runtime,
                format!("プロジェクトのショートカットを確認できません: {reason}"),
            );
        })?;
        if let Err(reason) = restore_quick_resume(&app, &runtime, &projects) {
            record_quick_resume_restore_error(
                &runtime,
                format!("クイック再開のショートカットを復元できません: {reason}"),
            );
        }
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

    fn restore_quick_resume(
        app: &AppHandle,
        runtime: &ShortcutRuntime,
        projects: &[Project],
    ) -> Result<(), String> {
        let Some(saved) = app.state::<SettingsStore>().load()?.quick_resume_shortcut else {
            return Ok(());
        };
        let key = checked_shortcut(projects, None, &saved)?;
        if active_quick_resume_key(runtime).as_deref() != Some(&key) {
            register_key(app, &key)?;
            let _ = replace_quick_resume_key(runtime, Some(key));
        }
        Ok(())
    }

    pub fn save_with_quick_resume(
        app: &AppHandle,
        expected: &Settings,
        settings: Settings,
    ) -> Result<Settings, SettingsSaveError> {
        let runtime = app.state::<ShortcutRuntime>();
        let _operation = runtime.operation.lock().map_err(|_| {
            SettingsSaveError::shortcut("ショートカット処理を開始できません。".into())
        })?;
        let store = app.state::<SettingsStore>();
        let old_key = active_quick_resume_key(&runtime);
        let projects = if settings.quick_resume_shortcut.is_some() {
            app.state::<ProjectStore>()
                .list()
                .map_err(SettingsSaveError::Settings)?
        } else {
            Vec::new()
        };
        let saved = persist_quick_resume_settings(
            settings,
            old_key.as_deref(),
            &projects,
            |key| register_key(app, key),
            |settings| store.save_with_registered_shortcut(expected, settings),
            |key| rollback_key(app, key),
        )?;
        if let Some(key) = replace_quick_resume_key(&runtime, saved.quick_resume_shortcut.clone())
            && let Err(reason) = rollback_key(app, &key)
        {
            // The macOS backend discards the native handle even when unregistering fails.
            // Keep the warning until the key becomes active again or the app exits.
            runtime
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .quick_resume
                .release_errors
                .insert(key, reason);
        }
        Ok(saved)
    }

    fn active_quick_resume_key(runtime: &ShortcutRuntime) -> Option<String> {
        runtime
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .quick_resume
            .key
            .clone()
    }

    fn replace_quick_resume_key(runtime: &ShortcutRuntime, key: Option<String>) -> Option<String> {
        runtime
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .quick_resume
            .replace_key(key)
    }

    fn record_quick_resume_restore_error(runtime: &ShortcutRuntime, reason: String) {
        if let Ok(mut state) = runtime.state.lock() {
            state.quick_resume.restore_error = Some(reason);
        }
    }

    pub fn quick_resume_restore_failed(app: &AppHandle) -> bool {
        app.state::<ShortcutRuntime>()
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .quick_resume
            .restore_error
            .is_some()
    }

    pub fn quick_resume_error(app: &AppHandle) -> Option<String> {
        app.state::<ShortcutRuntime>()
            .state
            .lock()
            .ok()
            .and_then(|state| state.quick_resume.issue())
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
        let key = checked_project_shortcut(app, &store.list()?, None, shortcut)
            .map_err(ProjectRegistrationError::shortcut)?;

        let project = register_then_save(
            || register_key(app, &key).map_err(ProjectRegistrationError::shortcut),
            || save(&store, &key),
            |error| match rollback_key(app, &key) {
                Ok(()) => error,
                Err(reason) => ProjectRegistrationError::shortcut(format!(
                    "プロジェクトを保存できず、ショートカットの解除にも失敗しました。sakuhiraを終了してから再試行してください。{reason}"
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

    fn checked_project_shortcut(
        app: &AppHandle,
        projects: &[Project],
        project_id: Option<&str>,
        shortcut: &str,
    ) -> Result<String, String> {
        let key = checked_shortcut(projects, project_id, shortcut)?;
        let settings = app.state::<SettingsStore>().load()?;
        check_quick_resume_conflict(settings.quick_resume_shortcut.as_deref(), &key)?;
        Ok(key)
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
            Some(key) => Some(checked_project_shortcut(
                app,
                &store.list()?,
                Some(&expected.id),
                key,
            )?),
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
    ShortcutRuntime, errors, on_shortcut, quick_resume_error, quick_resume_restore_failed,
    register_new_project, remove, restore, save_with_quick_resume, set, set_capture, set_with_save,
    unregister_all,
};

#[cfg(test)]
mod tests {
    use super::normalize_shortcut;

    #[test]
    fn quick_resume_and_project_assignments_cannot_share_a_normalized_key() {
        use crate::projects::{ProjectIcon, ProjectStore, checked_shortcut};
        let directory = tempfile::tempdir().unwrap();
        let store = ProjectStore::new(directory.path().to_owned());
        let project = store
            .add_with_options(
                "Docs",
                None,
                Some("https://example.com"),
                ProjectIcon::Auto,
                Some("Ctrl+J"),
                Vec::new(),
            )
            .unwrap();
        let projects = store.list().unwrap();
        let error = checked_shortcut(&projects, None, "control+keyj").unwrap_err();
        assert!(error.contains("Docs"));
        let key = checked_shortcut(&projects, Some(&project.id), "control+k").unwrap();
        assert!(super::check_quick_resume_conflict(Some(" CTRL + K "), &key).is_err());
        assert!(super::check_quick_resume_conflict(Some("Ctrl+L"), &key).is_ok());
        assert!(super::check_quick_resume_conflict(None, &key).is_ok());
    }

    #[test]
    fn a_stale_quick_resume_save_removes_the_new_registration_and_keeps_the_old_key() {
        use crate::settings::{SettingsStore, ThemePreference};
        use std::{cell::RefCell, collections::HashSet};
        let directory = tempfile::tempdir().unwrap();
        let store = SettingsStore::new(directory.path().to_owned());
        let old_key = "Control+KeyJ";
        let new_key = "Control+KeyK";
        let initial = store.load().unwrap();
        let expected = store
            .save_with_registered_shortcut(
                &initial,
                crate::settings::Settings {
                    quick_resume_shortcut: Some(old_key.into()),
                    ..initial.clone()
                },
            )
            .unwrap();
        let mut changed = expected.clone();
        changed.theme = ThemePreference::Dark;
        let current = store.save(&expected, changed).unwrap();
        let registered = RefCell::new(HashSet::from([old_key.to_owned()]));
        let draft = crate::settings::Settings {
            quick_resume_shortcut: Some(new_key.into()),
            default_editor: crate::settings::Editor::Cursor,
            ..expected.clone()
        };

        let result = super::persist_quick_resume_settings(
            draft,
            Some(old_key),
            &[],
            |key| {
                registered.borrow_mut().insert(key.to_owned());
                Ok(())
            },
            |settings| store.save_with_registered_shortcut(&expected, settings),
            |key| {
                registered.borrow_mut().remove(key);
                Ok(())
            },
        );
        assert!(matches!(
            result,
            Err(crate::settings::SettingsSaveError::Settings(_))
        ));
        assert_eq!(*registered.borrow(), HashSet::from([old_key.to_owned()]));
        assert_eq!(store.load().unwrap(), current);
    }

    #[test]
    fn a_write_failure_rolls_back_a_new_registration() {
        use crate::settings::{Editor, Settings, SettingsSaveError, ThemePreference};
        use std::cell::Cell;

        let registered = Cell::new(false);
        let draft = Settings {
            theme: ThemePreference::Dark,
            default_editor: Editor::Cursor,
            quick_resume_shortcut: Some("Ctrl+K".into()),
            ..Settings::default()
        };
        let result = super::persist_quick_resume_settings(
            draft,
            Some("Control+KeyJ"),
            &[],
            |key| {
                assert_eq!(key, "Control+KeyK");
                registered.set(true);
                Ok(())
            },
            |settings| {
                assert!(registered.get());
                assert_eq!(settings.theme, ThemePreference::Dark);
                assert_eq!(settings.default_editor, Editor::Cursor);
                assert_eq!(
                    settings.quick_resume_shortcut.as_deref(),
                    Some("Control+KeyK")
                );
                Err("保存データを書き込めません。".into())
            },
            |key| {
                assert_eq!(key, "Control+KeyK");
                registered.set(false);
                Ok(())
            },
        );
        assert!(
            matches!(result, Err(SettingsSaveError::Settings(message)) if message == "保存データを書き込めません。")
        );
        assert!(!registered.get());
    }

    #[test]
    fn combined_save_keeps_values_on_conflict_and_can_retry_and_clear() {
        use crate::{
            projects::{ProjectIcon, ProjectStore},
            settings::{Editor, Settings, SettingsSaveError, SettingsStore, ThemePreference},
        };
        let directory = tempfile::tempdir().unwrap();
        let store = SettingsStore::new(directory.path().to_owned());
        let expected = store.load().unwrap();
        let projects = ProjectStore::new(directory.path().to_owned());
        let project = projects
            .add_with_options(
                "Docs",
                None,
                Some("https://example.com"),
                ProjectIcon::Auto,
                Some("Ctrl+J"),
                vec![],
            )
            .unwrap();
        let draft = |key: Option<&str>| Settings {
            theme: ThemePreference::Dark,
            default_editor: Editor::Cursor,
            quick_resume_shortcut: key.map(str::to_owned),
            ..expected.clone()
        };
        let conflict = super::persist_quick_resume_settings(
            draft(Some("Ctrl+J")),
            None,
            &[project],
            |_| panic!("must check project conflicts before registering"),
            |settings| store.save_with_registered_shortcut(&expected, settings),
            |_| panic!("no key was registered"),
        )
        .unwrap_err();
        let error = serde_json::to_value(conflict).unwrap();
        assert_eq!(error["field"], "quickResumeShortcut");
        assert!(error["message"].as_str().unwrap().contains("Docs"));
        assert_eq!(store.load().unwrap(), expected);

        let denied = super::persist_quick_resume_settings(
            draft(Some("Ctrl+K")),
            None,
            &[],
            |_| Err("OSがキーを予約しています。".into()),
            |settings| store.save_with_registered_shortcut(&expected, settings),
            |_| panic!("no key was registered"),
        )
        .unwrap_err();
        assert!(matches!(denied, SettingsSaveError::Shortcut { .. }));
        assert_eq!(store.load().unwrap(), expected);

        let saved = super::persist_quick_resume_settings(
            draft(Some("Ctrl+L")),
            None,
            &[],
            |key| {
                assert_eq!(key, "Control+KeyL");
                Ok(())
            },
            |settings| store.save_with_registered_shortcut(&expected, settings),
            |_| panic!("registration should not be rolled back"),
        )
        .unwrap();
        assert_eq!(saved, draft(Some("Control+KeyL")));
        let reopened = SettingsStore::new(directory.path().to_owned());
        assert_eq!(reopened.load().unwrap(), saved);

        // A key saved on disk can be retried when it was not restored in the OS.
        let retried = super::persist_quick_resume_settings(
            saved.clone(),
            None,
            &[],
            |key| {
                assert_eq!(key, "Control+KeyL");
                Ok(())
            },
            |settings| reopened.save_with_registered_shortcut(&saved, settings),
            |_| panic!("registration should not be rolled back"),
        )
        .unwrap();
        assert_eq!(retried, saved);

        let cleared = super::persist_quick_resume_settings(
            draft(None),
            Some("Control+KeyL"),
            &[],
            |_| panic!("no new key to register"),
            |settings| reopened.save_with_registered_shortcut(&saved, settings),
            |_| panic!("successful saves never roll back"),
        )
        .unwrap();
        assert_eq!(cleared, draft(None));
        assert_eq!(reopened.load().unwrap(), cleared);
    }

    #[test]
    fn quick_resume_keeps_failed_release_warnings_after_saving_the_active_key_again() {
        use super::QuickResumeRegistration;
        use crate::settings::{Editor, SettingsStore};

        let directory = tempfile::tempdir().unwrap();
        let store = SettingsStore::new(directory.path().to_owned());
        let defaults = store.load().unwrap();
        let mut initial = defaults.clone();
        initial.quick_resume_shortcut = Some("Control+KeyJ".into());
        let initial = store
            .save_with_registered_shortcut(&defaults, initial)
            .unwrap();
        let mut registration = QuickResumeRegistration::default();
        assert!(
            registration
                .replace_key(initial.quick_resume_shortcut.clone())
                .is_none()
        );

        let mut draft = initial.clone();
        draft.quick_resume_shortcut = Some("Control+KeyK".into());
        let saved = super::persist_quick_resume_settings(
            draft,
            registration.key.as_deref(),
            &[],
            |_| Ok(()),
            |settings| store.save_with_registered_shortcut(&initial, settings),
            |_| Ok(()),
        )
        .unwrap();

        let old_key = registration
            .replace_key(saved.quick_resume_shortcut.clone())
            .unwrap();
        registration
            .release_errors
            .insert(old_key, "OS error".into());
        let warning = registration.issue().unwrap();
        assert!(warning.contains("Control+KeyJ"));
        assert!(warning.contains("⌘Q"));
        assert_eq!(registration.key.as_deref(), Some("Control+KeyK"));
        assert_eq!(store.load().unwrap(), saved);

        let mut draft = saved.clone();
        draft.default_editor = Editor::Cursor;
        let resaved = store.save(&saved, draft.clone()).unwrap();
        assert_eq!(resaved, draft);
        assert!(
            registration
                .replace_key(resaved.quick_resume_shortcut)
                .is_none()
        );
        assert!(registration.restore_error.is_none());
        assert_eq!(registration.issue().as_deref(), Some(warning.as_str()));

        registration.restore_error = Some("復元エラー".into());
        assert!(registration.issue().unwrap().contains("復元エラー"));
        assert_eq!(
            registration.replace_key(None).as_deref(),
            Some("Control+KeyK")
        );
        assert_eq!(registration.issue().as_deref(), Some(warning.as_str()));
        assert!(QuickResumeRegistration::default().issue().is_none());
    }

    #[test]
    fn only_a_successful_reassignment_clears_the_reactivated_keys_warning() {
        use super::{QuickResumeRegistration, persist_quick_resume_settings};
        use crate::settings::{SettingsSaveError, SettingsStore};

        let directory = tempfile::tempdir().unwrap();
        let store = SettingsStore::new(directory.path().to_owned());
        let defaults = store.load().unwrap();
        let mut saved = defaults.clone();
        saved.quick_resume_shortcut = Some("Control+KeyK".into());
        let saved = store
            .save_with_registered_shortcut(&defaults, saved)
            .unwrap();
        let mut registration = QuickResumeRegistration {
            key: saved.quick_resume_shortcut.clone(),
            release_errors: [
                ("Control+KeyJ".into(), "OS error for J".into()),
                ("Control+KeyL".into(), "OS error for L".into()),
            ]
            .into(),
            ..QuickResumeRegistration::default()
        };
        let warnings = registration.issue().unwrap();
        let mut draft = saved.clone();
        draft.quick_resume_shortcut = Some("Ctrl+J".into());

        let rejected = persist_quick_resume_settings(
            draft.clone(),
            registration.key.as_deref(),
            &[],
            |key| {
                assert_eq!(key, "Control+KeyJ");
                Err("OS denied registration".into())
            },
            |_| panic!("a rejected registration must not save"),
            |_| panic!("a rejected registration must not roll back"),
        );
        assert!(matches!(rejected, Err(SettingsSaveError::Shortcut { .. })));
        assert_eq!(registration.issue().as_deref(), Some(warnings.as_str()));
        assert_eq!(store.load().unwrap(), saved);

        let stale = persist_quick_resume_settings(
            draft.clone(),
            registration.key.as_deref(),
            &[],
            |_| Ok(()),
            |settings| store.save_with_registered_shortcut(&defaults, settings),
            |key| {
                assert_eq!(key, "Control+KeyJ");
                Ok(())
            },
        );
        assert!(matches!(stale, Err(SettingsSaveError::Settings(_))));
        assert_eq!(registration.key.as_deref(), Some("Control+KeyK"));
        assert_eq!(registration.issue().as_deref(), Some(warnings.as_str()));
        assert_eq!(store.load().unwrap(), saved);

        let updated = persist_quick_resume_settings(
            draft,
            registration.key.as_deref(),
            &[],
            |key| {
                assert_eq!(key, "Control+KeyJ");
                Ok(())
            },
            |settings| store.save_with_registered_shortcut(&saved, settings),
            |_| panic!("a successful registration and save must not roll back"),
        )
        .unwrap();
        let old_key = registration.replace_key(updated.quick_resume_shortcut.clone());
        assert_eq!(old_key.as_deref(), Some("Control+KeyK"));
        assert_eq!(registration.key.as_deref(), Some("Control+KeyJ"));
        assert_eq!(store.load().unwrap(), updated);
        let remaining = registration.issue().unwrap();
        assert!(!remaining.contains("Control+KeyJ"));
        assert!(remaining.contains("Control+KeyL"));
        assert!(remaining.contains("⌘Q"));
    }

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
