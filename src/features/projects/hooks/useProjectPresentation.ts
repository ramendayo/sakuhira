import { useCallback, useRef, useState } from "react";
import { useSettings } from "../../../hooks/useSettings";
import { getSettings, saveSettings } from "../../../services/settings";
import { errorMessage, listProjects } from "../services/projects";
import { defaultProjectOrder, defaultProjectView, editorName } from "../../../types/settings";
import type { ProjectView, Settings } from "../../../types/settings";
import type { Project } from "../types/project";
import { applyProjectOrderChange, InvalidProjectOrderChange } from "../utils/projectOrder";
import type { ProjectOrderChange } from "../utils/projectOrder";

type PreferenceChange =
  | { kind: "view"; view: Partial<ProjectView> }
  | { kind: "order"; order: ProjectOrderChange };

type ProjectMembershipChange = Extract<ProjectOrderChange, { kind: "register" | "remove" }>;

type PreferenceFailure =
  | { recovery: "retry"; message: string; change: PreferenceChange }
  | { recovery: "reload"; message: string };

export function useProjectPresentation() {
  const { result, replace } = useSettings();
  const saving = useRef(false);
  const queuedProjectChanges = useRef<ProjectMembershipChange[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PreferenceFailure | null>(null);
  const [projectChangeError, setProjectChangeError] = useState<string | null>(null);
  const view = result.status === "ready" ? result.settings.projectView : defaultProjectView;
  const order = result.status === "ready" ? result.settings.projectOrder : defaultProjectOrder;
  const editorLabel = result.status === "ready" ? editorName(result.settings.defaultEditor) : undefined;

  async function persistPreferences(change: PreferenceChange, expected: Settings, projects: Project[]) {
    const next = change.kind === "view"
      ? { ...expected, projectView: { ...expected.projectView, ...change.view } }
      : { ...expected, projectOrder: applyProjectOrderChange(expected.projectOrder, projects, change.order) };
    if (JSON.stringify(expected) !== JSON.stringify(next)) replace(await saveSettings(expected, next));
  }

  async function runSaves(saveInteractiveChange?: () => Promise<boolean>): Promise<boolean> {
    if (saving.current) return false;
    saving.current = true;
    setPending(true);
    try {
      const saved = saveInteractiveChange ? await saveInteractiveChange() : true;
      while (queuedProjectChanges.current.length > 0) {
        const change = queuedProjectChanges.current[0];
        setProjectChangeError(null);
        try {
          const expected = await getSettings();
          replace(expected);
          // 一覧を開いた後に別プロセスが登録した項目も手動順に残す。
          const projects = change.kind === "register" ? await listProjects() : [];
          await persistPreferences({ kind: "order", order: change }, expected, projects);
          queuedProjectChanges.current.shift();
        } catch (error) {
          setProjectChangeError(errorMessage(error));
          break;
        }
      }
      return saved;
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  function savePreferences(change: PreferenceChange, projects: Project[] = [], refresh = false): Promise<boolean> {
    if (result.status !== "ready") return Promise.resolve(false);
    return runSaves(async () => {
      setFailure(null);
      try {
        const expected = refresh ? await getSettings() : result.settings;
        if (refresh) replace(expected);
        const available = refresh && change.kind === "order" && change.order.kind !== "sort"
          ? await listProjects() : projects;
        await persistPreferences(change, expected, available);
        return true;
      } catch (error) {
        setFailure(error instanceof InvalidProjectOrderChange
          ? { recovery: "reload", message: error.message }
          : { recovery: "retry", change, message: errorMessage(error) });
        return false;
      }
    });
  }

  function syncProjectOrder(change: ProjectMembershipChange) {
    queuedProjectChanges.current.push(change);
    if (!saving.current) void runSaves();
  }

  const clearInvalidChange = useCallback(() => {
    setFailure((current) => current?.recovery === "reload" ? null : current);
  }, []);

  return {
    view, order, editorLabel, pending,
    failure: projectChangeError !== null ? { recovery: "retry" as const, message: projectChangeError } : failure,
    clearInvalidChange,
    saveView: (view: Partial<ProjectView>) => savePreferences({ kind: "view", view }),
    saveOrder: (order: Exclude<ProjectOrderChange, ProjectMembershipChange>, projects?: Project[]) =>
      savePreferences({ kind: "order", order }, projects),
    syncProjectOrder,
    retry: () => projectChangeError !== null ? runSaves() : failure?.recovery === "retry" && savePreferences(failure.change, [], true),
    loading: result.status === "loading",
    disabled: pending || result.status !== "ready",
  };
}
