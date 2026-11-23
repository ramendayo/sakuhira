import { useRef, useState } from "react";
import { useSettings } from "../../../hooks/useSettings";
import { getSettings, saveSettings } from "../../../services/settings";
import { errorMessage, listProjects } from "../services/projects";
import { defaultProjectOrder, defaultProjectView, editorName } from "../../../types/settings";
import type { ProjectView } from "../../../types/settings";
import type { Project } from "../types/project";
import { applyProjectOrderChange } from "../utils/projectOrder";
import type { ProjectOrderChange } from "../utils/projectOrder";

type PreferenceChange =
  | { kind: "view"; view: Partial<ProjectView> }
  | { kind: "order"; order: ProjectOrderChange };

export function useProjectPresentation(projects: Project[]) {
  const { result, replace } = useSettings();
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ change: PreferenceChange; message: string } | null>(null);
  const view = result.status === "ready" ? result.settings.projectView : defaultProjectView;
  const order = result.status === "ready" ? result.settings.projectOrder : defaultProjectOrder;
  const editorLabel = result.status === "ready" ? editorName(result.settings.defaultEditor) : undefined;

  async function savePreferences(change: PreferenceChange, refresh = false, currentProjects = projects): Promise<boolean> {
    if (saving.current || result.status !== "ready") return false;
    saving.current = true;
    setPending(true);
    setFailure(null);
    try {
      const expected = refresh ? await getSettings() : result.settings;
      if (refresh) replace(expected);

      let next;
      if (change.kind === "view") {
        next = { ...expected, projectView: { ...expected.projectView, ...change.view } };
      } else {
        const available = refresh && change.order.kind !== "sort" ? await listProjects() : currentProjects;
        next = { ...expected, projectOrder: applyProjectOrderChange(expected.projectOrder, available, change.order) };
      }
      if (JSON.stringify(expected) !== JSON.stringify(next)) replace(await saveSettings(expected, next));
      return true;
    } catch (error) {
      setFailure({ change, message: errorMessage(error) });
      return false;
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return {
    view, order, editorLabel, pending, failure,
    saveView: (view: Partial<ProjectView>) => savePreferences({ kind: "view", view }),
    saveOrder: (order: ProjectOrderChange, currentProjects?: Project[]) => savePreferences({ kind: "order", order }, false, currentProjects),
    retry: () => failure && savePreferences(failure.change, true),
    loading: result.status === "loading",
    disabled: pending || result.status !== "ready",
  };
}
