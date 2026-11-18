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

export const launchTargetRequiredMessage = "フォルダ・URL・アプリのいずれかを設定してください。";
export const lastLaunchTargetMessage = "最後の起動先を外す前に、別のフォルダ・URL・アプリを追加してください。";

export function hasLaunchTarget(
  path: string | null,
  url: string | null,
  apps?: readonly AppLaunchTarget[],
): boolean {
  return Boolean(path?.trim() || url?.trim() || apps?.length);
}

export function supportsAppLaunchTargets() {
  return isTauri() && /Mac/.test(navigator.platform);
}

export async function selectProjectLaunchItem(kind: "app" | "file"): Promise<string | null> {
  requireDesktop();
  return invoke<string | null>("select_project_launch_item", { kind });
}

export async function setProjectAppLaunchTargets(project: Project, targets: AppLaunchTarget[]): Promise<Project> {
  requireDesktop();
  return invoke<Project>("set_project_app_launch_targets", { project, targets });
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
