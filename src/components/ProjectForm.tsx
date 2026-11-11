import { useId, useState } from "react";
import type { FormEvent } from "react";
import { addProject, errorMessage, selectProjectDirectory, updateProject } from "../services/projects";
import { supportsShortcuts } from "../services/shortcuts";
import type { Project, ProjectIcon as IconAppearance, ProjectIconColor, ProjectIconShape } from "../types/project";
import Icon from "./Icon";
import ProjectIcon from "./ProjectIcon";
import ProjectShortcutField from "./ProjectShortcutField";

const shapeOptions = [
  ["folder", "フォルダ"],
  ["link", "リンク"],
  ["code", "コード"],
  ["browser", "ブラウザ"],
  ["note", "ノート"],
  ["terminal", "ターミナル"],
  ["flask", "フラスコ"],
] as const satisfies ReadonlyArray<readonly [ProjectIconShape, string]>;

const colorLabels: Record<ProjectIconColor, string> = {
  default: "デフォルト",
  blue: "青",
  green: "緑",
  amber: "琥珀",
  purple: "紫",
  gray: "グレー",
};

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
  const savedCustomIcon = project?.icon?.mode === "custom" ? project.icon : undefined;
  const [customIcon, setCustomIcon] = useState(Boolean(savedCustomIcon));
  const [iconShape, setIconShape] = useState<ProjectIconShape>(savedCustomIcon?.shape ?? (project?.path ? "folder" : "link"));
  const [iconColor, setIconColor] = useState<ProjectIconColor>(savedCustomIcon?.color ?? "gray");
  const appearance: IconAppearance = customIcon
    ? { mode: "custom", shape: iconShape, color: iconColor }
    : { mode: "auto" };
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"picking" | "saving" | null>(null);

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
    setPending("saving");
    try {
      const saved = project
        ? await updateProject(project, name.trim(), path || null, appearance, ...(shortcut === undefined ? [] : [{ shortcut }]))
        : await addProject(name.trim(), path || null, launchUrl);
      onSaved(saved);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

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
        {project && (
          <fieldset className="space-y-4 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-medium">アイコン</legend>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name={`${id}-icon-mode`} checked={!customIcon} onChange={() => setCustomIcon(false)} />
                  自動
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name={`${id}-icon-mode`} checked={customIcon} onChange={() => setCustomIcon(true)} />
                  カスタム
                </label>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted" role="group" aria-label="アイコンのプレビュー">
                プレビュー
                <ProjectIcon path={path.trim() || null} appearance={appearance} compact />
              </div>
            </div>
            {customIcon && (
              <div className="space-y-4">
                <fieldset>
                  <legend className="field-label">形</legend>
                  <div className="flex flex-wrap gap-2">
                    {shapeOptions.map(([shape, label]) => (
                      <label key={shape} className="icon-shape-choice">
                        <input
                          className="sr-only"
                          type="radio"
                          name={`${id}-icon-shape`}
                          value={shape}
                          checked={iconShape === shape}
                          onChange={() => setIconShape(shape)}
                        />
                        <span className="icon-shape-tile">
                          <Icon name={shape} />
                          {label}
                          <span className="icon-shape-check" aria-hidden="true">✓</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="max-w-60">
                  <label htmlFor={`${id}-icon-color`} className="field-label">背景色</label>
                  <select id={`${id}-icon-color`} className="field" value={iconColor} onChange={(event) => setIconColor(event.target.value as ProjectIconColor)}>
                    {Object.entries(colorLabels).map(([color, label]) => <option key={color} value={color}>{label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </fieldset>
        )}
        {project && supportsShortcuts() && <ProjectShortcutField
          shortcut={shortcut === undefined ? project.shortcut ?? null : shortcut}
          onChange={setShortcut}
        />}
        <p className="text-xs leading-6 text-muted">フォルダ内のファイルは変更されません。</p>
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
