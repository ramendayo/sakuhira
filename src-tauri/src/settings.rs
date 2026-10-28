use serde::{Deserialize, Serialize};
use std::{fs, io::ErrorKind, path::PathBuf};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Editor {
    #[default]
    VsCode,
    Cursor,
}

impl Editor {
    pub fn name(self) -> &'static str {
        match self {
            Self::VsCode => "VS Code",
            Self::Cursor => "Cursor",
        }
    }

    #[cfg(any(target_os = "macos", test))]
    pub fn macos_target(self) -> (&'static str, &'static str) {
        match self {
            Self::VsCode => ("-b", "com.microsoft.VSCode"),
            Self::Cursor => ("-a", "Cursor"),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub default_editor: Editor,
    #[serde(default = "legacy_theme")]
    pub theme: ThemePreference,
    #[serde(default)]
    pub project_view: ProjectView,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectView {
    pub layout: ProjectLayout,
    pub card_size: CardSize,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectLayout {
    #[default]
    Cards,
    List,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CardSize {
    Small,
    #[default]
    Standard,
    Large,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ThemePreference {
    Light,
    Dark,
    #[default]
    System,
}

fn legacy_theme() -> ThemePreference {
    ThemePreference::Light
}

impl ThemePreference {
    pub fn native_theme(self) -> Option<tauri::Theme> {
        match self {
            Self::Light => Some(tauri::Theme::Light),
            Self::Dark => Some(tauri::Theme::Dark),
            Self::System => None,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SettingsDocument {
    version: u32,
    settings: Settings,
}

pub struct SettingsStore {
    directory: PathBuf,
}

impl SettingsStore {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    fn read(&self) -> Result<Settings, String> {
        let bytes = match fs::read(self.directory.join("settings.json")) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Settings::default()),
            Err(error) => return Err(format!("アプリ設定を読み込めません: {error}")),
        };
        let document: SettingsDocument = serde_json::from_slice(&bytes).map_err(|error| {
            format!("アプリ設定の形式が不正です。既存ファイルは変更しません: {error}")
        })?;
        if document.version != 1 {
            return Err("このアプリ設定のバージョンには対応していません。".into());
        }
        Ok(document.settings)
    }

    pub fn load(&self) -> Result<Settings, String> {
        let _lock = crate::storage::lock(&self.directory, "settings.lock")?;
        self.read()
    }

    pub fn save(&self, expected: &Settings, settings: Settings) -> Result<Settings, String> {
        let _lock = crate::storage::lock(&self.directory, "settings.lock")?;
        if self.read()? != *expected {
            return Err(
                "アプリ設定は別の操作で更新されています。再読み込みして確認してください。".into(),
            );
        }
        crate::storage::write_json(
            &self.directory,
            "settings.json",
            &SettingsDocument {
                version: 1,
                settings: settings.clone(),
            },
        )?;
        Ok(settings)
    }
}

#[cfg(test)]
mod tests;
