use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::ErrorKind,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    #[serde(default, rename = "launchUrl")]
    pub launch_url: Option<String>,
    #[serde(default)]
    pub notes: ProjectNotes,
    #[serde(default, rename = "lastResumedAt")]
    pub last_resumed_at: Option<u64>,
    #[serde(default, skip_serializing_if = "ProjectIcon::is_auto")]
    pub icon: ProjectIcon,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "camelCase", deny_unknown_fields)]
pub enum ProjectIcon {
    #[default]
    Auto,
    Custom {
        shape: IconShape,
        color: IconColor,
    },
}

impl ProjectIcon {
    fn is_auto(&self) -> bool {
        matches!(self, Self::Auto)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum IconShape {
    Folder,
    Link,
    Code,
    Browser,
    Note,
    Terminal,
    Flask,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum IconColor {
    Blue,
    Green,
    Amber,
    Purple,
    Gray,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectNotes {
    pub last_work: String,
    pub next_task: String,
    pub updated_at: Option<u64>,
}

fn validate_notes(notes: &ProjectNotes) -> Result<(), String> {
    if notes.last_work.encode_utf16().count() > 10_000
        || notes.next_task.encode_utf16().count() > 10_000
    {
        return Err("作業メモは各欄10,000文字以内で入力してください。".into());
    }
    // UIのDateで表示できる範囲に制限し、不正な日時を正常な保存情報として扱わない。
    if notes
        .updated_at
        .is_some_and(|timestamp| timestamp > 8_640_000_000_000_000)
    {
        return Err("作業メモの更新日時が不正です。".into());
    }
    Ok(())
}

fn current_timestamp() -> Result<u64, String> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("日時を取得できません: {error}"))?
        .as_millis();
    let timestamp =
        u64::try_from(millis).map_err(|error| format!("日時を保存できません: {error}"))?;
    validate_resumed_at(Some(timestamp))?;
    Ok(timestamp)
}

fn validate_resumed_at(timestamp: Option<u64>) -> Result<(), String> {
    if timestamp.is_some_and(|value| value > 8_640_000_000_000_000) {
        return Err("最終再開日時が不正です。".into());
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectDocument {
    version: u32,
    projects: Vec<Project>,
}

#[derive(Clone)]
pub struct ProjectStore {
    directory: PathBuf,
}

pub fn directory_path(path: &Path) -> Result<String, String> {
    if !path.is_absolute() {
        return Err("フォルダは絶対パスで指定してください。".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("フォルダを確認できません: {error}"))?;
    if !canonical.is_dir() {
        return Err("プロジェクトにはフォルダを指定してください。".into());
    }
    canonical
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "このフォルダのパスは文字列として扱えません。".into())
}

fn project_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err("プロジェクト名は1〜100文字で入力してください。".into());
    }
    Ok(name.into())
}

fn validate_launch_target(path: Option<&str>, url: Option<&str>) -> Result<(), String> {
    if path.is_none() && url.is_none() {
        return Err("フォルダまたは起動URLを設定してください。".into());
    }
    Ok(())
}

fn matching_project(projects: &[Project], expected: &Project) -> Result<usize, String> {
    let index = projects
        .iter()
        .position(|project| project.id == expected.id)
        .ok_or("このプロジェクトはすでに登録解除されています。一覧を再読み込みしてください。")?;
    // 再開履歴だけの更新は、編集中の設定やメモの保存を妨げない。
    let mut expected = expected.clone();
    expected.last_resumed_at = projects[index].last_resumed_at;
    if projects[index] != expected {
        return Err(
            "このプロジェクトは別の操作で更新されています。一覧を再読み込みしてください。".into(),
        );
    }
    Ok(index)
}

impl ProjectStore {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    // 別ウィンドウ・別プロセスの登録も、読み取りから保存まで直列化する。
    fn lock(&self) -> Result<File, String> {
        crate::storage::lock(&self.directory, "projects.lock")
    }

    fn read(&self) -> Result<ProjectDocument, String> {
        let bytes = match fs::read(self.directory.join("projects.json")) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == ErrorKind::NotFound => {
                return Ok(ProjectDocument {
                    version: 1,
                    projects: vec![],
                });
            }
            Err(error) => return Err(format!("プロジェクトを読み込めません: {error}")),
        };
        let document: ProjectDocument = serde_json::from_slice(&bytes).map_err(|error| {
            format!("保存データの形式が不正です。既存ファイルは変更しません: {error}")
        })?;
        if document.version != 1 {
            return Err("この保存データのバージョンには対応していません。".into());
        }
        let mut ids = HashSet::new();
        let mut paths = HashSet::new();
        for project in &document.projects {
            let launch_url = crate::launch::normalize_url(project.launch_url.as_deref())?;
            validate_launch_target(project.path.as_deref(), launch_url.as_deref())?;
            validate_notes(&project.notes)?;
            validate_resumed_at(project.last_resumed_at)?;
            // 登録後に削除・移動されたフォルダでも、保存済み情報は読み込む。
            if Uuid::parse_str(&project.id).is_err()
                || project.name.trim().is_empty()
                || project.name.chars().count() > 100
                || project
                    .path
                    .as_ref()
                    .is_some_and(|path| !Path::new(path).is_absolute() || !paths.insert(path))
                || !ids.insert(&project.id)
            {
                return Err(
                    "保存データに不正なプロジェクト情報があります。既存ファイルは変更しません。"
                        .into(),
                );
            }
        }
        Ok(document)
    }

    pub fn list(&self) -> Result<Vec<Project>, String> {
        let _lock = self.lock()?;
        Ok(self.read()?.projects)
    }

    fn change<T>(
        &self,
        operation: impl FnOnce(&mut Vec<Project>) -> Result<T, String>,
    ) -> Result<T, String> {
        let _lock = self.lock()?;
        let mut document = self.read()?;
        let result = operation(&mut document.projects)?;
        self.write(&document)?;
        Ok(result)
    }

    pub fn add(
        &self,
        name: &str,
        path: Option<&Path>,
        launch_url: Option<&str>,
    ) -> Result<Project, String> {
        let name = project_name(name)?;
        let path = path.map(directory_path).transpose()?;
        let launch_url = crate::launch::normalize_url(launch_url)?;
        validate_launch_target(path.as_deref(), launch_url.as_deref())?;
        self.change(|projects| {
            if path.is_some() && projects.iter().any(|project| project.path == path) {
                return Err("このフォルダはすでに登録されています。".into());
            }
            let project = Project {
                id: Uuid::new_v4().to_string(),
                name,
                path,
                launch_url,
                notes: ProjectNotes::default(),
                last_resumed_at: None,
                icon: ProjectIcon::Auto,
            };
            projects.push(project.clone());
            Ok(project)
        })
    }

    pub fn update(
        &self,
        expected: &Project,
        name: &str,
        path: Option<&Path>,
        icon: Option<ProjectIcon>,
    ) -> Result<Project, String> {
        let name = project_name(name)?;
        self.change(|projects| {
            let index = matching_project(projects, expected)?;
            // フォルダが移動・削除済みでも、パスを変えない名前の編集は許可する。
            let path = if path == projects[index].path.as_deref().map(Path::new) {
                projects[index].path.clone()
            } else {
                path.map(directory_path).transpose()?
            };
            validate_launch_target(path.as_deref(), projects[index].launch_url.as_deref())?;
            if projects
                .iter()
                .any(|project| path.is_some() && project.id != expected.id && project.path == path)
            {
                return Err("このフォルダはすでに登録されています。".into());
            }
            let project = Project {
                id: expected.id.clone(),
                name,
                path,
                launch_url: expected.launch_url.clone(),
                notes: expected.notes.clone(),
                last_resumed_at: projects[index].last_resumed_at,
                icon: icon.unwrap_or(expected.icon),
            };
            projects[index] = project.clone();
            Ok(project)
        })
    }

    pub fn remove(&self, expected: &Project) -> Result<(), String> {
        self.change(|projects| {
            let index = matching_project(projects, expected)?;
            projects.remove(index);
            Ok(())
        })
    }

    pub fn get_matching(&self, expected: &Project) -> Result<Project, String> {
        let _lock = self.lock()?;
        let document = self.read()?;
        let index = matching_project(&document.projects, expected)?;
        Ok(document.projects[index].clone())
    }

    pub fn set_launch_url(&self, expected: &Project, url: Option<&str>) -> Result<Project, String> {
        let url = crate::launch::normalize_url(url)?;
        self.change(|projects| {
            let index = matching_project(projects, expected)?;
            validate_launch_target(projects[index].path.as_deref(), url.as_deref())?;
            projects[index].launch_url = url;
            Ok(projects[index].clone())
        })
    }

    pub fn set_notes(
        &self,
        expected: &Project,
        last_work: String,
        next_task: String,
    ) -> Result<Project, String> {
        let mut notes = ProjectNotes {
            last_work,
            next_task,
            updated_at: None,
        };
        validate_notes(&notes)?;
        self.change(|projects| {
            let index = matching_project(projects, expected)?;
            if projects[index].notes.updated_at.is_none()
                || projects[index].notes.last_work != notes.last_work
                || projects[index].notes.next_task != notes.next_task
            {
                notes.updated_at = Some(current_timestamp()?);
                validate_notes(&notes)?;
                projects[index].notes = notes;
            }
            Ok(projects[index].clone())
        })
    }

    pub fn record_resume(&self, expected: &Project) -> Result<u64, String> {
        self.change(|projects| {
            let index = matching_project(projects, expected)?;
            let timestamp = current_timestamp()?.max(projects[index].last_resumed_at.unwrap_or(0));
            projects[index].last_resumed_at = Some(timestamp);
            Ok(timestamp)
        })
    }

    fn write(&self, document: &ProjectDocument) -> Result<(), String> {
        crate::storage::write_json(&self.directory, "projects.json", document)
    }
}

#[cfg(test)]
mod tests;
