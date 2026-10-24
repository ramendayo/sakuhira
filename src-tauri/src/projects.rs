use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default, rename = "launchUrl")]
    pub launch_url: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectDocument {
    version: u32,
    projects: Vec<Project>,
}

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

fn matching_project(projects: &[Project], expected: &Project) -> Result<usize, String> {
    let index = projects
        .iter()
        .position(|project| project.id == expected.id)
        .ok_or("このプロジェクトはすでに登録解除されています。一覧を再読み込みしてください。")?;
    if projects[index] != *expected {
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
        fs::create_dir_all(&self.directory)
            .map_err(|error| format!("保存先を作成できません: {error}"))?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.directory.join("projects.lock"))
            .map_err(|error| format!("保存先を開けません: {error}"))?;
        file.lock()
            .map_err(|error| format!("保存先をロックできません: {error}"))?;
        Ok(file)
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
            crate::launch::normalize_url(project.launch_url.as_deref())?;
            // 登録後に削除・移動されたフォルダでも、保存済み情報は読み込む。
            if Uuid::parse_str(&project.id).is_err()
                || project.name.trim().is_empty()
                || project.name.chars().count() > 100
                || !Path::new(&project.path).is_absolute()
                || !ids.insert(&project.id)
                || !paths.insert(&project.path)
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

    pub fn add(&self, name: &str, path: &Path) -> Result<Project, String> {
        let name = project_name(name)?;
        let path = directory_path(path)?;
        self.change(|projects| {
            if projects.iter().any(|project| project.path == path) {
                return Err("このフォルダはすでに登録されています。".into());
            }
            let project = Project {
                id: Uuid::new_v4().to_string(),
                name,
                path,
                launch_url: None,
            };
            projects.push(project.clone());
            Ok(project)
        })
    }

    pub fn update(&self, expected: &Project, name: &str, path: &Path) -> Result<Project, String> {
        let name = project_name(name)?;
        self.change(|projects| {
            let index = matching_project(projects, expected)?;
            // フォルダが移動・削除済みでも、パスを変えない名前の編集は許可する。
            let path = if path == Path::new(&projects[index].path) {
                projects[index].path.clone()
            } else {
                directory_path(path)?
            };
            if projects
                .iter()
                .any(|project| project.id != expected.id && project.path == path)
            {
                return Err("このフォルダはすでに登録されています。".into());
            }
            let project = Project {
                id: expected.id.clone(),
                name,
                path,
                launch_url: expected.launch_url.clone(),
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
            projects[index].launch_url = url;
            Ok(projects[index].clone())
        })
    }

    fn write(&self, document: &ProjectDocument) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(document)
            .map_err(|error| format!("保存データを生成できません: {error}"))?;
        // 保存先と同じディレクトリで一時ファイルを完成させ、途中のJSONを公開しない。
        let mut temporary = NamedTempFile::new_in(&self.directory)
            .map_err(|error| format!("一時ファイルを作成できません: {error}"))?;
        temporary
            .write_all(&bytes)
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|error| format!("プロジェクトを保存できません: {error}"))?;
        temporary
            .persist(self.directory.join("projects.json"))
            .map_err(|error| format!("保存ファイルを置き換えられません: {error}"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
