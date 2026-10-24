export type Editor = "vsCode" | "cursor";
export type Settings = { defaultEditor: Editor };

export function editorName(editor: Editor): string {
  return editor === "vsCode" ? "VS Code" : "Cursor";
}
