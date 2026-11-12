import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Project } from "../types/project";

export async function setProjectNotes(project: Project, lastWork: string, nextTask: string): Promise<Project> {
  if (!isTauri()) throw new Error("作業メモの保存はデスクトップアプリで利用できます。");
  return invoke<Project>("set_project_notes", { project, lastWork, nextTask });
}

export async function openNoteLink(url: string): Promise<void> {
  if (!isTauri()) throw new Error("リンクはデスクトップアプリで開けます。");
  await invoke("open_note_link", { url });
}
