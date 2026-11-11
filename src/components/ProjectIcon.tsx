import Icon from "./Icon";
import type { ProjectIcon as IconAppearance } from "../types/project";

type Props = {
  path: string | null;
  appearance?: IconAppearance;
  compact?: boolean;
};

export default function ProjectIcon({ path, appearance, compact = false }: Props) {
  const custom = appearance?.mode === "custom" ? appearance : undefined;
  const automaticShape = path ? "folder" : "link";

  return (
    <span className={compact ? "project-icon project-icon-compact" : "project-icon"} data-icon-color={custom?.color}>
      <Icon name={custom?.shape ?? automaticShape} className="size-5" />
    </span>
  );
}
