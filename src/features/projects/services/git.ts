import { invoke, isTauri } from "@tauri-apps/api/core";
import type { GitStatus } from "../types/git";

export async function getGitStatus(projectId: string): Promise<GitStatus> {
  if (!isTauri()) throw new Error("Git情報はデスクトップアプリで利用できます。");
  return invoke<GitStatus>("get_git_status", { projectId });
}
