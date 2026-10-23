use super::*;
use git2::{RepositoryInitOptions, Signature};
use std::{collections::BTreeMap, fs, path::PathBuf};
use tempfile::tempdir;

fn init(path: &Path) -> Repository {
    Repository::init_opts(path, RepositoryInitOptions::new().initial_head("main")).unwrap()
}

// 履歴が必要なケースの準備は、一時ディレクトリ内のリポジトリだけで行う。
fn fixture_commit(repository: &Repository) -> git2::Oid {
    let folder = repository.workdir().unwrap();
    fs::write(folder.join("tracked.txt"), "tracked original\n").unwrap();
    fs::write(folder.join("removed.txt"), "removed original\n").unwrap();
    fs::write(folder.join(".gitignore"), "ignored/\n").unwrap();
    let mut index = repository.index().unwrap();
    for path in ["tracked.txt", "removed.txt", ".gitignore"] {
        index.add_path(Path::new(path)).unwrap();
    }
    index.write().unwrap();
    let tree = repository.find_tree(index.write_tree().unwrap()).unwrap();
    let signature = Signature::now("Reentry test", "test@example.invalid").unwrap();
    repository
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            "test fixture",
            &tree,
            &[],
        )
        .unwrap()
}

fn snapshot(folder: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut result = BTreeMap::new();
    for entry in fs::read_dir(folder).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            result.extend(snapshot(&path));
        } else {
            result.insert(path.clone(), fs::read(path).unwrap());
        }
    }
    result
}

fn repository_status(path: &Path) -> (GitHead, usize, String) {
    match read(path).unwrap() {
        GitStatus::Repository {
            head,
            changed_files,
            root_path,
        } => (head, changed_files, root_path),
        GitStatus::NotRepository => panic!("expected a repository"),
    }
}

#[test]
fn ordinary_directory_is_not_a_repository() {
    let root = tempdir().unwrap();
    assert_eq!(read(root.path()).unwrap(), GitStatus::NotRepository);
}

#[test]
fn missing_path_and_file_are_errors() {
    let root = tempdir().unwrap();
    assert!(read(&root.path().join("missing")).is_err());
    let file = root.path().join("file");
    fs::write(&file, "file").unwrap();
    assert!(read(&file).is_err());
}

#[test]
fn unborn_branch_reports_name_and_untracked_files() {
    let root = tempdir().unwrap();
    let _repository = init(root.path());
    fs::write(root.path().join("first.txt"), "first").unwrap();
    let (head, count, _) = repository_status(root.path());
    assert_eq!(
        head,
        GitHead::Branch {
            name: "main".into(),
            unborn: true
        }
    );
    assert_eq!(count, 1);
}

#[test]
fn clean_repository_has_no_changes_and_is_not_modified_by_reading() {
    let root = tempdir().unwrap();
    let repository = init(root.path());
    fixture_commit(&repository);
    let before = snapshot(root.path());
    let (head, count, _) = repository_status(root.path());
    assert_eq!(
        head,
        GitHead::Branch {
            name: "main".into(),
            unborn: false
        }
    );
    assert_eq!(count, 0);
    assert_eq!(snapshot(root.path()), before);
}

#[test]
fn counts_each_changed_file_once_and_excludes_ignored_files() {
    let root = tempdir().unwrap();
    let repository = init(root.path());
    fixture_commit(&repository);
    fs::write(root.path().join("tracked.txt"), "staged version\n").unwrap();
    let mut index = repository.index().unwrap();
    index.add_path(Path::new("tracked.txt")).unwrap();
    index.write().unwrap();
    fs::write(root.path().join("tracked.txt"), "staged and unstaged\n").unwrap();
    fs::remove_file(root.path().join("removed.txt")).unwrap();
    fs::create_dir(root.path().join("new")).unwrap();
    fs::write(root.path().join("new/one.txt"), "one\n").unwrap();
    fs::write(root.path().join("new/two.txt"), "two\n").unwrap();
    fs::create_dir(root.path().join("ignored")).unwrap();
    fs::write(root.path().join("ignored/file"), "ignored\n").unwrap();
    let before = snapshot(root.path());
    assert_eq!(repository_status(root.path()).1, 4);
    assert_eq!(snapshot(root.path()), before);
}

#[test]
fn staged_rename_is_counted_as_one_file() {
    let root = tempdir().unwrap();
    let repository = init(root.path());
    fixture_commit(&repository);
    fs::rename(
        root.path().join("tracked.txt"),
        root.path().join("renamed.txt"),
    )
    .unwrap();
    let mut index = repository.index().unwrap();
    index.remove_path(Path::new("tracked.txt")).unwrap();
    index.add_path(Path::new("renamed.txt")).unwrap();
    index.write().unwrap();
    assert_eq!(repository_status(root.path()).1, 1);
}

#[test]
fn detached_head_reports_commit_without_switching_back() {
    let root = tempdir().unwrap();
    let repository = init(root.path());
    let commit = fixture_commit(&repository);
    repository.set_head_detached(commit).unwrap();
    let before = snapshot(root.path());
    assert_eq!(
        repository_status(root.path()).0,
        GitHead::Detached {
            commit: commit.to_string()
        }
    );
    assert!(repository.head_detached().unwrap());
    assert_eq!(snapshot(root.path()), before);
}

#[test]
fn subdirectory_reports_the_whole_containing_repository() {
    let root = tempdir().unwrap();
    let repository = init(root.path());
    fixture_commit(&repository);
    let child = root.path().join("child");
    fs::create_dir(&child).unwrap();
    fs::write(root.path().join("outside-child.txt"), "outside").unwrap();
    let (_, count, repository_root) = repository_status(&child);
    assert_eq!(count, 1);
    assert_eq!(Path::new(&repository_root), repository.workdir().unwrap());
}

#[test]
fn linked_worktree_is_supported() {
    let root = tempdir().unwrap();
    let main = root.path().join("main");
    let repository = init(&main);
    fixture_commit(&repository);
    let linked = root.path().join("linked");
    repository.worktree("linked", &linked, None).unwrap();
    let (head, count, _) = repository_status(&linked);
    assert_eq!(
        head,
        GitHead::Branch {
            name: "linked".into(),
            unborn: false
        }
    );
    assert_eq!(count, 0);
}

#[test]
fn bare_repository_is_reported_as_unsupported() {
    let root = tempdir().unwrap();
    Repository::init_bare(root.path()).unwrap();
    assert!(read(root.path()).unwrap_err().contains("bare"));
}

#[test]
fn status_serialization_matches_the_frontend_contract() {
    let status = GitStatus::Repository {
        head: GitHead::Branch {
            name: "main".into(),
            unborn: false,
        },
        changed_files: 2,
        root_path: "/example".into(),
    };
    assert_eq!(
        serde_json::to_value(status).unwrap(),
        serde_json::json!({
            "kind": "repository", "head": { "kind": "branch", "name": "main", "unborn": false },
            "changedFiles": 2, "rootPath": "/example"
        })
    );
    assert_eq!(
        serde_json::to_value(GitStatus::NotRepository).unwrap(),
        serde_json::json!({"kind":"notRepository"})
    );
}

#[test]
fn malformed_git_metadata_is_an_error() {
    let root = tempdir().unwrap();
    fs::write(
        root.path().join(".git"),
        "gitdir: /does-not-exist/reentry-test\n",
    )
    .unwrap();
    assert!(read(root.path()).is_err());
}

#[test]
fn broken_nested_git_metadata_does_not_fall_back_to_parent_repository() {
    let root = tempdir().unwrap();
    let _repository = init(root.path());
    let child = root.path().join("child");
    fs::create_dir(&child).unwrap();
    fs::create_dir(child.join(".git")).unwrap();
    assert!(read(&child).is_err());
}
