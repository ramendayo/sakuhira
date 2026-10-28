import { useEffect, useState } from "react";
import { errorMessage, listProjects } from "../services/projects";
import type { Project } from "../types/project";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    listProjects().then(
      (loaded) => {
        if (!cancelled) {
          setProjects(loaded);
          setStatus("ready");
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setError(errorMessage(error));
          setStatus("error");
        }
      },
    );
    return () => { cancelled = true; };
  }, [revision]);

  return {
    projects,
    status,
    error,
    retry: () => setRevision((current) => current + 1),
    replace: (project: Project) => setProjects((current) => current.map((item) => item.id === project.id ? project : item)),
    remove: (id: string) => setProjects((current) => current.filter((item) => item.id !== id)),
    append: (project: Project) => setProjects((current) => [...current, project]),
    recordResumed: (id: string, timestamp: number) => setProjects((current) => current.map((item) => item.id === id ? { ...item, lastResumedAt: Math.max(item.lastResumedAt ?? 0, timestamp) } : item)),
  };
}
