use git2::{ErrorCode, Repository, RepositoryOpenFlags, StatusOptions};
use serde::Serialize;
use std::{fs, io::ErrorKind, path::Path};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitHead {
    Branch { name: String, unborn: bool },
    Detached { commit: String },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum GitStatus {
    NotRepository,
    Repository {
        head: GitHead,
        changed_files: usize,
        root_path: String,
    },
}

pub fn read(path: &Path) -> Result<GitStatus, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("プロジェクトフォルダを確認できません: {error}"))?;
    if !metadata.is_dir() {
        return Err("登録先がフォルダではありません。プロジェクト設定を確認してください。".into());
    }
    let path = path
        .canonicalize()
        .map_err(|error| format!("フォルダのパスを確認できません: {error}"))?;
    let Some(repository) = discover(&path)? else {
        return Ok(GitStatus::NotRepository);
    };
    let root_path = repository
        .workdir()
        .ok_or("作業フォルダのないbareリポジトリには対応していません。")?
        .to_str()
        .ok_or("Gitの作業フォルダのパスを文字列として扱えません。")?
        .to_owned();
    let head = match repository.head() {
        Ok(head) if repository.head_detached().map_err(git_error)? => GitHead::Detached {
            commit: head.peel_to_commit().map_err(git_error)?.id().to_string(),
        },
        Ok(head) => GitHead::Branch {
            name: head.shorthand().map_err(git_error)?.to_owned(),
            unborn: false,
        },
        Err(error) if error.code() == ErrorCode::UnbornBranch => {
            let head = repository.find_reference("HEAD").map_err(git_error)?;
            let name = head
                .symbolic_target()
                .map_err(git_error)?
                .and_then(|target| target.strip_prefix("refs/heads/"))
                .ok_or("初回コミット前のブランチ名を読み込めません。")?;
            GitHead::Branch {
                name: name.into(),
                unborn: true,
            }
        }
        Err(error) => return Err(git_error(error)),
    };
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .include_unmodified(false)
        .include_unreadable(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        // 読み取り専用の表示なので、statキャッシュをインデックスへ書き戻さない。
        .update_index(false);
    let statuses = repository.statuses(Some(&mut options)).map_err(git_error)?;
    Ok(GitStatus::Repository {
        head,
        changed_files: statuses.len(),
        root_path,
    })
}

fn discover(path: &Path) -> Result<Option<Repository>, String> {
    for directory in path.ancestors() {
        let has_marker = match fs::symlink_metadata(directory.join(".git")) {
            Ok(_) => true,
            Err(error) if error.kind() == ErrorKind::NotFound => false,
            Err(error) => return Err(format!("Git管理情報を確認できません: {error}")),
        };
        // 壊れた.gitを飛ばして親リポジトリの状態を表示しないよう、各階層を明示的に開く。
        match Repository::open_ext(
            directory,
            RepositoryOpenFlags::NO_SEARCH,
            std::iter::empty::<&Path>(),
        ) {
            Ok(repository) => return Ok(Some(repository)),
            Err(error) if !has_marker && error.code() == ErrorCode::NotFound => continue,
            Err(error) => return Err(git_error(error)),
        }
    }
    Ok(None)
}

fn git_error(error: git2::Error) -> String {
    format!("Gitの状態を取得できません: {error}")
}

#[cfg(test)]
mod tests;
