import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Project, SelectedDirectory } from "../types/project";

function requireDesktop() {
  if (!isTauri()) {
    throw new Error("プロジェクトの登録・読み込みはデスクトップアプリで利用できます。npm run tauri dev で起動してください。");
  }
}

export async function listProjects(): Promise<Project[]> {
  requireDesktop();
  return invoke<Project[]>("list_projects");
}

export async function addProject(name: string, path: string): Promise<Project> {
  requireDesktop();
  return invoke<Project>("add_project", { name, path });
}

export async function selectProjectDirectory(): Promise<SelectedDirectory | null> {
  requireDesktop();
  return invoke<SelectedDirectory | null>("select_project_directory");
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "予期しないエラーが発生しました。もう一度お試しください。";
}
