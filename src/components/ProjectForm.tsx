import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { addProject, appLaunchTargetRegistrationError, errorMessage, selectProjectDirectory, shortcutRegistrationError, updateProject } from "../services/projects";
import {
  appLaunchTargetName, hasLaunchTarget, lastLaunchTargetMessage, launchTargetRequiredMessage,
  selectProjectLaunchItem, supportsAppLaunchTargets,
} from "../services/launch";
import { supportsShortcuts } from "../services/shortcuts";
import type { AppLaunchTarget, Project, ProjectIcon as IconAppearance, ProjectIconColor, ProjectIconShape } from "../types/project";
import { useSettings } from "../hooks/useSettings";
import { editorName } from "../types/settings";
import { ProjectAppLaunchTargetPicker, ProjectAppLaunchTargetRow } from "./ProjectAppLaunchTargetRow";
import ProjectIcon from "./ProjectIcon";
import ProjectIconField from "./ProjectIconField";
import ProjectShortcutField, { shortcutLabel } from "./ProjectShortcutField";

type ProjectFormProps = {
  project?: Project;
  onSaved: (project: Project) => void;
  onCancel: () => void;
};

function FolderEditorName() {
  const { result } = useSettings();
  if (result.status === "ready") return <p className="text-xs text-muted">{editorName(result.settings.defaultEditor)}で開く</p>;
  return <p className="text-xs text-muted">{result.status === "loading" ? "エディタ設定を読み込み中…" : "エディタ設定を確認できません。"}</p>;
}

function ProjectForm({ project: initialProject, onSaved, onCancel }: ProjectFormProps) {
  // 入力開始時の値を保持し、編集中に届いた更新で競合検出の基準を変えない。
  const [project] = useState(initialProject);
  const id = useId();
  const [name, setName] = useState(project?.name ?? "");
  const [path, setPath] = useState(project?.path ?? "");
  const [launchUrl, setLaunchUrl] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const appButton = useRef<HTMLButtonElement>(null);
  const folderButton = useRef<HTMLButtonElement>(null);
  const urlButton = useRef<HTMLButtonElement>(null);
  const urlField = useRef<HTMLInputElement>(null);
  const [appLaunchTargets, setAppLaunchTargets] = useState<AppLaunchTarget[]>([]);
  const [appError, setAppError] = useState<{ index: number; message: string } | null>(null);
  const [editingApp, setEditingApp] = useState<number | null>(null);
  const [shortcut, setShortcut] = useState<string | null | undefined>(undefined);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const pickerTrigger = useRef<HTMLButtonElement | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const selectedShortcut = shortcut === undefined ? project?.shortcut ?? null : shortcut;
  const canSetShortcut = supportsShortcuts();
  const canChooseApps = !project && supportsAppLaunchTargets();
  const previewPath = path.trim() || null;
  const savedCustomIcon = project?.icon?.mode === "custom" ? project.icon : undefined;
  const [customIcon, setCustomIcon] = useState(Boolean(savedCustomIcon));
  const [iconShape, setIconShape] = useState<ProjectIconShape | undefined>(
    savedCustomIcon?.shape ?? (project && (project.path ? "folder" : "link")),
  );
  const defaultIconShape = previewPath ? "folder" : "link";
  const [iconColor, setIconColor] = useState<ProjectIconColor>(savedCustomIcon?.color ?? "gray");
  const appearance: IconAppearance = customIcon
    ? { mode: "custom", shape: iconShape ?? defaultIconShape, color: iconColor }
    : { mode: "auto" };
  const [error, setError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [pending, setPending] = useState<"picking" | "saving" | null>(null);

  const changeShortcut = useCallback((key: string | null) => {
    setShortcut(key);
    setShortcutError(null);
  }, []);

  useEffect(() => {
    if (!pending && pickerTrigger.current) {
      pickerTrigger.current.focus();
      pickerTrigger.current = null;
    }
  }, [pending]);

  function openUrl() {
    if (urlOpen) urlField.current?.focus();
    else setUrlOpen(true);
  }

  async function pick(trigger: HTMLButtonElement, operation: () => Promise<void>) {
    if (pending) return;
    pickerTrigger.current = trigger;
    setPending("picking");
    setError(null);
    try {
      await operation();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  function chooseDirectory(trigger: HTMLButtonElement) {
    void pick(trigger, async () => {
      const selected = await selectProjectDirectory();
      if (selected) {
        setTargetError(null);
        setPath(selected.path);
        setName((current) => current.trim() ? current : selected.suggestedName);
      }
    });
  }

  function chooseAppItem(trigger: HTMLButtonElement, kind: "app" | "file", index?: number) {
    void pick(trigger, async () => {
      const selected = await selectProjectLaunchItem(kind);
      if (selected === null) return;
      setAppError(null);
      setTargetError(null);
      if (index === undefined) {
        setAppLaunchTargets((targets) => [...targets, { appPath: selected, filePath: null }]);
        setName((current) => current.trim() ? current : appLaunchTargetName(selected));
      } else {
        updateApp(index, (target) => kind === "app"
          ? { ...target, appPath: selected }
          : { ...target, filePath: selected });
      }
    });
  }

  function updateApp(index: number, change: (target: AppLaunchTarget) => AppLaunchTarget) {
    setAppError(null);
    setAppLaunchTargets((targets) => targets.map((target, row) => row === index ? change(target) : target));
  }

  function changeIconMode(custom: boolean) {
    if (custom) setIconShape((shape) => shape ?? defaultIconShape);
    setCustomIcon(custom);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      setError("プロジェクト名を入力してください。");
      return;
    }
    const configuredUrl = project ? project.launchUrl : launchUrl;
    const configuredApps = project ? project.appLaunchTargets : appLaunchTargets;
    if (!hasLaunchTarget(path, configuredUrl, configuredApps)) {
      setError(null);
      setTargetError(project ? lastLaunchTargetMessage : launchTargetRequiredMessage);
      return;
    }
    setTargetError(null);
    setError(null);
    setShortcutError(null);
    setAppError(null);
    setPending("saving");
    try {
      const hasOptions = customIcon || selectedShortcut !== null || appLaunchTargets.length > 0;
      const registrationOptions = {
        ...((customIcon || selectedShortcut) && { icon: appearance, shortcut: selectedShortcut }),
        ...(appLaunchTargets.length > 0 && { appLaunchTargets }),
      };
      const saved = project
        ? await updateProject(project, name.trim(), previewPath ? path : null, appearance, ...(shortcut === undefined ? [] : [{ shortcut }]))
        : await addProject(name.trim(), previewPath ? path : null, launchUrl, ...(hasOptions ? [registrationOptions] : []));
      onSaved(saved);
    } catch (error) {
      const appFailure = !project ? appLaunchTargetRegistrationError(error) : null;
      const shortcutFailure = !project && canSetShortcut ? shortcutRegistrationError(error) : null;
      if (shortcutFailure) {
        setOptionsOpen(true);
        setShortcutError(shortcutFailure);
      } else if (appFailure) {
        setEditingApp(appFailure.index);
        setAppError(appFailure);
      } else {
        setError(errorMessage(error));
      }
    } finally {
      setPending(null);
    }
  }

  const iconField = <ProjectIconField
    path={previewPath}
    appearance={appearance}
    compact={!project}
    onCustomChange={changeIconMode}
    onShapeChange={setIconShape}
    onColorChange={setIconColor}
  />;
  const shortcutField = canSetShortcut && <ProjectShortcutField
    shortcut={selectedShortcut}
    compact={!project}
    legend={project ? undefined : "再開ショートカット"}
    onChange={changeShortcut}
    saveError={shortcutError}
  />;
  const showOptionsSummary = !optionsOpen && (customIcon || selectedShortcut !== null);

  const actions = (
    <div className="flex flex-wrap justify-end gap-3">
      <button type="button" onClick={onCancel} className="button-secondary">キャンセル</button>
      <button type="submit" className="button-primary">
        {pending === "saving" ? "保存中…" : project ? "変更を保存" : "登録する"}
      </button>
    </div>
  );

  return (
    <form
      onSubmit={submit}
      aria-labelledby={`${id}-heading`}
      aria-busy={pending !== null}
      className="mb-8 panel"
    >
      <h2 id={`${id}-heading`} className="section-title">{project ? "プロジェクトを編集" : "プロジェクトを登録"}</h2>
      <fieldset disabled={pending !== null} className="mt-5 space-y-5 disabled:opacity-60">
        {!project && (
          <section aria-labelledby={`${id}-targets`} className="space-y-3">
            <h3 id={`${id}-targets`} className="text-sm font-medium text-ink">再開時に開くもの</h3>
            <p className="text-sm text-muted">いずれか1つから登録できます。</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" ref={appButton} className="button-secondary" autoFocus={canChooseApps} disabled={!canChooseApps} onClick={(event) => chooseAppItem(event.currentTarget, "app")}>＋ アプリ</button>
              <button type="button" ref={folderButton} className="button-secondary" autoFocus={!canChooseApps} onClick={(event) => chooseDirectory(event.currentTarget)}>＋ フォルダ</button>
              <button type="button" ref={urlButton} className="button-secondary" onClick={openUrl}>＋ URL</button>
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
                      setAppLaunchTargets((targets) => targets.filter((_, row) => row !== index));
                      setEditingApp(null);
                      setAppError(null);
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
                    <div className="min-w-0">
                      <p className="break-all text-sm">{path}</p>
                      <FolderEditorName />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="button-quiet" aria-label="フォルダを変更" onClick={(event) => chooseDirectory(event.currentTarget)}>変更</button>
                      <button type="button" className="button-quiet" aria-label="フォルダを削除" onClick={() => {
                        setPath("");
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
                        onChange={(event) => { setLaunchUrl(event.target.value); setTargetError(null); }}
                        placeholder="http://localhost:3000" className="field" />
                    </div>
                    <button type="button" className="button-quiet" aria-label="URLを削除" onClick={() => {
                      setLaunchUrl("");
                      setUrlOpen(false);
                      urlButton.current?.focus();
                    }}>削除</button>
                  </li>
                )}
              </ul>
            )}
          </section>
        )}
        <div>
          <label htmlFor={`${id}-name`} className="field-label">プロジェクト名</label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus={Boolean(project)}
            required
            maxLength={100}
            placeholder="例：sakuhira"
            className="field"
          />
        </div>
        {project && <div>
          <label htmlFor={`${id}-path`} className="field-label">フォルダ</label>
          <div className="flex flex-wrap gap-3">
            <input
              id={`${id}-path`}
              value={path}
              onChange={(event) => { setPath(event.target.value); setTargetError(null); }}
              placeholder="フォルダを選択、または絶対パスを入力"
              className="field flex-[1_1_260px]"
            />
            <button type="button" onClick={(event) => chooseDirectory(event.currentTarget)} className="button-secondary">
              {pending === "picking" ? "選択中…" : "フォルダを選択"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-6 text-muted">設定したフォルダは再開時にエディタで開きます。フォルダ内のファイルは変更されません。</p>
        </div>}
        {targetError && <p role="alert" className="text-sm text-danger">{targetError}</p>}
        {project && <>{iconField}{shortcutField}</>}
        {project ? actions : (
          <div className="space-y-3">
            <div className="rounded-lg border border-line">
              <button
                type="button"
                aria-expanded={optionsOpen}
                aria-controls={`${id}-optional-settings`}
                aria-labelledby={`${id}-optional-label`}
                aria-describedby={showOptionsSummary ? `${id}-optional-summary` : undefined}
                onClick={() => setOptionsOpen((open) => !open)}
                className="button-quiet w-full flex-wrap justify-start px-3 py-2 text-left text-ink"
              >
                <span id={`${id}-optional-label`}>アイコン・再開ショートカット（任意）</span>
                {showOptionsSummary && (
                  <span id={`${id}-optional-summary`} className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                    {customIcon && <>
                      <span className="sr-only">カスタムアイコン設定済み</span>
                      <ProjectIcon path={previewPath} appearance={appearance} compact />
                    </>}
                    {selectedShortcut && <kbd className="text-xs text-muted">{shortcutLabel(selectedShortcut)}</kbd>}
                  </span>
                )}
                <span aria-hidden="true" className={`size-2 shrink-0 border-b border-r border-current ${showOptionsSummary ? "" : "ml-auto"} ${optionsOpen ? "rotate-[225deg]" : "rotate-45"}`} />
              </button>
              <div id={`${id}-optional-settings`} hidden={!optionsOpen} className="divide-y divide-line border-t border-line px-3">
                <div className="py-3">{iconField}</div>
                {canSetShortcut && <div className="py-3">{optionsOpen && shortcutField}</div>}
              </div>
            </div>
            {actions}
          </div>
        )}
      </fieldset>
      {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-danger">{error}</p>}
    </form>
  );
}

export default ProjectForm;
