use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::Path,
};
use tempfile::NamedTempFile;

pub fn lock(directory: &Path, name: &str) -> Result<File, String> {
    fs::create_dir_all(directory).map_err(|error| format!("保存先を作成できません: {error}"))?;
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(directory.join(name))
        .map_err(|error| format!("保存先を開けません: {error}"))?;
    file.lock()
        .map_err(|error| format!("保存先をロックできません: {error}"))?;
    Ok(file)
}

pub fn write_json(directory: &Path, name: &str, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("保存データを生成できません: {error}"))?;
    // 同じディレクトリ内で完成させてから置き換え、途中のJSONを公開しない。
    let mut temporary = NamedTempFile::new_in(directory)
        .map_err(|error| format!("一時ファイルを作成できません: {error}"))?;
    temporary
        .write_all(&bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("保存データを書き込めません: {error}"))?;
    temporary
        .persist(directory.join(name))
        .map_err(|error| format!("保存ファイルを置き換えられません: {error}"))?;
    Ok(())
}
