import { useState } from "react";
import { useSettings } from "./useSettings";
import { saveSettings } from "../services/settings";
import { errorMessage } from "../services/projects";
import { defaultProjectView } from "../types/settings";
import type { ProjectView } from "../types/settings";

export function useProjectView() {
  const { result, replace } = useSettings();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ view: ProjectView; message: string } | null>(null);
  const view = result.status === "ready" ? result.settings.projectView : defaultProjectView;

  async function save(next: ProjectView) {
    if (pending || result.status !== "ready") return;
    if (next.layout === view.layout && next.cardSize === view.cardSize) return;
    setPending(true);
    setFailure(null);
    try {
      const saved = await saveSettings(result.settings, { ...result.settings, projectView: next });
      replace(saved);
    } catch (error) {
      setFailure({ view: next, message: errorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  return { view, save, pending, loading: result.status === "loading", disabled: pending || result.status !== "ready", failure };
}
