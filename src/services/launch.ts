import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppLaunchTarget, Project } from "../types/project";
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

export function appLaunchTargetLabel({ appPath, filePath }: AppLaunchTarget): string {
  const app = appPath.slice(appPath.lastIndexOf("/") + 1).replace(/\.app$/i, "");
  const file = filePath?.slice(filePath.lastIndexOf("/") + 1);
  return file ? `${app}（${file}）` : app;
}

export function resumeErrorMessages(report: ResumeReport): string[] {
  const errors: string[] = [];
  if (report.editor?.status === "error") errors.push(`${report.editorName}：${report.editor.message}`);
  if (report.browser?.status === "error") errors.push(`ブラウザ：${report.browser.message}`);
  for (const { target, outcome } of report.apps ?? []) {
    if (outcome.status === "error") errors.push(`${appLaunchTargetLabel(target)}：${outcome.message}`);
  }
  if (report.history.status === "error") errors.push(`最終再開日時を保存できませんでした：${report.history.message}`);
  return errors;
}
