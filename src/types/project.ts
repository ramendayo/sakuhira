export type ProjectNotes = {
  lastWork: string;
  nextTask: string;
  updatedAt: number | null;
};

export type ProjectIconShape = "folder" | "link" | "code" | "browser" | "note" | "terminal" | "flask";
export type ProjectIconColor = "default" | "blue" | "green" | "amber" | "purple" | "gray";
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
