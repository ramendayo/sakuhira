use super::*;
use std::{cell::Cell, fs};
use tempfile::tempdir;

fn project(path: &Path, url: Option<&str>) -> Project {
    Project {
        id: "fixture".into(),
        name: "Fixture".into(),
        path: path.to_str().unwrap().into(),
        launch_url: url.map(str::to_owned),
        notes: Default::default(),
    }
}

#[test]
fn accepts_http_https_localhost_and_optional_urls() {
    assert_eq!(normalize_url(None).unwrap(), None);
    assert_eq!(normalize_url(Some("  ")).unwrap(), None);
    assert_eq!(
        normalize_url(Some(" HTTPS://Example.com ")).unwrap(),
        Some("https://example.com/".into())
    );
    assert_eq!(
        normalize_url(Some("http://localhost:3000/path?q=test#section")).unwrap(),
        Some("http://localhost:3000/path?q=test#section".into())
    );
}

#[test]
fn rejects_other_schemes_malformed_urls_and_credentials() {
    for value in [
        "file:///tmp/test",
        "javascript:alert(1)",
        "data:text/html,test",
        "vscode://file/tmp",
        "ftp://host",
        "//host",
        "localhost:3000",
        "http:host",
        "https://",
        "https://example.com/a\nb",
        "https://example.com/a b",
        "https://user:secret@example.com",
        "https://example.com/\u{0000}",
    ] {
        assert!(normalize_url(Some(value)).is_err(), "accepted {value:?}");
    }
    assert!(normalize_url(Some(&format!("https://example.com/{}", "a".repeat(4096)))).is_err());
}

#[test]
fn sends_canonical_folder_and_url_to_separate_launchers() {
    let root = tempdir().unwrap();
    let folder = root.path().join("folder with spaces; $(touch nope)");
    fs::create_dir(&folder).unwrap();
    let project = project(&folder, Some("https://example.com"));
    let report = resume_with(
        &project,
        Editor::VsCode,
        |path| {
            assert_eq!(path, directory_path(&folder).unwrap());
            Ok(())
        },
        |url| {
            assert_eq!(url, "https://example.com/");
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(
        report,
        ResumeReport {
            editor_name: "VS Code".into(),
            editor: LaunchOutcome::Success,
            browser: Some(LaunchOutcome::Success)
        }
    );
    assert_eq!(fs::read_dir(&folder).unwrap().count(), 0);
}

#[test]
fn missing_folder_and_invalid_url_do_not_start_anything() {
    let root = tempdir().unwrap();
    let called = Cell::new(false);
    for project in [
        project(&root.path().join("missing"), Some("https://example.com")),
        project(root.path(), Some("file:///tmp")),
    ] {
        assert!(
            resume_with(
                &project,
                Editor::VsCode,
                |_| {
                    called.set(true);
                    Ok(())
                },
                |_| {
                    called.set(true);
                    Ok(())
                }
            )
            .is_err()
        );
        assert!(!called.get());
    }
}

#[test]
fn editor_failure_does_not_skip_browser_and_partial_failures_are_preserved() {
    let root = tempdir().unwrap();
    let browser_called = Cell::new(false);
    let report = resume_with(
        &project(root.path(), Some("http://localhost:3000")),
        Editor::VsCode,
        |_| Err("VS Code is missing".into()),
        |_| {
            browser_called.set(true);
            Ok(())
        },
    )
    .unwrap();
    assert!(browser_called.get());
    assert!(matches!(report.editor, LaunchOutcome::Error { .. }));
    assert_eq!(report.browser, Some(LaunchOutcome::Success));
    let report = resume_with(
        &project(root.path(), Some("http://localhost:3000")),
        Editor::VsCode,
        |_| Ok(()),
        |_| Err("Browser failed".into()),
    )
    .unwrap();
    assert_eq!(report.editor, LaunchOutcome::Success);
    assert!(matches!(report.browser, Some(LaunchOutcome::Error { .. })));
}

#[test]
fn no_url_skips_browser_and_report_matches_frontend_contract() {
    let root = tempdir().unwrap();
    let report = resume_with(
        &project(root.path(), None),
        Editor::VsCode,
        |_| Ok(()),
        |_| panic!("browser should not run"),
    )
    .unwrap();
    assert_eq!(
        serde_json::to_value(report).unwrap(),
        serde_json::json!({ "editorName": "VS Code", "editor": { "status": "success" }, "browser": null })
    );
    assert_eq!(
        serde_json::to_value(LaunchOutcome::Error {
            message: "failed".into()
        })
        .unwrap(),
        serde_json::json!({"status":"error","message":"failed"})
    );
}

#[test]
fn encoded_url_length_is_checked_before_persisting() {
    let input = format!("https://example.com/{}", "日".repeat(500));
    assert!(input.len() < 4096);
    assert!(normalize_url(Some(&input)).is_err());
}

#[test]
fn selected_editor_is_invoked_and_named_in_the_report() {
    let root = tempdir().unwrap();
    let report = resume_with(
        &project(root.path(), None),
        Editor::Cursor,
        |_| Ok(()),
        |_| panic!("no browser"),
    )
    .unwrap();
    assert_eq!(report.editor_name, "Cursor");
    assert_eq!(report.editor, LaunchOutcome::Success);
}
