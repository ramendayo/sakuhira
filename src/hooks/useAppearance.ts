import { useEffect, useLayoutEffect, useState } from "react";
import { useSettings } from "./useSettings";
import { applyTheme } from "../services/settings";
import { errorMessage } from "../features/projects/services/projects";
import type { ThemePreference } from "../types/settings";

export function useAppearance() {
  const { result } = useSettings();
  const [lastPreference, setLastPreference] = useState<ThemePreference>("system");
  const preference = result.status === "ready" ? result.settings.theme : lastPreference;
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useLayoutEffect(() => {
    if (result.status === "ready") setLastPreference(result.settings.theme);
  }, [result]);

  useLayoutEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme = preference === "system" ? (media?.matches ? "dark" : "light") : preference;
    };
    update();
    if (preference === "system") media?.addEventListener("change", update);
    return () => {
      media?.removeEventListener("change", update);
      delete document.documentElement.dataset.theme;
    };
  }, [preference]);

  const ready = result.status === "ready";
  useEffect(() => {
    if (!ready) { setError(null); return; }
    let cancelled = false;
    setError(null);
    applyTheme().catch((error: unknown) => { if (!cancelled) setError(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [ready, preference, revision]);

  return { error, loadError: result.status === "error" ? result.message : null, retry: () => setRevision((current) => current + 1) };
}
