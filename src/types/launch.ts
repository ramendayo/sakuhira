export type LaunchOutcome =
  | { status: "success" }
  | { status: "error"; message: string };

export type ResumeReport = {
  editorName: string;
  editor: LaunchOutcome;
  browser: LaunchOutcome | null;
};
