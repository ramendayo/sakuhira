import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ShortcutIssue = { projectId: string; reason: string };
type ShortcutResume = { projectId: string; timestamp: number };

export function supportsShortcuts() {
  return isTauri() && /Mac/.test(navigator.platform);
}

export function readShortcutIssues() {
  return invoke<ShortcutIssue[]>("get_shortcut_errors");
}

export function onShortcutsRestored(handler: () => void) {
  return listen("project-shortcuts-restored", handler);
}

export function onShortcutResume(handler: (resume: ShortcutResume) => void) {
  return listen<ShortcutResume>("project-shortcut-resumed", ({ payload }) => handler(payload));
}

export function onCapturedShortcut(handler: (shortcut: string) => void) {
  return listen<string>("project-shortcut-captured", ({ payload }) => handler(payload), { target: "main" });
}

export function setShortcutCapture(capturing: boolean) {
  return invoke<void>("set_shortcut_capture", { capturing });
}
