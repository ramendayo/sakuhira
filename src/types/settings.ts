export type Editor = "vsCode" | "cursor";
export type ThemePreference = "light" | "dark" | "system";
export type ProjectView = { layout: "cards" | "list"; cardSize: "small" | "standard" | "large" };
export const defaultProjectView: ProjectView = { layout: "cards", cardSize: "standard" };
export type Settings = { defaultEditor: Editor; theme: ThemePreference; projectView: ProjectView };

export function editorName(editor: Editor): string {
  return editor === "vsCode" ? "VS Code" : "Cursor";
}
