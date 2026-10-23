use super::*;
use tempfile::tempdir;

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
