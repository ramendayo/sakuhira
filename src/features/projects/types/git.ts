export type GitHead =
  | { kind: "branch"; name: string; unborn: boolean }
  | { kind: "detached"; commit: string };

export type GitStatus =
  | { kind: "notRepository" }
  | { kind: "repository"; head: GitHead; changedFiles: number; rootPath: string };
