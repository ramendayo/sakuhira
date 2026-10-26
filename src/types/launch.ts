export type LaunchOutcome =
  | { status: "success" }
  | { status: "error"; message: string };

export type ResumeReport = {
  editorName: string;
  editor: LaunchOutcome | null;
  browser: LaunchOutcome | null;
  history:
    | { status: "skipped" }
    | { status: "saved"; timestamp: number }
    | { status: "error"; message: string };
};
