import { useId, useState } from "react";
import { projectIconColorLabels, projectIconShapeLabels } from "../types/project";
import type { ProjectIcon as IconAppearance, ProjectIconColor, ProjectIconShape } from "../types/project";
import Icon from "../../../components/Icon";
import ProjectIcon from "./ProjectIcon";

const iconShapes = Object.keys(projectIconShapeLabels) as ProjectIconShape[];

type Props = {
  path: string | null;
  compact?: boolean;
  appearance: IconAppearance;
  onCustomChange: (custom: boolean) => void;
  onShapeChange: (shape: ProjectIconShape) => void;
  onColorChange: (color: ProjectIconColor) => void;
};

export default function ProjectIconField({ path, appearance, compact, onCustomChange, onShapeChange, onColorChange }: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const customIcon = appearance.mode === "custom";

  return (
    <fieldset className={compact ? "project-option-field" : "space-y-4 rounded-xl border border-line p-4"}>
      <legend className={compact ? "sr-only" : "px-1 text-sm font-medium"}>アイコン</legend>
      {compact && (
        <div className="project-option-row">
          <span aria-hidden="true" className="text-sm font-medium text-ink">アイコン</span>
          <div className="project-option-actions">
            <ProjectIcon path={path} appearance={appearance} compact />
            <span className="text-sm text-muted">{customIcon ? "カスタム" : "自動"}</span>
            <button type="button" className="button-secondary" aria-label={expanded ? "アイコンの変更を閉じる" : "アイコンを変更"} aria-expanded={expanded} aria-controls={`${id}-editor`} onClick={() => setExpanded((open) => !open)}>
              {expanded ? "閉じる" : "変更"}
            </button>
          </div>
        </div>
      )}
      <div id={`${id}-editor`} hidden={compact && !expanded} className={compact ? "space-y-4 rounded-lg bg-subtle p-3" : "space-y-4"}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name={`${id}-icon-mode`} checked={!customIcon} onChange={() => onCustomChange(false)} />
              自動
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name={`${id}-icon-mode`} checked={customIcon} onChange={() => onCustomChange(true)} />
              カスタム
            </label>
          </div>
          {!compact && <div className="flex items-center gap-2 text-xs text-muted" role="group" aria-label="アイコンのプレビュー">
            プレビュー
            <ProjectIcon path={path} appearance={appearance} compact />
          </div>}
        </div>
        {(customIcon || compact) && (
          <div className="space-y-4">
            <fieldset>
              <legend className="field-label">形</legend>
              <div className="flex flex-wrap gap-2">
                {iconShapes.map((shape) => (
                  <label key={shape} className="icon-shape-choice">
                    <input
                      className="sr-only"
                      type="radio"
                      name={`${id}-icon-shape`}
                      value={shape}
                      checked={appearance.mode === "custom" && appearance.shape === shape}
                      onChange={() => { if (!customIcon) onCustomChange(true); onShapeChange(shape); }}
                    />
                    <span className="icon-shape-tile">
                      <Icon name={shape} />
                      {projectIconShapeLabels[shape]}
                      <span className="icon-shape-check" aria-hidden="true">✓</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="max-w-60">
              <label htmlFor={`${id}-icon-color`} className="field-label">背景色</label>
              <select id={`${id}-icon-color`} className="field" value={appearance.mode === "custom" ? appearance.color : ""} onChange={(event) => {
                if (!customIcon) onCustomChange(true);
                onColorChange(event.target.value as ProjectIconColor);
              }}>
                {!customIcon && <option value="" disabled>自動</option>}
                {Object.entries(projectIconColorLabels).map(([color, label]) => <option key={color} value={color}>{label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
    </fieldset>
  );
}
