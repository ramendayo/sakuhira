import { useRef, useState } from "react";
import { useSettings } from "../../../hooks/useSettings";
import { getSettings, saveSettings } from "../../../services/settings";
import { errorMessage } from "../services/projects";
import { defaultProjectOrder, defaultProjectView } from "../../../types/settings";
import type { ProjectOrder, ProjectView, Settings } from "../../../types/settings";

type Preferences = Partial<Pick<Settings, "projectView" | "projectOrder">>;

export function useProjectPresentation() {
  const { result, replace } = useSettings();
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ preferences: Preferences; message: string } | null>(null);
  const view = result.status === "ready" ? result.settings.projectView : defaultProjectView;
  const order = result.status === "ready" ? result.settings.projectOrder : defaultProjectOrder;

  async function savePreferences(next: Preferences, refresh = false): Promise<boolean> {
    if (saving.current || result.status !== "ready") return false;
    if (!refresh && Object.entries(next).every(([key, value]) => JSON.stringify(result.settings[key as keyof Preferences]) === JSON.stringify(value))) {
      setFailure(null);
      return true;
    }
    saving.current = true;
    setPending(true);
    setFailure(null);
    try {
      // 再試行時は最新の設定へ変更対象だけを適用し、他の操作で更新した設定を守る。
      const expected = refresh ? await getSettings() : result.settings;
      const saved = await saveSettings(expected, { ...expected, ...next });
      replace(saved);
      return true;
    } catch (error) {
      setFailure({ preferences: next, message: errorMessage(error) });
      return false;
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return {
    view, order, pending, failure,
    save: (next: ProjectView) => savePreferences({ projectView: next }),
    saveOrder: (next: ProjectOrder) => savePreferences({ projectOrder: next }),
    retry: () => failure && savePreferences(failure.preferences, true),
    loading: result.status === "loading",
    disabled: pending || result.status !== "ready",
  };
}
