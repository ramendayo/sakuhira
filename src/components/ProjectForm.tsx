import { useCallback, useId, useState } from "react";
import type { FormEvent } from "react";
import { addProject, errorMessage, selectProjectDirectory, shortcutRegistrationError, updateProject } from "../services/projects";
import { supportsShortcuts } from "../services/shortcuts";
import type { Project, ProjectIcon as IconAppearance, ProjectIconColor, ProjectIconShape } from "../types/project";
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
  const [pending, setPending] = useState<"picking" | "saving" | null>(null);

  const changeShortcut = useCallback((key: string | null) => {
    setShortcut(key);
    setShortcutError(null);
  }, []);

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
    if (pending) return;
    if (!name.trim()) {
      setError("プロジェクト名を入力してください。");
      return;
    }
    if (!path && !(project ? project.launchUrl : launchUrl.trim())) {
      setError("フォルダまたは起動URLを設定してください。");
      return;
    }
    setError(null);
    setShortcutError(null);
    setPending("saving");
    try {
      const registrationOptions = customIcon || selectedShortcut
        ? [{ icon: appearance, shortcut: selectedShortcut }] as const
        : [] as const;
      const saved = project
        ? await updateProject(project, name.trim(), path || null, appearance, ...(shortcut === undefined ? [] : [{ shortcut }]))
        : await addProject(name.trim(), path || null, launchUrl, ...registrationOptions);
      onSaved(saved);
    } catch (error) {
      const shortcutFailure = !project && canSetShortcut ? shortcutRegistrationError(error) : null;
      if (shortcutFailure) {
        setOptionsOpen(true);
        setShortcutError(shortcutFailure);
      } else {
        setError(errorMessage(error));
      }
    } finally {
      setPending(null);
    }
  }

  const appearanceFields = <>
    <ProjectIconField
      path={previewPath}
      appearance={appearance}
      onCustomChange={changeIconMode}
      onShapeChange={setIconShape}
      onColorChange={setIconColor}
    />
    {canSetShortcut && <ProjectShortcutField
      shortcut={selectedShortcut}
      onChange={changeShortcut}
      saveError={shortcutError}
    />}
  </>;
  const showOptionsSummary = !optionsOpen && (customIcon || selectedShortcut !== null);

  return (
    <form
      onSubmit={submit}
      aria-labelledby={`${id}-heading`}
      aria-busy={pending !== null}
      className="mb-8 panel"
    >
      <h2 id={`${id}-heading`} className="section-title">{project ? "プロジェクトを編集" : "プロジェクトを登録"}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        名前を入力し、フォルダまたは起動URLを設定してください。
      </p>
      <fieldset disabled={pending !== null} className="mt-5 space-y-5 disabled:opacity-60">
        <div>
          <label htmlFor={`${id}-name`} className="field-label">プロジェクト名</label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
            maxLength={100}
            placeholder="例：Reentry"
            className="field"
          />
        </div>
        <div>
          <label htmlFor={`${id}-path`} className="field-label">フォルダ</label>
          <div className="flex flex-wrap gap-3">
            <input
              id={`${id}-path`}
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="フォルダを選択、または絶対パスを入力"
              className="field flex-[1_1_260px]"
            />
            <button type="button" onClick={chooseDirectory} className="button-secondary">
              {pending === "picking" ? "選択中…" : "フォルダを選択"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-6 text-muted">URLのみで登録する場合は空欄にできます。フォルダなしではブラウザだけを開きます。</p>
        </div>
        {!project && <div>
          <label htmlFor={`${id}-launch-url`} className="field-label">起動URL（任意）</label>
          <input id={`${id}-launch-url`} type="url" value={launchUrl} onChange={(event) => setLaunchUrl(event.target.value)} placeholder="http://localhost:3000" aria-describedby={`${id}-launch-url-help`} className="field" />
          <p id={`${id}-launch-url-help`} className="mt-2 text-xs leading-6 text-muted">フォルダがない場合は必須です。HTTP/HTTPSのURLを再開時にブラウザで開きます。後から詳細画面で変更できます。</p>
        </div>}
        {project && appearanceFields}
        <p className="text-xs leading-6 text-muted">フォルダ内のファイルは変更されません。</p>
        {!project && (
          <div className="space-y-3">
            <button
              type="button"
              aria-expanded={optionsOpen}
              aria-controls={`${id}-optional-settings`}
              aria-labelledby={`${id}-optional-label`}
              aria-describedby={showOptionsSummary ? `${id}-optional-summary` : undefined}
              onClick={() => setOptionsOpen((open) => !open)}
              className="button-secondary w-full justify-start text-left"
            >
              <span id={`${id}-optional-label`}>アイコン・再開ショートカット（任意）</span>
              {showOptionsSummary && (
                <span id={`${id}-optional-summary`} className="ml-auto flex shrink-0 items-center gap-2">
                  {customIcon && <>
                    <span className="sr-only">カスタムアイコン設定済み</span>
                    <ProjectIcon path={previewPath} appearance={appearance} compact />
                  </>}
                  {selectedShortcut && <kbd className="text-xs text-muted">{shortcutLabel(selectedShortcut)}</kbd>}
                </span>
              )}
              <span aria-hidden="true" className={`size-2 shrink-0 border-b border-r border-current ${showOptionsSummary ? "" : "ml-auto"} ${optionsOpen ? "rotate-[225deg]" : "rotate-45"}`} />
            </button>
            <div id={`${id}-optional-settings`} hidden={!optionsOpen} className="space-y-3">
              {optionsOpen && appearanceFields}
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className="button-secondary">キャンセル</button>
          <button type="submit" className="button-primary">
            {pending === "saving" ? "保存中…" : project ? "変更を保存" : "登録する"}
          </button>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-danger">{error}</p>}
    </form>
  );
}

export default ProjectForm;
