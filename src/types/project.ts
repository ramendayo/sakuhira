export type ProjectNotes = {
  lastWork: string;
  nextTask: string;
  updatedAt: number | null;
};

export type ProjectIconShape = "folder" | "link" | "code" | "browser" | "note" | "terminal" | "flask";
export type ProjectIconColor = "default" | "blue" | "green" | "amber" | "purple" | "gray";

export const projectIconShapeLabels: Record<ProjectIconShape, string> = {
  folder: "フォルダ",
  link: "リンク",
  code: "コード",
  browser: "ブラウザ",
  note: "ノート",
  terminal: "ターミナル",
  flask: "フラスコ",
};

export const projectIconColorLabels: Record<ProjectIconColor, string> = {
  default: "デフォルト",
  blue: "青",
  green: "緑",
  amber: "琥珀",
  purple: "紫",
  gray: "グレー",
};

export type ProjectIcon =
  | { mode: "auto" }
  | { mode: "custom"; shape: ProjectIconShape; color: ProjectIconColor };

export type Project = {
  id: string;
  name: string;
  path: string | null;
  launchUrl: string | null;
  notes: ProjectNotes;
  lastResumedAt: number | null;
  icon?: ProjectIcon;
  shortcut?: string;
};

export type SelectedDirectory = {
  path: string;
  suggestedName: string;
};
