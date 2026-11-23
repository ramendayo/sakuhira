import { useRef, useState } from "react";
import { useSettings } from "../../../hooks/useSettings";
import { getSettings, saveSettings } from "../../../services/settings";
import { errorMessage, listProjects } from "../services/projects";
import { defaultProjectOrder, defaultProjectView, editorName } from "../../../types/settings";
import type { ProjectView, Settings } from "../../../types/settings";
import type { Project } from "../types/project";
import { applyProjectOrderChange } from "../utils/projectOrder";
import type { ProjectOrderChange } from "../utils/projectOrder";

type PreferenceChange =
  | { kind: "view"; view: Partial<ProjectView> }
  | { kind: "order"; order: ProjectOrderChange };

type ProjectMembershipChange = Extract<ProjectOrderChange, { kind: "register" | "remove" }>;
type QueuedProjectChange = { change: ProjectMembershipChange; projects?: Project[] };

export function useProjectPresentation() {
  const { result, replace } = useSettings();
  const saving = useRef(false);
  const queuedProjectChanges = useRef<QueuedProjectChange[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ change: PreferenceChange; message: string } | null>(null);
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
        const job = queuedProjectChanges.current[0];
        setProjectChangeError(null);
        try {
          const expected = await getSettings();
          replace(expected);
          // 待機後の登録は、登録解除などを反映した最新のプロジェクトで順序を計算する。
          const projects = job.change.kind === "register" ? job.projects ?? await listProjects() : [];
          await persistPreferences({ kind: "order", order: job.change }, expected, projects);
          queuedProjectChanges.current.shift();
        } catch (error) {
          // 次の再試行では、失敗した操作から最新データを使ってやり直す。
          delete job.projects;
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
        setFailure({ change, message: errorMessage(error) });
        return false;
      }
    });
  }

  function syncProjectOrder(change: ProjectMembershipChange, projects?: Project[]) {
    const useCurrentProjects = !saving.current && queuedProjectChanges.current.length === 0;
    queuedProjectChanges.current.push({ change, projects: useCurrentProjects ? projects : undefined });
    if (!saving.current) void runSaves();
  }

  return {
    view, order, editorLabel, pending,
    failure: projectChangeError !== null ? { message: projectChangeError } : failure,
    saveView: (view: Partial<ProjectView>) => savePreferences({ kind: "view", view }),
    saveOrder: (order: Exclude<ProjectOrderChange, ProjectMembershipChange>, projects?: Project[]) =>
      savePreferences({ kind: "order", order }, projects),
    syncProjectOrder,
    retry: () => projectChangeError !== null ? runSaves() : failure && savePreferences(failure.change, [], true),
    loading: result.status === "loading",
    disabled: pending || result.status !== "ready",
  };
}
