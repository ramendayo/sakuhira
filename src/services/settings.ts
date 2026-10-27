import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Settings } from "../types/settings";

function requireDesktop() {
  if (!isTauri()) throw new Error("アプリ設定はデスクトップアプリで利用できます。");
}

export async function getSettings(): Promise<Settings> {
  requireDesktop();
  return invoke<Settings>("get_settings");
}

export async function saveSettings(expected: Settings, settings: Settings): Promise<Settings> {
  requireDesktop();
  return invoke<Settings>("save_settings", { expected, settings });
}

export async function applyTheme(): Promise<void> {
  if (isTauri()) await invoke<void>("apply_theme");
}
