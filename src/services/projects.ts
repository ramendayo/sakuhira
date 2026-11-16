import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppLaunchTarget, Project, ProjectIcon, SelectedDirectory } from "../types/project";

function requireDesktop() {
  if (!isTauri()) {
    throw new Error("プロジェクトの登録・読み込みはデスクトップアプリで利用できます。npm run tauri dev で起動してください。");
  }
}

export async function listProjects(): Promise<Project[]> {
  requireDesktop();
  return invoke<Project[]>("list_projects");
}

type ProjectRegistrationOptions = { icon?: ProjectIcon; shortcut?: string | null; appLaunchTargets?: AppLaunchTarget[] };

export async function addProject(name: string, path: string | null, launchUrl = "", options?: ProjectRegistrationOptions): Promise<Project> {
  requireDesktop();
  return invoke<Project>("add_project", { name, path, launchUrl: launchUrl.trim() || null, ...options });
}

// 元の値も送り、別の操作による更新をRust側で検出する。
export type ShortcutChange = { shortcut: string | null };

export async function updateProject(project: Project, name: string, path: string | null, icon?: ProjectIcon, shortcutChange?: ShortcutChange): Promise<Project> {
  requireDesktop();
  return invoke<Project>("update_project", { project, name, path, ...(icon && { icon }), ...(shortcutChange && { shortcutChange }) });
}

export async function removeProject(project: Project): Promise<void> {
  requireDesktop();
  return invoke<void>("remove_project", { project });
}

export async function selectProjectDirectory(): Promise<SelectedDirectory | null> {
  requireDesktop();
  return invoke<SelectedDirectory | null>("select_project_directory");
}

export function shortcutRegistrationError(error: unknown): string | null {
  if (typeof error === "object" && error !== null &&
    "field" in error && error.field === "shortcut" &&
    "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return null;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return shortcutRegistrationError(error) ?? "予期しないエラーが発生しました。もう一度お試しください。";
}
