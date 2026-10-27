import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSettings } from "../services/settings";
import { errorMessage } from "../services/projects";
import type { Settings } from "../types/settings";

type Result = { status: "loading" } | { status: "ready"; settings: Settings } | { status: "error"; message: string };

type SettingsState = { result: Result; reload: () => void; replace: (settings: Settings) => void };
export const SettingsContext = createContext<SettingsState | null>(null);

export function useSettingsState(enabled = true): SettingsState {
  const [result, setResult] = useState<Result>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setResult({ status: "loading" });
    getSettings().then(
      (settings) => { if (!cancelled) setResult({ status: "ready", settings }); },
      (error: unknown) => { if (!cancelled) setResult({ status: "error", message: errorMessage(error) }); },
    );
    return () => { cancelled = true; };
  }, [revision, enabled]);
  const reload = useCallback(() => setRevision((current) => current + 1), []);
  const replace = useCallback((settings: Settings) => setResult({ status: "ready", settings }), []);
  return { result, reload, replace };
}

export function useSettings(): SettingsState {
  const shared = useContext(SettingsContext);
  // 単独で表示する部品も使えるようにし、アプリ内では共有済みの設定を使う。
  const local = useSettingsState(shared === null);
  return shared ?? local;
}
