use super::*;
use tempfile::tempdir;

#[test]
fn missing_settings_use_vscode_without_creating_json() {
    let root = tempdir().unwrap();
    let store = SettingsStore::new(root.path().join("data"));
    assert_eq!(store.load().unwrap().default_editor, Editor::VsCode);
    assert_eq!(store.load().unwrap().theme, ThemePreference::System);
    assert!(!store.directory.join("settings.json").exists());
}

#[test]
fn legacy_settings_keep_light_mode_without_rewriting_the_file() {
    let root = tempdir().unwrap();
    let path = root.path().join("settings.json");
    let legacy = r#"{"version":1,"settings":{"defaultEditor":"cursor"}}"#;
    fs::write(&path, legacy).unwrap();
    let loaded = SettingsStore::new(root.path().to_owned()).load().unwrap();
    assert_eq!(loaded.default_editor, Editor::Cursor);
    assert_eq!(loaded.theme, ThemePreference::Light);
    assert_eq!(fs::read_to_string(path).unwrap(), legacy);
}

#[test]
fn every_theme_survives_reopening_and_maps_to_a_fixed_native_preference() {
    let root = tempdir().unwrap();
    let store = SettingsStore::new(root.path().to_owned());
    let mut expected = store.load().unwrap();
    for (theme, native) in [
        (ThemePreference::Light, Some(tauri::Theme::Light)),
        (ThemePreference::Dark, Some(tauri::Theme::Dark)),
        (ThemePreference::System, None),
    ] {
        let saved = store
            .save(
                &expected,
                Settings {
                    theme,
                    ..expected.clone()
                },
            )
            .unwrap();
        assert_eq!(
            SettingsStore::new(root.path().to_owned()).load().unwrap(),
            saved
        );
        assert_eq!(saved.theme.native_theme(), native);
        expected = saved;
    }
}

#[test]
fn saved_editor_survives_reopening_and_can_be_changed_back() {
    let root = tempdir().unwrap();
    let store = SettingsStore::new(root.path().to_owned());
    let original = store.load().unwrap();
    let configured = store
        .save(
            &original,
            Settings {
                default_editor: Editor::Cursor,
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(
        SettingsStore::new(root.path().to_owned()).load().unwrap(),
        configured
    );
    assert_eq!(store.save(&configured, original.clone()).unwrap(), original);
}

#[test]
fn corrupt_unsupported_and_unreadable_settings_do_not_fall_back_or_overwrite() {
    let root = tempdir().unwrap();
    let store = SettingsStore::new(root.path().to_owned());
    let path = root.path().join("settings.json");
    for text in [
        "",
        "{broken",
        r#"{"version":2,"settings":{"defaultEditor":"vsCode"}}"#,
        r#"{"version":1,"settings":{"defaultEditor":"sh"}}"#,
        r#"{"version":1,"settings":{"defaultEditor":"cursor","command":"rm"}}"#,
        r#"{"version":1,"settings":{"defaultEditor":"cursor","theme":"unknown"}}"#,
        r#"{"version":1,"settings":{}}"#,
    ] {
        fs::write(&path, text).unwrap();
        assert!(store.load().is_err());
        assert!(
            store
                .save(&Settings::default(), Settings::default())
                .is_err()
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), text);
    }
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    assert!(store.load().is_err());
    assert!(
        store
            .save(&Settings::default(), Settings::default())
            .is_err()
    );
}

#[test]
fn stale_settings_do_not_overwrite_newer_preferences_or_project_data() {
    let root = tempdir().unwrap();
    let store = SettingsStore::new(root.path().to_owned());
    let original = store.load().unwrap();
    let project_file = root.path().join("projects.json");
    fs::write(&project_file, "project data stays unchanged").unwrap();
    let newer = store
        .save(
            &original,
            Settings {
                default_editor: Editor::Cursor,
                ..Default::default()
            },
        )
        .unwrap();
    assert!(store.save(&original, original.clone()).is_err());
    assert_eq!(store.load().unwrap(), newer);
    assert_eq!(
        fs::read_to_string(project_file).unwrap(),
        "project data stays unchanged"
    );
}

#[test]
fn only_known_editors_and_fixed_macos_targets_are_supported() {
    assert_eq!(
        Editor::VsCode.macos_target(),
        ("-b", "com.microsoft.VSCode")
    );
    assert_eq!(Editor::Cursor.macos_target(), ("-a", "Cursor"));
    assert_eq!(
        serde_json::to_value(Settings::default()).unwrap(),
        serde_json::json!({"defaultEditor":"vsCode", "theme":"system"})
    );
    for value in ["/bin/sh", "cursor --command test", "unknown"] {
        assert!(
            serde_json::from_value::<Settings>(serde_json::json!({"defaultEditor":value})).is_err()
        );
    }
}
