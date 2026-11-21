import { useEffect, useId, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { useSettings } from "../hooks/useSettings";
import { appLaunchTargetName, selectProjectLaunchItem, supportsAppLaunchTargets } from "../services/launch";
import { errorMessage, selectProjectDirectory } from "../services/projects";
import type { AppLaunchTarget } from "../types/project";
import { editorName } from "../types/settings";
import Icon from "./Icon";
import { ProjectAppLaunchTargetPicker, ProjectAppLaunchTargetRow } from "./ProjectAppLaunchTargetRow";

type LaunchTargetButtonProps = ComponentProps<"button"> & {
  icon: ComponentProps<typeof Icon>["name"];
  label: string;
  description: string;
};

function LaunchTargetButton({ icon, label, description, ...buttonProps }: LaunchTargetButtonProps) {
  const id = useId();
  return (
    <button {...buttonProps} type="button" className="button-secondary launch-target-button"
      aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`}>
      <Icon name={icon} className="size-5 text-accent" />
      <span className="min-w-0">
        <span id={`${id}-label`} className="block">{label}</span>
        <span id={`${id}-description`} className="mt-1 block text-xs font-normal text-muted">{description}</span>
      </span>
    </button>
  );
}

function FolderLaunchSummary({ path }: { path: string }) {
  const { result } = useSettings();
  const folderName = path.slice(path.lastIndexOf("/") + 1) || path;
  return (
    <div className="min-w-0">
      <p className="break-words text-sm">
        {result.status === "ready" ? `${folderName} を ${editorName(result.settings.defaultEditor)}で開く` : folderName}
      </p>
      {folderName !== path && <p className="mt-1 break-all text-xs text-muted">{path}</p>}
      {result.status !== "ready" && (
        <p className="mt-1 text-xs text-muted">{result.status === "loading" ? "エディタ設定を読み込み中…" : "エディタ設定を確認できません。"}</p>
      )}
    </div>
  );
}

type Props = {
  editing: boolean;
  path: string;
  launchUrl: string;
  appLaunchTargets: AppLaunchTarget[];
  appError: { index: number; message: string } | null;
  pending: "picking" | "saving" | null;
  onPathChange: (path: string, suggestedName?: string) => void;
  onUrlChange: (url: string) => void;
  onAppsChange: (targets: AppLaunchTarget[], suggestedName?: string) => void;
  onPickingChange: (picking: boolean) => void;
  onPickerError: (message: string | null) => void;
};

export default function ProjectLaunchTargetFields({
  editing, path, launchUrl, appLaunchTargets, appError, pending,
  onPathChange, onUrlChange, onAppsChange, onPickingChange, onPickerError,
}: Props) {
  const id = useId();
  const [urlOpen, setUrlOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<number | null>(null);
  const appButton = useRef<HTMLButtonElement>(null);
  const folderButton = useRef<HTMLButtonElement>(null);
  const urlButton = useRef<HTMLButtonElement>(null);
  const urlField = useRef<HTMLInputElement>(null);
  const pickerTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!pending && pickerTrigger.current) {
      pickerTrigger.current.focus();
      pickerTrigger.current = null;
    }
  }, [pending]);

  useEffect(() => {
    if (appError) setEditingApp(appError.index);
  }, [appError]);

  function openUrl() {
    if (urlOpen) urlField.current?.focus();
    else setUrlOpen(true);
  }

  async function pick(trigger: HTMLButtonElement, operation: () => Promise<void>) {
    if (pending) return;
    pickerTrigger.current = trigger;
    onPickingChange(true);
    onPickerError(null);
    try {
      await operation();
    } catch (error) {
      onPickerError(errorMessage(error));
    } finally {
      onPickingChange(false);
    }
  }

  function chooseDirectory(trigger: HTMLButtonElement) {
    void pick(trigger, async () => {
      const selected = await selectProjectDirectory();
      if (selected) onPathChange(selected.path, selected.suggestedName);
    });
  }

  function chooseAppItem(trigger: HTMLButtonElement, kind: "app" | "file", index?: number) {
    void pick(trigger, async () => {
      const selected = await selectProjectLaunchItem(kind);
      if (selected === null) return;
      if (index === undefined) {
        onAppsChange([...appLaunchTargets, { appPath: selected, filePath: null }], appLaunchTargetName(selected));
      } else {
        updateApp(index, (target) => kind === "app"
          ? { ...target, appPath: selected }
          : { ...target, filePath: selected });
      }
    });
  }

  function updateApp(index: number, change: (target: AppLaunchTarget) => AppLaunchTarget) {
    onAppsChange(appLaunchTargets.map((target, row) => row === index ? change(target) : target));
  }

  if (editing) {
    return (
      <div>
        <label htmlFor={`${id}-path`} className="field-label">フォルダ</label>
        <div className="flex flex-wrap gap-3">
          <input
            id={`${id}-path`}
            value={path}
            onChange={(event) => onPathChange(event.target.value)}
            placeholder="フォルダを選択、または絶対パスを入力"
            className="field flex-[1_1_260px]"
          />
          <button type="button" onClick={(event) => chooseDirectory(event.currentTarget)} className="button-secondary">
            {pending === "picking" ? "選択中…" : "フォルダを選択"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-6 text-muted">設定したフォルダは再開時にエディタで開きます。フォルダ内のファイルは変更されません。</p>
      </div>
    );
  }

  const previewPath = path.trim();
  const canChooseApps = supportsAppLaunchTargets();

  return (
    <section aria-labelledby={`${id}-targets`} className="project-launch-targets space-y-3">
      <h3 id={`${id}-targets`} className="text-sm font-medium text-ink">再開時に開くもの</h3>
      <p className="text-sm text-muted">いずれか1つから登録できます。</p>
      <div className="launch-target-buttons">
        <LaunchTargetButton ref={appButton} icon="projects" label="アプリ" description="選んだアプリを開く"
          autoFocus={canChooseApps} disabled={!canChooseApps} onClick={(event) => chooseAppItem(event.currentTarget, "app")} />
        <LaunchTargetButton ref={folderButton} icon="folder" label="作業フォルダ" description="フォルダをエディタで開く"
          autoFocus={!canChooseApps} onClick={(event) => chooseDirectory(event.currentTarget)} />
        <LaunchTargetButton ref={urlButton} icon="link" label="URL" description="Webページをブラウザで開く"
          aria-expanded={urlOpen} onClick={openUrl} />
      </div>
      {(appLaunchTargets.length > 0 || previewPath || urlOpen) && (
        <ul aria-label="起動先" className="divide-y divide-line rounded-lg border border-line">
          {appLaunchTargets.map((target, index) => (
            <ProjectAppLaunchTargetRow
              key={index}
              target={target}
              disabled={pending !== null}
              editorOpen={editingApp === index}
              onEdit={() => setEditingApp((current) => current === index ? null : index)}
              onRemove={() => {
                onAppsChange(appLaunchTargets.filter((_, row) => row !== index));
                setEditingApp(null);
                appButton.current?.focus();
              }}
            >
              {editingApp === index && (
                <ProjectAppLaunchTargetPicker
                  target={target}
                  onChoose={(kind, trigger) => chooseAppItem(trigger, kind, index)}
                  onClearFile={() => updateApp(index, (item) => ({ ...item, filePath: null }))}
                />
              )}
              {appError?.index === index && <p role="alert" className="break-words text-sm text-danger">{appError.message}</p>}
            </ProjectAppLaunchTargetRow>
          ))}
          {previewPath && (
            <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <FolderLaunchSummary path={previewPath} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="button-quiet" aria-label="フォルダを変更" onClick={(event) => chooseDirectory(event.currentTarget)}>変更</button>
                <button type="button" className="button-quiet" aria-label="フォルダを削除" onClick={() => {
                  onPathChange("");
                  folderButton.current?.focus();
                }}>削除</button>
              </div>
            </li>
          )}
          {urlOpen && (
            <li className="flex flex-wrap items-end gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={`${id}-launch-url`} className="field-label">起動URL（任意）</label>
                <input id={`${id}-launch-url`} ref={urlField} autoFocus type="url" value={launchUrl}
                  onChange={(event) => onUrlChange(event.target.value)}
                  placeholder="http://localhost:3000" className="field" />
              </div>
              <button type="button" className="button-quiet" aria-label="URLを削除" onClick={() => {
                onUrlChange("");
                setUrlOpen(false);
                urlButton.current?.focus();
              }}>削除</button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
