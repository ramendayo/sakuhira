use super::*;
use tempfile::tempdir;

#[test]
fn missing_settings_use_vscode_without_creating_json() {
    let root = tempdir().unwrap();
    let store = SettingsStore::new(root.path().join("data"));
    assert_eq!(store.load().unwrap().default_editor, Editor::VsCode);
    assert_eq!(store.load().unwrap().theme, ThemePreference::System);
    assert_eq!(store.load().unwrap().project_view, ProjectView::default());
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
    assert_eq!(loaded.project_view, ProjectView::default());
    assert_eq!(fs::read_to_string(path).unwrap(), legacy);
}

#[test]
fn project_views_round_trip_without_changing_editor_or_theme() {
    let root = tempdir().unwrap();
    let store = SettingsStore::new(root.path().to_owned());
    let mut expected = store.load().unwrap();
    for layout in [ProjectLayout::Cards, ProjectLayout::List] {
        for card_size in [CardSize::Small, CardSize::Standard, CardSize::Large] {
            let saved = store
                .save(
                    &expected,
                    Settings {
                        project_view: ProjectView { layout, card_size },
                        ..expected.clone()
                    },
                )
                .unwrap();
            assert_eq!(
                SettingsStore::new(root.path().to_owned()).load().unwrap(),
                saved
            );
            assert_eq!(saved.theme, expected.theme);
            assert_eq!(saved.default_editor, expected.default_editor);
            expected = saved;
        }
    }
}

#[test]
fn invalid_project_views_are_rejected_and_stale_views_cannot_overwrite_preferences() {
    let root = tempdir().unwrap();
    let store = SettingsStore::new(root.path().to_owned());
    let original = store.load().unwrap();
    let mut changed = original.clone();
    changed.project_view.layout = ProjectLayout::List;
    store.save(&original, changed).unwrap();
    let path = root.path().join("settings.json");
    let before = fs::read(&path).unwrap();
    assert!(store.save(&original, original.clone()).is_err());
    assert_eq!(fs::read(&path).unwrap(), before);
    for view in [
        serde_json::json!({"layout":"grid","cardSize":"small"}),
        serde_json::json!({"layout":"cards","cardSize":"huge"}),
        serde_json::json!({"layout":"cards"}),
        serde_json::Value::Null,
    ] {
        let mut document: serde_json::Value = serde_json::from_slice(&before).unwrap();
        document["settings"]["projectView"] = view;
        let corrupt = serde_json::to_vec(&document).unwrap();
        fs::write(&path, &corrupt).unwrap();
        assert!(store.load().is_err());
        assert!(store.save(&original, original.clone()).is_err());
        assert_eq!(fs::read(&path).unwrap(), corrupt);
    }
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
        serde_json::json!({"defaultEditor":"vsCode", "theme":"system", "projectView":{"layout":"cards","cardSize":"standard"},"projectOrder":{"sort":"recent","manualIds":[]}})
    );
    for value in ["/bin/sh", "cursor --command test", "unknown"] {
        assert!(
            serde_json::from_value::<Settings>(serde_json::json!({"defaultEditor":value})).is_err()
        );
    }
}

#[test]
fn legacy_view_settings_default_to_recent_order_without_rewriting() {
    let root = tempdir().unwrap();
    let path = root.path().join("settings.json");
    let legacy = r#"{"version":1,"settings":{"defaultEditor":"cursor","theme":"dark","projectView":{"layout":"list","cardSize":"large"}}}"#;
    fs::write(&path, legacy).unwrap();
    let loaded = SettingsStore::new(root.path().to_owned()).load().unwrap();
    assert_eq!(loaded.project_order, ProjectOrder::default());
    assert_eq!(loaded.project_view.layout, ProjectLayout::List);
    assert_eq!(loaded.project_view.card_size, CardSize::Large);
    assert_eq!(loaded.theme, ThemePreference::Dark);
    assert_eq!(fs::read_to_string(path).unwrap(), legacy);
}

#[test]
fn sorting_preferences_and_manual_placement_survive_all_sort_modes() {
    let root = tempdir().unwrap();
    let store = SettingsStore::new(root.path().to_owned());
    let mut expected = store.load().unwrap();
    // 古いIDと重複はUIで補正し、設定の読込自体は妨げない。
    let manual_ids = vec![
        "second".into(),
        "gone".into(),
        "second".into(),
        "first".into(),
    ];
    for sort in [
        ProjectSort::Manual,
        ProjectSort::Recent,
        ProjectSort::Name,
        ProjectSort::Newest,
    ] {
        let next = Settings {
            project_order: ProjectOrder {
                sort,
                manual_ids: manual_ids.clone(),
                pinned_ids: vec!["second".into()],
            },
            ..expected.clone()
        };
        let saved = store.save(&expected, next).unwrap();
        assert_eq!(
            SettingsStore::new(root.path().to_owned()).load().unwrap(),
            saved
        );
        assert_eq!(saved.project_order.manual_ids, manual_ids);
        assert_eq!(saved.project_order.pinned_ids, vec!["second".to_owned()]);
        assert_eq!(saved.project_view, expected.project_view);
        assert_eq!(saved.default_editor, expected.default_editor);
        assert_eq!(saved.theme, expected.theme);
        assert!(store.save(&expected, expected.clone()).is_err());
        expected = saved;
    }
}

#[test]
fn malformed_sorting_preferences_do_not_overwrite_settings() {
    let root = tempdir().unwrap();
    let path = root.path().join("settings.json");
    let store = SettingsStore::new(root.path().to_owned());
    for invalid in [
        serde_json::json!({"sort":"unknown","manualIds":[]}),
        serde_json::json!({"sort":"manual","manualIds":[3]}),
        serde_json::json!({"sort":"manual","manualIds":[],"pinnedIds":[3]}),
        serde_json::json!({"sort":"manual"}),
        serde_json::json!({"sort":"recent","manualIds":[],"extra":true}),
        serde_json::Value::Null,
    ] {
        let mut settings = serde_json::to_value(Settings::default()).unwrap();
        settings["projectOrder"] = invalid;
        let bytes =
            serde_json::to_vec(&serde_json::json!({"version":1,"settings":settings})).unwrap();
        fs::write(&path, &bytes).unwrap();
        assert!(store.load().is_err());
        assert!(
            store
                .save(&Settings::default(), Settings::default())
                .is_err()
        );
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }
}
