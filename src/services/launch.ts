import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Project } from "../types/project";
import type { ResumeReport } from "../types/launch";

function requireDesktop() {
  if (!isTauri()) throw new Error("開発環境の起動はデスクトップアプリで利用できます。");
}

export async function setProjectLaunchUrl(project: Project, url: string): Promise<Project> {
  requireDesktop();
  return invoke<Project>("set_project_launch_url", { project, url: url.trim() || null });
}

export async function resumeProject(project: Project): Promise<ResumeReport> {
  requireDesktop();
  return invoke<ResumeReport>("resume_project", { project });
}
