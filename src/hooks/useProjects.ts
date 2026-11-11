import { useCallback, useEffect, useState } from "react";
import { errorMessage, listProjects } from "../services/projects";
import { onShortcutResume, supportsShortcuts } from "../services/shortcuts";
import type { Project } from "../types/project";

function keepLatestResume(project: Project, timestamp?: number | null): Project {
  return timestamp != null && (project.lastResumedAt == null || project.lastResumedAt < timestamp)
    ? { ...project, lastResumedAt: timestamp }
    : project;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const recordResumed = useCallback((id: string, timestamp: number) => {
    setProjects((current) => current.map((item) => item.id === id ? keepLatestResume(item, timestamp) : item));
  }, []);

  useEffect(() => {
    if (!supportsShortcuts()) return;
    let cancelled = false;
    const subscription = onShortcutResume(({ projectId, timestamp }) => {
      if (!cancelled) recordResumed(projectId, timestamp);
    });
    void subscription.catch(console.error);
    return () => {
      cancelled = true;
      void subscription.then((unlisten) => unlisten(), () => {});
    };
  }, [recordResumed]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    listProjects().then(
      (loaded) => {
        if (!cancelled) {
          setProjects((current) => loaded.map((project) => keepLatestResume(project, current.find((item) => item.id === project.id)?.lastResumedAt)));
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
    replace: (project: Project) => setProjects((current) => current.map((item) => item.id === project.id ? keepLatestResume(project, item.lastResumedAt) : item)),
    remove: (id: string) => setProjects((current) => current.filter((item) => item.id !== id)),
    append: (project: Project) => setProjects((current) => [...current, project]),
    recordResumed,
  };
}
