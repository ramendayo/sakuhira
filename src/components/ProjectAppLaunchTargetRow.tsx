import type { ReactNode } from "react";
import { appLaunchTargetLabel } from "../services/launch";
import type { AppLaunchTarget } from "../types/project";

type RowProps = {
  target: AppLaunchTarget;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
  editorOpen?: boolean;
  children?: ReactNode;
};

export function ProjectAppLaunchTargetRow({ target, disabled, onEdit, onRemove, editorOpen, children }: RowProps) {
  const label = appLaunchTargetLabel(target);
  return (
    <li className="space-y-2 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span title={target.filePath ?? target.appPath} className="min-w-0 break-words text-sm">{label}</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled} aria-expanded={editorOpen} aria-label={`${label}を変更`} className="button-quiet" onClick={onEdit}>変更</button>
          <button type="button" disabled={disabled} aria-label={`${label}を削除`} className="button-quiet" onClick={onRemove}>削除</button>
        </div>
      </div>
      {children}
    </li>
  );
}

type PickerProps = {
  target: AppLaunchTarget;
  onChoose: (kind: "app" | "file", trigger: HTMLButtonElement) => void;
  onClearFile: () => void;
};

export function ProjectAppLaunchTargetPicker({ target, onChoose, onClearFile }: PickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="button-quiet" onClick={(event) => onChoose("app", event.currentTarget)}>アプリを選び直す</button>
      <button type="button" className="button-quiet" onClick={(event) => onChoose("file", event.currentTarget)}>
        {target.filePath ? "ファイルを選び直す" : "ファイルを選択（任意）"}
      </button>
      {target.filePath && <button type="button" className="button-quiet" onClick={onClearFile}>ファイルを解除</button>}
    </div>
  );
}
