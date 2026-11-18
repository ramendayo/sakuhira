use super::*;
use std::{cell::Cell, fs};
use tempfile::tempdir;

fn resume_with(
    project: &Project,
    selected: Editor,
    editor: impl FnOnce(&str) -> Result<(), String>,
    browser: impl FnOnce(&str) -> Result<(), String>,
) -> Result<ResumeReport, String> {
    resume_with_apps(project, selected, editor, browser, |_| unreachable!())
}

fn project(path: &Path, url: Option<&str>) -> Project {
    Project {
        id: "fixture".into(),
        name: "Fixture".into(),
        path: Some(path.to_str().unwrap().into()),
        launch_url: url.map(str::to_owned),
        app_launch_targets: Vec::new(),
        notes: Default::default(),
        last_resumed_at: None,
        icon: Default::default(),
        shortcut: None,
    }
}

#[test]
fn url_only_resume_skips_editor_and_records_only_successful_browser_launches() {
    let root = tempdir().unwrap();
    let store = crate::projects::ProjectStore::new(root.path().join("data"));
    let web = store
        .add("Docs", None, Some("https://example.com"))
        .unwrap();
    let failed = resume_with(
        &web,
        Editor::VsCode,
        |_| panic!("editor must not run"),
        |_| Err("browser unavailable".into()),
    )
    .unwrap();
    let report = record_history(&store, &web, failed);
    assert_eq!(report.editor, None);
    assert_eq!(report.history, ResumeHistory::Skipped);
    assert_eq!(store.list().unwrap()[0].last_resumed_at, None);
    let launched = resume_with(
        &web,
        Editor::VsCode,
        |_| panic!("editor must not run"),
        |url| {
            assert_eq!(url, "https://example.com/");
            Ok(())
        },
    )
    .unwrap();
    let report = record_history(&store, &web, launched);
    assert_eq!(report.editor, None);
    assert_eq!(report.browser, Some(LaunchOutcome::Success));
    let ResumeHistory::Saved { timestamp } = report.history else {
        panic!("history not saved")
    };
    assert_eq!(store.list().unwrap()[0].last_resumed_at, Some(timestamp));
    let mut invalid = web;
    invalid.launch_url = None;
    assert!(
        resume_with(
            &invalid,
            Editor::VsCode,
            |_| panic!("editor must not run"),
            |_| panic!("browser must not run")
        )
        .is_err()
    );
    invalid.launch_url = Some("file:///tmp".into());
    assert!(
        resume_with(
            &invalid,
            Editor::VsCode,
            |_| panic!("editor must not run"),
            |_| panic!("browser must not run")
        )
        .is_err()
    );
}

#[test]
fn history_is_recorded_only_for_editor_success_and_keeps_partial_launch_results() {
    let root = tempdir().unwrap();
    let store = crate::projects::ProjectStore::new(root.path().join("data"));
    let project = store.add("Example", Some(root.path()), None).unwrap();
    let failed = resume_with(
        &project,
        Editor::VsCode,
        |_| Err("missing editor".into()),
        |_| Ok(()),
    )
    .unwrap();
    assert_eq!(
        record_history(&store, &project, failed).history,
        ResumeHistory::Skipped
    );
    assert_eq!(store.list().unwrap()[0].last_resumed_at, None);

    let mut configured = store
        .set_launch_url(&project, Some("https://example.com/"))
        .unwrap();
    let partial = resume_with(
        &configured,
        Editor::VsCode,
        |_| Ok(()),
        |_| Err("browser failed".into()),
    )
    .unwrap();
    let saved = record_history(&store, &configured, partial);
    let ResumeHistory::Saved { timestamp } = saved.history else {
        panic!("history was not saved")
    };
    assert_eq!(store.list().unwrap()[0].last_resumed_at, Some(timestamp));
    assert_eq!(
        saved.browser,
        Some(LaunchOutcome::Error {
            message: "browser failed".into()
        })
    );

    // 起動中に別操作で更新された設定を、履歴保存で巻き戻さない。
    configured = store
        .update(&configured, "New name", Some(root.path()), None)
        .unwrap();
    let launched = resume_with(&project, Editor::VsCode, |_| Ok(()), |_| Ok(())).unwrap();
    let report = record_history(&store, &project, launched);
    assert_eq!(report.editor, Some(LaunchOutcome::Success));
    assert!(matches!(report.history, ResumeHistory::Error { .. }));
    assert_eq!(store.list().unwrap()[0], configured);
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
            editor: Some(LaunchOutcome::Success),
            browser: Some(LaunchOutcome::Success),
            apps: Vec::new(),
            history: ResumeHistory::Skipped,
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
    assert!(matches!(report.editor, Some(LaunchOutcome::Error { .. })));
    assert_eq!(report.browser, Some(LaunchOutcome::Success));
    let report = resume_with(
        &project(root.path(), Some("http://localhost:3000")),
        Editor::VsCode,
        |_| Ok(()),
        |_| Err("Browser failed".into()),
    )
    .unwrap();
    assert_eq!(report.editor, Some(LaunchOutcome::Success));
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
        serde_json::json!({ "editorName": "VS Code", "editor": { "status": "success" }, "browser": null, "history": { "status": "skipped" } })
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
    assert_eq!(report.editor, Some(LaunchOutcome::Success));
}

#[test]
fn app_targets_continue_after_missing_paths_and_os_rejections() {
    let root = tempdir().unwrap();
    let app = preview_app(root.path());
    let denied = root.path().join("denied.pdf");
    let document = root.path().join("仕様書.pdf");
    fs::write(&denied, "").unwrap();
    fs::write(&document, "").unwrap();

    let target = |app: &Path, file: Option<&Path>| AppLaunchTarget {
        app_path: app.to_str().unwrap().into(),
        file_path: file.map(|path| path.to_str().unwrap().into()),
    };
    let mut project = project(root.path(), Some("https://example.com"));
    project.app_launch_targets = vec![
        target(&root.path().join("Missing.app"), None),
        target(&app, Some(&root.path().join("missing.pdf"))),
        target(&app, Some(&denied)),
        target(&app, None),
        target(&app, Some(&document)),
    ];
    let mut calls = Vec::new();
    let report = resume_with_apps(
        &project,
        Editor::VsCode,
        |_| Ok(()),
        |_| Ok(()),
        |target| {
            calls.push(target.clone());
            if target
                .file_path
                .as_deref()
                .is_some_and(|path| path.ends_with("/denied.pdf"))
            {
                return Err("起動要求が拒否されました".into());
            }
            Ok(())
        },
    )
    .unwrap();

    let canonical = |p: &Path| p.canonicalize().unwrap();
    assert_eq!(
        calls,
        [
            target(&canonical(&app), Some(&canonical(&denied))),
            target(&canonical(&app), None),
            target(&canonical(&app), Some(&canonical(&document))),
        ]
    );
    assert_eq!(report.editor, Some(LaunchOutcome::Success));
    assert_eq!(report.browser, Some(LaunchOutcome::Success));
    assert!(report.has_errors());
    assert_eq!(
        report.apps[2].outcome,
        LaunchOutcome::Error {
            message: "起動要求が拒否されました".into()
        }
    );
    for (index, result) in report.apps.iter().enumerate() {
        assert_eq!(result.target, project.app_launch_targets[index]);
        assert_eq!(result.outcome == LaunchOutcome::Success, index >= 3);
    }

    let payload = serde_json::to_value(&report).unwrap();
    assert_eq!(
        payload["apps"][4]["target"]["filePath"],
        document.to_str().unwrap()
    );
    assert_eq!(payload["apps"][4]["outcome"]["status"], "success");
}

fn preview_app(root: &Path) -> std::path::PathBuf {
    let app = root.join("Preview.app");
    fs::create_dir_all(app.join("Contents")).unwrap();
    let mut info = plist::Dictionary::new();
    info.insert("CFBundlePackageType".into(), "APPL".into());
    plist::to_file_xml(app.join("Contents/Info.plist"), &info).unwrap();
    app
}

#[test]
fn app_only_resume_opens_apps_and_files_and_records_history_after_any_success() {
    let root = tempdir().unwrap();
    let app = preview_app(root.path());
    let file = root.path().join("企画.pdf");
    fs::write(&file, "").unwrap();
    let app_path = app.to_str().unwrap().to_owned();
    let targets = vec![
        AppLaunchTarget {
            app_path: app_path.clone(),
            file_path: None,
        },
        AppLaunchTarget {
            app_path,
            file_path: Some(file.to_str().unwrap().into()),
        },
    ];

    let data = root.path().join("data");
    ProjectStore::new(data.clone())
        .add_with_options(
            "企画の壁打ち",
            None,
            None,
            Default::default(),
            None,
            targets,
        )
        .unwrap();
    let store = ProjectStore::new(data);
    let project = store.list().unwrap().pop().unwrap();
    let resume = |open_app: &mut dyn FnMut(&AppLaunchTarget) -> Result<(), String>| {
        let report = resume_with_apps(
            &project,
            Editor::VsCode,
            |_| panic!("editor must not run"),
            |_| panic!("browser must not run"),
            open_app,
        )
        .unwrap();
        record_history(&store, &project, report)
    };

    let failed = resume(&mut |_| Err("起動できません".into()));
    assert_eq!(failed.history, ResumeHistory::Skipped);
    assert_eq!(store.list().unwrap()[0].last_resumed_at, None);

    let mut calls = Vec::new();
    let resumed = resume(&mut |target| {
        calls.push(target.clone());
        if target.file_path.is_none() {
            return Err("アプリ単体では起動できません".into());
        }
        Ok(())
    });
    assert_eq!(calls, project.app_launch_targets);
    assert_eq!(resumed.editor, None);
    assert_eq!(resumed.browser, None);
    assert!(resumed.has_errors());
    assert_eq!(resumed.apps[1].outcome, LaunchOutcome::Success);
    let ResumeHistory::Saved { timestamp } = resumed.history else {
        panic!("history was not saved")
    };
    assert_eq!(store.list().unwrap()[0].last_resumed_at, Some(timestamp));
}
