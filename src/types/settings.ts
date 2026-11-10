export type Editor = "vsCode" | "cursor";
export type ThemePreference = "light" | "dark" | "system";
export type ProjectView = { layout: "cards" | "list"; cardSize: "small" | "standard" | "large" };
export const defaultProjectView: ProjectView = { layout: "cards", cardSize: "standard" };
export type ProjectSort = "recent" | "name" | "newest" | "manual";
export type ProjectOrder = { sort: ProjectSort; manualIds: string[]; pinnedIds?: string[] };
export const defaultProjectOrder: ProjectOrder = { sort: "recent", manualIds: [] };
export const projectSortLabels: Record<ProjectSort, string> = {
  recent: "最近再開した順", name: "名前順", newest: "登録が新しい順", manual: "手動",
};
export type Settings = { defaultEditor: Editor; theme: ThemePreference; projectView: ProjectView; projectOrder: ProjectOrder };

export function editorName(editor: Editor): string {
  return editor === "vsCode" ? "VS Code" : "Cursor";
}
