import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { errorMessage } from "../services/projects";
import { onShortcutsRestored, readQuickResumeShortcutIssue, setQuickResumeShortcut } from "../services/shortcuts";
import type { Settings } from "../types/settings";
import ProjectShortcutField, { shortcutLabel } from "./ProjectShortcutField";

type Props = {
  settings: Settings;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (settings: Settings) => void;
};

export default function QuickResumeSettings({ settings, busy, onBusy, onSaved }: Props) {
  const saved = settings.quickResumeShortcut ?? null;
  const [draft, setDraft] = useState<string | null | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const shortcut = draft === undefined ? saved : draft;

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
  }, [revision]);

  const changeShortcut = useCallback((key: string | null) => {
    setDraft(key);
    setSaveError(null);
    setNotice("");
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (shortcut === saved && !(saved && issue))) return;
    onBusy(true);
    setSaving(true);
    setSaveError(null);
    setNotice("");
    try {
      const updated = await setQuickResumeShortcut(settings, shortcut);
      onSaved(updated);
      setDraft(undefined);
      setNotice(updated.quickResumeShortcut ? "ショートカットを保存しました。" : "ショートカットを解除しました。");
      refreshIssue();
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  return (
    <form aria-labelledby="quick-resume-settings" aria-busy={saving} onSubmit={save} className="settings-form-actions mt-5">
      <h2 className="section-title">ショートカット</h2>
      <div className="settings-row">
        <div className="self-start">
          <h3 id="quick-resume-settings" className="settings-row-label">クイック再開</h3>
          <p className="settings-row-description">別のアプリを使っているときも、キーを押してプロジェクトを検索・再開できます。</p>
        </div>
        <fieldset disabled={busy} className="min-w-0 space-y-3 disabled:opacity-60">
          <ProjectShortcutField
            legend="クイック再開ショートカット"
            shortcut={shortcut}
            onChange={changeShortcut}
            saveError={saveError}
            embedded
          />
          {draft !== undefined && shortcut !== saved && (
            <p className="text-xs text-muted">保存済みの割り当て：{saved ? <kbd>{shortcutLabel(saved)}</kbd> : "未設定"}</p>
          )}
          {issue && <p role="alert" className="break-words text-sm text-danger">{issue}</p>}
          <button type="submit" className="button-primary" disabled={shortcut === saved && !(saved && issue)}>
            {saving ? "保存中…" : "ショートカットを保存"}
          </button>
          <p role="status" className="notice">{notice}</p>
        </fieldset>
      </div>
    </form>
  );
}
