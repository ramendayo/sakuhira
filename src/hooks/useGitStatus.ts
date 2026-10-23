import { useEffect, useState } from "react";
import { getGitStatus } from "../services/git";
import { errorMessage } from "../services/projects";
import type { GitStatus } from "../types/git";

type Result =
  | { status: "loading" }
  | { status: "ready"; data: GitStatus }
  | { status: "error"; message: string };

export function useGitStatus(projectId: string, path: string) {
  const key = `${projectId}\0${path}`;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; value: Result }>({ key, value: { status: "loading" } });

  useEffect(() => {
    let cancelled = false;
    setResult({ key, value: { status: "loading" } });
    getGitStatus(projectId).then(
      (data) => { if (!cancelled) setResult({ key, value: { status: "ready", data } }); },
      (error: unknown) => { if (!cancelled) setResult({ key, value: { status: "error", message: errorMessage(error) } }); },
    );
    return () => { cancelled = true; };
  }, [projectId, key, revision]);

  const value: Result = result.key === key ? result.value : { status: "loading" };
  return {
    result: value,
    refresh: () => setRevision((current) => current + 1),
  };
}
