import { useState } from "react";
import { appLaunchTargetLabel, selectProjectLaunchItem } from "../services/launch";
import { errorMessage } from "../services/projects";
import type { AppLaunchTarget } from "../types/project";

type Props = {
  targets: AppLaunchTarget[];
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onChange: (targets: AppLaunchTarget[]) => Promise<void> | void;
  onDraftChange?: (editing: boolean) => void;
  deferred?: boolean;
  compact?: boolean;
};

type Draft = { index: number | null; target: AppLaunchTarget };

export default function ProjectAppLaunchTargets({ targets, disabled, onBusyChange, onChange, onDraftChange, deferred, compact }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  function changeDraft(next: Draft | null) {
    setDraft(next);
    onDraftChange?.(next !== null);
  }

  async function run(operation: () => Promise<void>) {
    if (disabled) return;
    onBusyChange(true);
    setError(null);
    setNotice("");
    try {
      await operation();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      onBusyChange(false);
    }
  }

  function choose(kind: "app" | "file") {
    void run(async () => {
      const path = await selectProjectLaunchItem(kind);
      if (path === null) return;
      if (!draft) {
        changeDraft({ index: null, target: { appPath: path, filePath: null } });
      } else {
        const target = kind === "app" ? { ...draft.target, appPath: path } : { ...draft.target, filePath: path };
        setDraft({ ...draft, target });
      }
    });
  }

  function save(next: AppLaunchTarget[]) {
    void run(async () => {
      await onChange(next);
      changeDraft(null);
      if (!deferred) setNotice("アプリの起動設定を保存しました。");
    });
  }

  return (
    <fieldset disabled={disabled} className={`w-full min-w-0 space-y-3 disabled:opacity-60 ${compact ? "" : deferred ? "mt-3" : "mt-6 border-t border-line pt-5"}`}>
      <legend className="sr-only">再開時に開くアプリ</legend>
      {compact ? (
        <div className="project-option-row">
          <span aria-hidden="true" className="text-sm font-medium text-ink">再開時に開くアプリ</span>
          <div className="project-option-actions">
            <span className="text-sm text-muted">{targets.length > 0 ? `${targets.length}件` : "未設定"}</span>
            <button type="button" className="button-secondary" disabled={draft !== null} onClick={() => choose("app")}>アプリを追加</button>
          </div>
        </div>
      ) : !deferred && <h3 className="text-sm font-semibold text-ink">再開時に開くアプリ</h3>}
      {targets.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {targets.map((target, index) => {
            const label = appLaunchTargetLabel(target);
            return (
              <li key={index} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span title={target.filePath ?? target.appPath} className="min-w-0 break-words text-sm">{label}</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={draft !== null} aria-label={`${label}を変更`} className="button-quiet" onClick={() => {
                    setError(null);
                    setNotice("");
                    changeDraft({ index, target });
                  }}>変更</button>
                  <button type="button" disabled={draft !== null} aria-label={`${label}を削除`} className="button-quiet" onClick={() => save(targets.filter((_, row) => row !== index))}>削除</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {draft ? (
        <div className="space-y-3 rounded-lg border border-line bg-subtle p-3">
          <p className="break-words text-sm font-medium text-ink">{appLaunchTargetLabel(draft.target)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-quiet" onClick={() => choose("app")}>アプリを選び直す</button>
            <button type="button" className="button-quiet" onClick={() => choose("file")}>{draft.target.filePath ? "ファイルを選び直す" : "ファイルを選択（任意）"}</button>
            {draft.target.filePath && (
              <button type="button" className="button-quiet" onClick={() => setDraft({ ...draft, target: { ...draft.target, filePath: null } })}>ファイルを解除</button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-secondary" onClick={() => save(
              draft.index === null
                ? [...targets, draft.target]
                : targets.map((target, index) => index === draft.index ? draft.target : target),
            )}>{draft.index === null ? "起動先を追加" : deferred ? "変更を反映" : "変更を保存"}</button>
            <button type="button" className="button-quiet" onClick={() => { changeDraft(null); setError(null); }}>キャンセル</button>
          </div>
        </div>
      ) : !compact && (
        <button type="button" className="button-secondary" onClick={() => choose("app")}>アプリを追加</button>
      )}
      {error && <p role="alert" className="break-words text-sm text-danger">{error}</p>}
      <p role="status" className="notice">{notice}</p>
    </fieldset>
  );
}
