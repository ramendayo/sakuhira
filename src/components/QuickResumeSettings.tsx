import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../features/projects/services/projects";
import { onShortcutsRestored, readQuickResumeShortcutIssue } from "../services/shortcuts";
import type { Settings } from "../types/settings";
import ProjectShortcutField, { shortcutLabel } from "./ProjectShortcutField";

type Props = {
  settings: Settings;
  shortcut: string | null;
  saveError: string | null;
  onChange: (shortcut: string | null) => void;
};

export default function QuickResumeSettings({ settings, shortcut, saveError, onChange }: Props) {
  const saved = settings.quickResumeShortcut ?? null;
  const [issue, setIssue] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const refreshIssue = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    const subscription = onShortcutsRestored(() => { if (!cancelled) refreshIssue(); });
    // Subscribe first so an in-progress startup restore cannot be missed.
    void subscription.then(
      () => { if (!cancelled) refreshIssue(); },
      () => { if (!cancelled) refreshIssue(); },
    );
    return () => {
      cancelled = true;
      void subscription.then((unlisten) => unlisten(), () => {});
    };
  }, [refreshIssue]);

  useEffect(() => {
    if (!revision) return;
    let cancelled = false;
    void readQuickResumeShortcutIssue().then(
      (reason) => { if (!cancelled) setIssue(reason); },
      (error: unknown) => {
        if (!cancelled) setIssue(`ショートカットの状態を読み込めません：${errorMessage(error)}`);
      },
    );
    return () => { cancelled = true; };
  }, [revision, settings]);

  return (
    <section aria-labelledby="shortcut-settings" className="settings-section">
      <h2 id="shortcut-settings" className="section-title">ショートカット</h2>
      <div className="settings-row">
        <div className="self-start">
          <h3 className="settings-row-label">クイック再開</h3>
          <p className="settings-row-description">別のアプリを使っているときも、キーを押してプロジェクトを検索・再開できます。</p>
        </div>
        <div className="min-w-0 space-y-3">
          <ProjectShortcutField
            legend="クイック再開ショートカット"
            shortcut={shortcut}
            onChange={onChange}
            saveError={saveError}
            embedded
          />
          {shortcut !== saved && (
            <p className="text-xs text-muted">保存済みの割り当て：{saved ? <kbd>{shortcutLabel(saved)}</kbd> : "未設定"}</p>
          )}
          {issue && <p role="alert" className="break-words text-sm text-danger">{issue}</p>}
        </div>
      </div>
    </section>
  );
}
