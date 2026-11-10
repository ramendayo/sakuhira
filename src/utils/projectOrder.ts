import type { Project } from "../types/project";
import type { ProjectOrder } from "../types/settings";

const nameCollator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });

// projectsは保存データの登録順。未知のIDを新しい順で補い、古い配置も欠落なく使う。
export function normalizeManualIds(projects: Project[], saved: string[]): string[] {
  const available = new Set(projects.map(({ id }) => id));
  const retained = [...new Set(saved)].filter((id) => available.has(id));
  const known = new Set(retained);
  return [...projects.map(({ id }) => id).filter((id) => !known.has(id)).reverse(), ...retained];
}

export function orderedProjects(projects: Project[], order: ProjectOrder, query: string): Project[] {
  const term = query.trim().toLocaleLowerCase("ja");
  const pinnedIds = new Set(order.pinnedIds);
  const manualRanks = new Map(normalizeManualIds(projects, order.manualIds).map((id, index) => [id, index]));
  return projects.map((project, index) => ({ project, index }))
    .filter(({ project }) => !term || project.name.toLocaleLowerCase("ja").includes(term) || project.path?.toLocaleLowerCase("ja").includes(term))
    .sort((a, b) => {
      const pinDifference = Number(pinnedIds.has(b.project.id)) - Number(pinnedIds.has(a.project.id));
      if (pinDifference) return pinDifference;
      let difference: number;
      switch (order.sort) {
        case "name": difference = nameCollator.compare(a.project.name, b.project.name); break;
        case "newest": difference = b.index - a.index; break;
        case "manual": difference = manualRanks.get(a.project.id)! - manualRanks.get(b.project.id)!; break;
        default: difference = (b.project.lastResumedAt ?? -1) - (a.project.lastResumedAt ?? -1);
      }
      // 同順位は元の登録順で固定し、再開・表示切り替えで揺れないようにする。
      return difference || a.index - b.index;
    }).map(({ project }) => project);
}

export function moveProject(ids: string[], id: string, target: number): string[] {
  const index = ids.indexOf(id);
  if (index < 0 || target < 0 || target >= ids.length || index === target) return ids;
  const next = [...ids];
  next.splice(index, 1);
  next.splice(target, 0, id);
  return next;
}
