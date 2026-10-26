use super::*;
use tempfile::tempdir;

#[test]
fn resume_history_survives_reopening_and_does_not_conflict_with_note_edits() {
    let root = tempdir().unwrap();
    let data = root.path().join("data");
    let store = ProjectStore::new(data.clone());
    let project = store.add("Example", root.path()).unwrap();
    assert_eq!(project.last_resumed_at, None);
    let timestamp = store.record_resume(&project).unwrap();
    assert!(timestamp > 0);
    let reopened = ProjectStore::new(data).list().unwrap().remove(0);
    assert_eq!(reopened.last_resumed_at, Some(timestamp));
    assert_eq!(reopened.notes, project.notes);
    let renamed = store.update(&project, "Example", root.path()).unwrap();
    assert_eq!(renamed.last_resumed_at, Some(timestamp));
    let edited = store
        .set_notes(&project, "Work".into(), "Next".into())
        .unwrap();
    assert_eq!(edited.last_resumed_at, Some(timestamp));
    let before = fs::read(store.directory.join("projects.json")).unwrap();
    assert!(store.record_resume(&project).is_err());
    assert_eq!(
        fs::read(store.directory.join("projects.json")).unwrap(),
        before
    );
    store.remove(&edited).unwrap();
    assert!(store.record_resume(&edited).is_err());
    assert!(store.list().unwrap().is_empty());
}

#[test]
fn legacy_history_defaults_to_none_and_invalid_history_is_not_overwritten() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Example", root.path()).unwrap();
    let path = store.directory.join("projects.json");
    let mut json: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    json["projects"][0]
        .as_object_mut()
        .unwrap()
        .remove("lastResumedAt");
    let legacy = serde_json::to_vec(&json).unwrap();
    fs::write(&path, &legacy).unwrap();
    assert_eq!(store.list().unwrap()[0].last_resumed_at, None);
    assert_eq!(fs::read(&path).unwrap(), legacy);
    for value in [
        serde_json::json!(-1),
        serde_json::json!(8_640_000_000_000_001u64),
        serde_json::json!("invalid"),
    ] {
        json["projects"][0]["lastResumedAt"] = value;
        let bytes = serde_json::to_vec(&json).unwrap();
        fs::write(&path, &bytes).unwrap();
        assert!(store.list().is_err());
        assert!(store.record_resume(&project).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }
}

#[test]
fn missing_document_is_empty_and_does_not_create_json() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    assert!(store.list().unwrap().is_empty());
    assert!(!root.path().join("data/projects.json").exists());
}

#[test]
fn projects_survive_reopening_and_subsequent_saves() {
    let root = tempdir().unwrap();
    let data = root.path().join("data");
    let first = ProjectStore::new(data.clone())
        .add("  日本語プロジェクト  ", root.path())
        .unwrap();
    assert_eq!(first.name, "日本語プロジェクト");
    let folder = root.path().join("second project");
    fs::create_dir(&folder).unwrap();
    let second = ProjectStore::new(data.clone())
        .add("Second", &folder)
        .unwrap();
    assert_ne!(first.id, second.id);
    assert_eq!(ProjectStore::new(data).list().unwrap(), vec![first, second]);
}

#[test]
fn invalid_inputs_do_not_create_document() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    assert!(store.add("  ", root.path()).is_err());
    assert!(store.add(&"あ".repeat(101), root.path()).is_err());
    assert!(store.add("Missing", &root.path().join("missing")).is_err());
    assert!(store.add("Relative", Path::new(".")).is_err());
    let file = root.path().join("file");
    fs::write(&file, "content").unwrap();
    assert!(store.add("File", &file).is_err());
    assert!(!store.directory.join("projects.json").exists());
}

#[test]
fn duplicate_paths_are_rejected_without_changing_saved_data() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    store.add("First", root.path()).unwrap();
    let before = fs::read(store.directory.join("projects.json")).unwrap();
    assert!(store.add("Duplicate", &root.path().join(".")).is_err());
    assert_eq!(
        fs::read(store.directory.join("projects.json")).unwrap(),
        before
    );
}

#[cfg(unix)]
#[test]
fn symlink_to_registered_folder_is_a_duplicate() {
    let root = tempdir().unwrap();
    let folder = root.path().join("folder");
    fs::create_dir(&folder).unwrap();
    let alias = root.path().join("alias");
    std::os::unix::fs::symlink(&folder, &alias).unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    store.add("Original", &folder).unwrap();
    assert!(store.add("Alias", &alias).is_err());
}

#[test]
fn invalid_documents_are_reported_and_never_overwritten() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    fs::create_dir(&store.directory).unwrap();
    for content in [
        "{broken",
        "",
        r#"{"version":2,"projects":[]}"#,
        r#"{"version":1}"#,
        r#"{"version":1,"projects":[{"id":"bad","name":"Name","path":"/tmp"}]}"#,
        r#"{"version":1,"projects":[],"unknown":"preserve"}"#,
    ] {
        fs::write(store.directory.join("projects.json"), content).unwrap();
        assert!(store.list().is_err());
        assert!(store.add("Valid", root.path()).is_err());
        assert_eq!(
            fs::read_to_string(store.directory.join("projects.json")).unwrap(),
            content
        );
    }
}

#[test]
fn moved_project_folder_does_not_prevent_loading() {
    let root = tempdir().unwrap();
    let folder = root.path().join("folder");
    fs::create_dir(&folder).unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Moved", &folder).unwrap();
    fs::remove_dir(&folder).unwrap();
    assert_eq!(store.list().unwrap(), vec![project]);
}

#[test]
fn unreadable_document_is_not_treated_as_empty() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().to_owned());
    fs::create_dir(root.path().join("projects.json")).unwrap();
    assert!(store.list().is_err());
    assert!(store.add("Test", root.path()).is_err());
}

#[test]
fn failed_replacement_preserves_target_and_cleans_temporary_file() {
    let root = tempdir().unwrap();
    let target = root.path().join("projects.json");
    fs::create_dir(&target).unwrap();
    fs::write(target.join("sentinel"), "keep").unwrap();
    let store = ProjectStore::new(root.path().to_owned());
    assert!(
        store
            .write(&ProjectDocument {
                version: 1,
                projects: vec![]
            })
            .is_err()
    );
    assert_eq!(fs::read_to_string(target.join("sentinel")).unwrap(), "keep");
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn concurrent_registrations_do_not_lose_updates() {
    let root = tempdir().unwrap();
    let data = root.path().join("data");
    let mut handles = vec![];
    for index in 0..8 {
        let folder = root.path().join(index.to_string());
        fs::create_dir(&folder).unwrap();
        let store = ProjectStore::new(data.clone());
        handles.push(std::thread::spawn(move || {
            store.add(&index.to_string(), &folder).unwrap()
        }));
    }
    for handle in handles {
        handle.join().unwrap();
    }
    assert_eq!(ProjectStore::new(data).list().unwrap().len(), 8);
}

#[test]
fn editing_preserves_id_and_other_projects_and_survives_reopening() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let first = store.add("First", root.path()).unwrap();
    let second = store.add("Second", &store.directory).unwrap();
    let new_folder = root.path().join("new");
    fs::create_dir(&new_folder).unwrap();
    let edited = store.update(&first, "  Renamed  ", &new_folder).unwrap();
    assert_eq!(edited.id, first.id);
    assert_eq!(edited.name, "Renamed");
    assert_eq!(edited.path, directory_path(&new_folder).unwrap());
    assert_eq!(
        ProjectStore::new(store.directory).list().unwrap(),
        vec![edited, second]
    );
}

#[test]
fn failed_edit_keeps_saved_data_unchanged() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("First", root.path()).unwrap();
    let second = store.add("Second", &store.directory).unwrap();
    let before = fs::read(store.directory.join("projects.json")).unwrap();
    assert!(store.update(&project, " ", root.path()).is_err());
    assert!(
        store
            .update(&project, &"a".repeat(101), root.path())
            .is_err()
    );
    assert!(
        store
            .update(&project, "Duplicate", Path::new(&second.path))
            .is_err()
    );
    assert!(
        store
            .update(&project, "Invalid", &root.path().join("missing"))
            .is_err()
    );
    assert_eq!(
        fs::read(store.directory.join("projects.json")).unwrap(),
        before
    );
}

#[test]
fn missing_folder_can_be_renamed_and_unregistered() {
    let root = tempdir().unwrap();
    let folder = root.path().join("folder");
    fs::create_dir(&folder).unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Missing", &folder).unwrap();
    fs::remove_dir(&folder).unwrap();
    let edited = store
        .update(&project, "Renamed", Path::new(&project.path))
        .unwrap();
    store.remove(&edited).unwrap();
    assert!(store.list().unwrap().is_empty());
}

#[test]
fn unregistering_only_removes_metadata_and_preserves_folder_contents() {
    let root = tempdir().unwrap();
    let folder = root.path().join("folder");
    fs::create_dir(&folder).unwrap();
    fs::write(folder.join("keep.txt"), "keep this").unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Remove", &folder).unwrap();
    let other = store.add("Other", root.path()).unwrap();
    store.remove(&project).unwrap();
    assert_eq!(
        ProjectStore::new(store.directory).list().unwrap(),
        vec![other]
    );
    assert_eq!(
        fs::read_to_string(folder.join("keep.txt")).unwrap(),
        "keep this"
    );
}

#[test]
fn stale_edits_and_removals_do_not_overwrite_newer_data() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Original", root.path()).unwrap();
    let updated = store.update(&project, "Newer", root.path()).unwrap();
    assert!(store.update(&project, "Stale", root.path()).is_err());
    assert!(store.remove(&project).is_err());
    assert_eq!(store.list().unwrap(), vec![updated.clone()]);
    store.remove(&updated).unwrap();
    assert!(store.update(&updated, "Resurrected", root.path()).is_err());
    assert!(store.remove(&updated).is_err());
    assert!(store.list().unwrap().is_empty());
}

#[test]
fn corrupted_document_is_preserved_during_edit_and_removal() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Original", root.path()).unwrap();
    let file = store.directory.join("projects.json");
    fs::write(&file, "{corrupt").unwrap();
    assert!(store.update(&project, "Edit", root.path()).is_err());
    assert!(store.remove(&project).is_err());
    assert_eq!(fs::read_to_string(file).unwrap(), "{corrupt");
}

#[test]
fn older_json_without_launch_url_loads_without_rewriting() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Legacy", root.path()).unwrap();
    let file = store.directory.join("projects.json");
    let mut json: serde_json::Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    json["projects"][0]
        .as_object_mut()
        .unwrap()
        .remove("launchUrl");
    let bytes = serde_json::to_vec(&json).unwrap();
    fs::write(&file, &bytes).unwrap();
    assert_eq!(store.list().unwrap(), vec![project]);
    assert_eq!(fs::read(file).unwrap(), bytes);
}

#[test]
fn launch_url_persists_survives_name_edits_and_can_be_cleared() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Original", root.path()).unwrap();
    let configured = store
        .set_launch_url(&project, Some("https://example.com"))
        .unwrap();
    assert_eq!(
        configured.launch_url.as_deref(),
        Some("https://example.com/")
    );
    assert!(store.get_matching(&project).is_err());
    let edited = store.update(&configured, "Edited", root.path()).unwrap();
    assert_eq!(edited.launch_url, configured.launch_url);
    assert_eq!(
        ProjectStore::new(store.directory.clone()).list().unwrap(),
        vec![edited.clone()]
    );
    let cleared = store.set_launch_url(&edited, Some(" ")).unwrap();
    assert_eq!(cleared.launch_url, None);
    assert_eq!(cleared.id, project.id);
}

#[test]
fn invalid_and_stale_launch_settings_preserve_saved_data() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Project", root.path()).unwrap();
    let before = fs::read(store.directory.join("projects.json")).unwrap();
    assert!(store.set_launch_url(&project, Some("file:///tmp")).is_err());
    assert_eq!(
        fs::read(store.directory.join("projects.json")).unwrap(),
        before
    );
    let configured = store
        .set_launch_url(&project, Some("https://example.com"))
        .unwrap();
    assert!(store.set_launch_url(&project, None).is_err());
    assert_eq!(store.get_matching(&configured).unwrap(), configured);
    store.remove(&configured).unwrap();
    assert!(store.get_matching(&configured).is_err());
}

#[test]
fn older_json_without_notes_loads_empty_notes_without_rewriting() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Legacy", root.path()).unwrap();
    let file = store.directory.join("projects.json");
    let mut json: serde_json::Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    json["projects"][0].as_object_mut().unwrap().remove("notes");
    let bytes = serde_json::to_vec(&json).unwrap();
    fs::write(&file, &bytes).unwrap();
    assert_eq!(store.list().unwrap(), vec![project]);
    assert_eq!(fs::read(file).unwrap(), bytes);
}

#[test]
fn notes_preserve_whitespace_and_survive_reopening_and_other_edits() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Project", root.path()).unwrap();
    let last_work = "  保存処理を追加\n    テストを確認\n";
    let next_task = "次の作業\n- エラー表示を確認";
    let before = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let saved = store
        .set_notes(&project, last_work.into(), next_task.into())
        .unwrap();
    let after = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    assert_eq!(saved.notes.last_work, last_work);
    assert_eq!(saved.notes.next_task, next_task);
    assert!((before..=after).contains(&saved.notes.updated_at.unwrap()));
    assert_eq!(
        ProjectStore::new(store.directory.clone()).list().unwrap(),
        vec![saved.clone()]
    );
    let renamed = store.update(&saved, "Renamed", root.path()).unwrap();
    let configured = store
        .set_launch_url(&renamed, Some("https://example.com"))
        .unwrap();
    assert_eq!(configured.notes, saved.notes);
    assert_eq!(configured.id, project.id);
}

#[test]
fn notes_can_be_cleared_and_unchanged_resaves_keep_the_timestamp() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Project", root.path()).unwrap();
    let first = store
        .set_notes(&project, String::new(), String::new())
        .unwrap();
    assert!(first.notes.updated_at.is_some());
    let saved = store
        .set_notes(&first, "Previous work".into(), "Next task".into())
        .unwrap();
    let unchanged = store
        .set_notes(
            &saved,
            saved.notes.last_work.clone(),
            saved.notes.next_task.clone(),
        )
        .unwrap();
    assert_eq!(unchanged.notes, saved.notes);
    let cleared = store
        .set_notes(&unchanged, String::new(), String::new())
        .unwrap();
    assert_eq!(cleared.notes.last_work, "");
    assert_eq!(cleared.notes.next_task, "");
    assert!(cleared.notes.updated_at.is_some());
}

#[test]
fn invalid_and_stale_note_saves_preserve_existing_data() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Project", root.path()).unwrap();
    let saved = store
        .set_notes(&project, "Newer work".into(), "Next".into())
        .unwrap();
    let before = fs::read(store.directory.join("projects.json")).unwrap();
    assert!(
        store
            .set_notes(&project, "Stale".into(), "".into())
            .is_err()
    );
    assert!(
        store
            .set_notes(&saved, "a".repeat(10_001), "".into())
            .is_err()
    );
    assert!(
        store
            .set_notes(&saved, "".into(), "😀".repeat(5_001))
            .is_err()
    );
    assert_eq!(
        fs::read(store.directory.join("projects.json")).unwrap(),
        before
    );
    store.remove(&saved).unwrap();
    assert!(
        store
            .set_notes(&saved, "Resurrected".into(), "".into())
            .is_err()
    );
}

#[test]
fn note_updates_do_not_affect_other_projects_or_require_the_folder_to_exist() {
    let root = tempdir().unwrap();
    let folder = root.path().join("folder");
    fs::create_dir(&folder).unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let first = store.add("First", &folder).unwrap();
    let second = store.add("Second", root.path()).unwrap();
    fs::remove_dir(folder).unwrap();
    let updated = store
        .set_notes(&first, "Recover this work".into(), "Locate folder".into())
        .unwrap();
    assert_eq!(store.list().unwrap(), vec![updated, second]);
}

#[test]
fn corrupt_notes_and_invalid_timestamps_are_reported_without_overwriting() {
    let root = tempdir().unwrap();
    let store = ProjectStore::new(root.path().join("data"));
    let project = store.add("Project", root.path()).unwrap();
    let file = store.directory.join("projects.json");
    let original = fs::read(&file).unwrap();
    for notes in [
        serde_json::json!({"lastWork":"x"}),
        serde_json::json!({"lastWork":"", "nextTask":"", "updatedAt":8_640_000_000_000_001u64}),
    ] {
        let mut json: serde_json::Value = serde_json::from_slice(&original).unwrap();
        json["projects"][0]["notes"] = notes;
        let bytes = serde_json::to_vec(&json).unwrap();
        fs::write(&file, &bytes).unwrap();
        assert!(store.list().is_err());
        assert!(
            store
                .set_notes(&project, "Replacement".into(), "".into())
                .is_err()
        );
        assert_eq!(fs::read(&file).unwrap(), bytes);
    }
}
