import { useCallback, useId, useState } from "react";
import type { FormEvent } from "react";
import { addProject, appLaunchTargetRegistrationError, errorMessage, shortcutRegistrationError, updateProject } from "../services/projects";
import { hasLaunchTarget, lastLaunchTargetMessage, launchTargetRequiredMessage } from "../services/launch";
import { supportsShortcuts } from "../../../services/shortcuts";
import type { AppLaunchTarget, Project, ProjectIcon as IconAppearance, ProjectIconColor, ProjectIconShape } from "../types/project";
import ProjectLaunchTargetFields from "./ProjectLaunchTargetFields";
import ProjectIcon from "./ProjectIcon";
import ProjectIconField from "./ProjectIconField";
import ProjectShortcutField, { shortcutLabel } from "../../../components/ProjectShortcutField";

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
  const [appError, setAppError] = useState<{ index: number; message: string } | null>(null);
  const [shortcut, setShortcut] = useState<string | null | undefined>(undefined);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const selectedShortcut = shortcut === undefined ? project?.shortcut ?? null : shortcut;
  const canSetShortcut = supportsShortcuts();
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

  function suggestName(suggestedName?: string) {
    if (suggestedName !== undefined) setName((current) => current.trim() ? current : suggestedName);
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
        setAppError(appFailure);
      } else {
        setError(errorMessage(error));
      }
    } finally {
      setPending(null);
    }
  }

  const launchTargetFields = (
    <ProjectLaunchTargetFields
      editing={Boolean(project)}
      path={path}
      launchUrl={launchUrl}
      appLaunchTargets={appLaunchTargets}
      appError={appError}
      pending={pending}
      onPathChange={(value, suggestedName) => {
        setPath(value);
        setTargetError(null);
        suggestName(suggestedName);
      }}
      onUrlChange={(value) => {
        setLaunchUrl(value);
        setTargetError(null);
      }}
      onAppsChange={(targets, suggestedName) => {
        setAppLaunchTargets(targets);
        setAppError(null);
        setTargetError(null);
        suggestName(suggestedName);
      }}
      onPickingChange={(picking) => setPending(picking ? "picking" : null)}
      onPickerError={setError}
    />
  );

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
        {!project && launchTargetFields}
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
          {!project && (
            <div className="mt-4">
              <button
                type="button"
                aria-expanded={optionsOpen}
                aria-controls={`${id}-optional-settings`}
                aria-labelledby={`${id}-optional-label`}
                aria-describedby={showOptionsSummary ? `${id}-optional-summary` : undefined}
                onClick={() => setOptionsOpen((open) => !open)}
                className="button-quiet max-w-full justify-start px-0 py-1 text-left hover:bg-transparent"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className={`ml-0.5 size-2 shrink-0 border-b border-r border-current ${optionsOpen ? "rotate-45" : "-rotate-45"}`} />
                  <span id={`${id}-optional-label`}>アイコン・再開ショートカット（任意）</span>
                </span>
                {showOptionsSummary && (
                  <span id={`${id}-optional-summary`} className="flex shrink-0 items-center gap-2">
                    {customIcon && <>
                      <span className="sr-only">カスタムアイコン設定済み</span>
                      <ProjectIcon path={previewPath} appearance={appearance} compact />
                    </>}
                    {selectedShortcut && <kbd className="text-xs text-muted">{shortcutLabel(selectedShortcut)}</kbd>}
                  </span>
                )}
              </button>
              <div id={`${id}-optional-settings`} hidden={!optionsOpen} className="mt-1 divide-y divide-line">
                <div className="py-3">{iconField}</div>
                {canSetShortcut && <div className="py-3">{optionsOpen && shortcutField}</div>}
              </div>
            </div>
          )}
        </div>
        {project && launchTargetFields}
        {targetError && <p role="alert" className="text-sm text-danger">{targetError}</p>}
        {project && <>{iconField}{shortcutField}</>}
        {actions}
      </fieldset>
      {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-danger">{error}</p>}
    </form>
  );
}

export default ProjectForm;
