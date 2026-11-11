import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../services/projects";
import { onShortcutsRestored, readShortcutIssues, supportsShortcuts } from "../services/shortcuts";
import type { ShortcutIssue } from "../services/shortcuts";

export function useShortcutIssues() {
  const [issues, setIssues] = useState<ShortcutIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    if (!supportsShortcuts()) return;
    let cancelled = false;
    const subscription = onShortcutsRestored(refresh);
    // Read once after subscribing in case startup completed before the page mounted.
    void subscription.then(() => { if (!cancelled) refresh(); }, (error) => {
      console.error(error);
      if (!cancelled) refresh();
    });
    return () => {
      cancelled = true;
      void subscription.then((unlisten) => unlisten(), () => {});
    };
  }, [refresh]);

  useEffect(() => {
    if (!revision || !supportsShortcuts()) return;
    let cancelled = false;
    void readShortcutIssues().then(
      (issues) => {
        if (cancelled) return;
        setIssues(issues);
        setError(null);
      },
      (error) => { if (!cancelled) setError(errorMessage(error)); },
    );
    return () => { cancelled = true; };
  }, [revision]);

  return { issues, error, refresh };
}
