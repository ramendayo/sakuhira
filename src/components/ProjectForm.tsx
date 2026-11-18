import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { addProject, appLaunchTargetRegistrationError, errorMessage, selectProjectDirectory, shortcutRegistrationError, updateProject } from "../services/projects";
import {
  appLaunchTargetLabel, hasLaunchTarget, lastLaunchTargetMessage, launchTargetRequiredMessage, supportsAppLaunchTargets,
} from "../services/launch";
import { supportsShortcuts } from "../services/shortcuts";
import type { AppLaunchTarget, Project, ProjectIcon as IconAppearance, ProjectIconColor, ProjectIconShape } from "../types/project";
import ProjectAppLaunchTargets from "./ProjectAppLaunchTargets";
import ProjectIcon from "./ProjectIcon";
import ProjectIconField from "./ProjectIconField";
import ProjectShortcutField, { shortcutLabel } from "./ProjectShortcutField";

type ProjectFormProps = {
  project?: Project;
  onSaved: (project: Project) => void;
  onCancel: () => void;
};

function ProjectForm({ project: initialProject, onSaved, onCancel }: ProjectFormProps) {
  // 入力開始時の値を保持し、編集中に届いた更新で競合検出の基準を変えない。
  const [project] = useState(initialProject);
  const id = useId();
  const [name, setName] = useState(project?.name ?? "");
  const [path, setPath] = useState(project?.path ?? "");
  const [launchUrl, setLaunchUrl] = useState("");
  const [appLaunchTargets, setAppLaunchTargets] = useState<AppLaunchTarget[]>([]);
  const [appError, setAppError] = useState<{ index?: number; message: string } | null>(null);
  const [appDraftOpen, setAppDraftOpen] = useState(false);
  const [appsBusy, setAppsBusy] = useState(false);
  const [shortcut, setShortcut] = useState<string | null | undefined>(undefined);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const appOptions = useRef<HTMLDivElement>(null);
  const focusAppsOnOpen = useRef(false);
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

  const focusAppControls = useCallback(() => {
    const group = appOptions.current;
    (group?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? group)?.focus();
  }, []);

  useEffect(() => {
    if (optionsOpen && focusAppsOnOpen.current) {
      focusAppsOnOpen.current = false;
      focusAppControls();
    }
  }, [focusAppControls, optionsOpen]);

  function openAppOptions() {
    if (optionsOpen) {
      focusAppControls();
    } else {
      focusAppsOnOpen.current = true;
      setOptionsOpen(true);
    }
  }

  function changeIconMode(custom: boolean) {
    if (custom) setIconShape((shape) => shape ?? defaultIconShape);
    setCustomIcon(custom);
  }

  async function chooseDirectory() {
    setError(null);
    setPending("picking");
    try {
      const selected = await selectProjectDirectory();
      if (selected) {
        setTargetError(null);
        setPath(selected.path);
        setName((current) => current.trim() ? current : selected.suggestedName);
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || appsBusy) return;
    if (appDraftOpen) {
      setOptionsOpen(true);
      setAppError({ message: "編集中の起動先を確定するか、キャンセルしてください。" });
      return;
    }
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
        setOptionsOpen(true);
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
  const showOptionsSummary = !optionsOpen && (customIcon || selectedShortcut !== null || appLaunchTargets.length > 0);
  const failedTarget = appError?.index === undefined ? undefined : appLaunchTargets[appError.index];

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
      aria-busy={pending !== null || appsBusy}
      className="mb-8 panel"
    >
      <h2 id={`${id}-heading`} className="section-title">{project ? "プロジェクトを編集" : "プロジェクトを登録"}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        プロジェクト名と起動先を設定してください。
      </p>
      <fieldset disabled={pending !== null || appsBusy} className="mt-5 space-y-5 disabled:opacity-60">
        <div>
          <label htmlFor={`${id}-name`} className="field-label">プロジェクト名</label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
            maxLength={100}
            placeholder="例：sakuhira"
            className="field"
          />
        </div>
        <div>
          <label htmlFor={`${id}-path`} className="field-label">フォルダ</label>
          <div className="flex flex-wrap gap-3">
            <input
              id={`${id}-path`}
              value={path}
              onChange={(event) => { setPath(event.target.value); setTargetError(null); }}
              placeholder="フォルダを選択、または絶対パスを入力"
              className="field flex-[1_1_260px]"
            />
            <button type="button" onClick={chooseDirectory} className="button-secondary">
              {pending === "picking" ? "選択中…" : "フォルダを選択"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-6 text-muted">設定したフォルダは再開時にエディタで開きます。フォルダ内のファイルは変更されません。</p>
        </div>
        {!project && <div>
          <label htmlFor={`${id}-launch-url`} className="field-label">起動URL（任意）</label>
          <input id={`${id}-launch-url`} type="url" value={launchUrl} onChange={(event) => { setLaunchUrl(event.target.value); setTargetError(null); }} placeholder="http://localhost:3000" aria-describedby={`${id}-launch-url-help`} className="field" />
          <p id={`${id}-launch-url-help`} className="mt-2 text-xs leading-6 text-muted">HTTP/HTTPSのURLを再開時にブラウザで開きます。後から詳細画面で変更できます。</p>
        </div>}
        {(!project || targetError) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p role={targetError ? "alert" : undefined} className={`text-xs leading-6 ${targetError ? "text-danger" : "text-muted"}`}>
              {targetError ?? launchTargetRequiredMessage}
            </p>
            {canChooseApps && <button type="button" className="button-quiet" aria-controls={`${id}-app-options`} onClick={openAppOptions}>アプリを選ぶ</button>}
          </div>
        )}
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
                <span id={`${id}-optional-label`}>オプション設定（任意）</span>
                {showOptionsSummary && (
                  <span id={`${id}-optional-summary`} className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                    {customIcon && <>
                      <span className="sr-only">カスタムアイコン設定済み</span>
                      <ProjectIcon path={previewPath} appearance={appearance} compact />
                    </>}
                    {selectedShortcut && <kbd className="text-xs text-muted">{shortcutLabel(selectedShortcut)}</kbd>}
                    {appLaunchTargets.length > 0 && <span className="text-xs text-muted">アプリ {appLaunchTargets.length}件</span>}
                  </span>
                )}
                <span aria-hidden="true" className={`size-2 shrink-0 border-b border-r border-current ${showOptionsSummary ? "" : "ml-auto"} ${optionsOpen ? "rotate-[225deg]" : "rotate-45"}`} />
              </button>
              <div id={`${id}-optional-settings`} hidden={!optionsOpen} className="divide-y divide-line border-t border-line px-3">
                <div className="py-3">{iconField}</div>
                {canSetShortcut && <div className="py-3">{optionsOpen && shortcutField}</div>}
                {canChooseApps && (
                  <div id={`${id}-app-options`} ref={appOptions} tabIndex={-1} className="py-3">
                    <ProjectAppLaunchTargets
                      targets={appLaunchTargets}
                      disabled={pending !== null || appsBusy}
                      onBusyChange={setAppsBusy}
                      onChange={(targets) => { setAppLaunchTargets(targets); setAppError(null); setTargetError(null); }}
                      onDraftChange={(editing) => {
                        setAppDraftOpen(editing);
                        if (!editing) setAppError((current) => current?.index === undefined ? null : current);
                      }}
                      compact
                      deferred
                    />
                    {appError && <p role="alert" className="mt-2 break-words text-sm text-danger">
                      {failedTarget && `${appLaunchTargetLabel(failedTarget)}：`}{appError.message}
                    </p>}
                  </div>
                )}
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
