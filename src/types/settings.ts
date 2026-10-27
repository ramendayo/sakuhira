export type Editor = "vsCode" | "cursor";
export type ThemePreference = "light" | "dark" | "system";
export type Settings = { defaultEditor: Editor; theme: ThemePreference };

export function editorName(editor: Editor): string {
  return editor === "vsCode" ? "VS Code" : "Cursor";
}
