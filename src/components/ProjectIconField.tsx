import { useId } from "react";
import { projectIconColorLabels, projectIconShapeLabels } from "../types/project";
import type { ProjectIcon as IconAppearance, ProjectIconColor, ProjectIconShape } from "../types/project";
import Icon from "./Icon";
import ProjectIcon from "./ProjectIcon";

const iconShapes = Object.keys(projectIconShapeLabels) as ProjectIconShape[];

type Props = {
  path: string | null;
  appearance: IconAppearance;
  onCustomChange: (custom: boolean) => void;
  onShapeChange: (shape: ProjectIconShape) => void;
  onColorChange: (color: ProjectIconColor) => void;
};

export default function ProjectIconField({ path, appearance, onCustomChange, onShapeChange, onColorChange }: Props) {
  const id = useId();
  const customIcon = appearance.mode === "custom";

  return (
    <fieldset className="space-y-4 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-medium">アイコン</legend>
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
        <div className="flex items-center gap-2 text-xs text-muted" role="group" aria-label="アイコンのプレビュー">
          プレビュー
          <ProjectIcon path={path} appearance={appearance} compact />
        </div>
      </div>
      {appearance.mode === "custom" && (
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
                    checked={appearance.shape === shape}
                    onChange={() => onShapeChange(shape)}
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
            <select id={`${id}-icon-color`} className="field" value={appearance.color} onChange={(event) => onColorChange(event.target.value as ProjectIconColor)}>
              {Object.entries(projectIconColorLabels).map(([color, label]) => <option key={color} value={color}>{label}</option>)}
            </select>
          </div>
        </div>
      )}
    </fieldset>
  );
}
