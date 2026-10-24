export type LaunchOutcome =
  | { status: "success" }
  | { status: "error"; message: string };

export type ResumeReport = {
  editor: LaunchOutcome;
  browser: LaunchOutcome | null;
};
