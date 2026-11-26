import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

export async function saveSettingsWithShortcut(expected: Settings, settings: Settings): Promise<Settings> {
  requireDesktop();
  return invoke<Settings>("save_settings_with_shortcut", { expected, settings });
}

export function quickResumeSaveError(error: unknown): string | null {
  if (typeof error === "object" && error !== null &&
    "field" in error && error.field === "quickResumeShortcut" &&
    "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return null;
}

export async function applyTheme(): Promise<void> {
  if (isTauri()) await invoke<void>("apply_theme");
}

export function getLaunchAtLogin(): Promise<boolean> {
  return invoke<boolean>("get_launch_at_login");
}

export function setLaunchAtLogin(enabled: boolean): Promise<boolean> {
  return invoke<boolean>("set_launch_at_login", { enabled });
}

// Also fires when the menu bar changes it, so the settings page never shows a stale state.
export function onLaunchAtLoginChanged(handler: (enabled: boolean) => void) {
  return listen<boolean>("launch-at-login-changed", ({ payload }) => handler(payload));
}
