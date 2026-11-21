import type { Project } from "../types/project";
import type { ProjectOrder } from "../../../types/settings";

const nameCollator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });

function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase("ja");
}

function projectMatchRank(project: Project, term: string): number | null {
  const name = project.name.toLocaleLowerCase("ja");
  if (name === term) return 0;
  if (name.startsWith(term)) return 1;
  if (name.includes(term)) return 2;
  if (project.path?.toLocaleLowerCase("ja").includes(term)) return 3;
  return null;
}

// projectsは保存データの登録順。未知のIDを新しい順で補い、古い配置も欠落なく使う。
export function normalizeManualIds(projects: Project[], saved: string[]): string[] {
  const available = new Set(projects.map(({ id }) => id));
  const retained = [...new Set(saved)].filter((id) => available.has(id));
  const known = new Set(retained);
  return [...projects.map(({ id }) => id).filter((id) => !known.has(id)).reverse(), ...retained];
}

export function orderedProjects(projects: Project[], order: ProjectOrder, query: string): Project[] {
  const term = normalizeQuery(query);
  const pinnedIds = new Set(order.pinnedIds);
  const manualRanks = new Map(normalizeManualIds(projects, order.manualIds).map((id, index) => [id, index]));
  return projects.map((project, index) => ({ project, index }))
    .filter(({ project }) => !term || projectMatchRank(project, term) !== null)
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

export function quickResumeCandidates(projects: Project[], query: string, pinnedIds: string[] = []): Project[] {
  const term = normalizeQuery(query);
  const ordered = orderedProjects(projects, { sort: "recent", manualIds: [], pinnedIds }, "");
  if (term) {
    // 同じ一致順位の中ではピン留めと再開順を維持する。
    return ordered
      .flatMap((project) => {
        const rank = projectMatchRank(project, term);
        return rank === null ? [] : [{ project, rank }];
      })
      .sort((a, b) => a.rank - b.rank)
      .map(({ project }) => project);
  }

  const lastResumed = projects.reduce<Project | undefined>((latest, project) => {
    if (project.lastResumedAt === null) return latest;
    return project.lastResumedAt > (latest?.lastResumedAt ?? -1) ? project : latest;
  }, undefined);
  return lastResumed
    ? [lastResumed, ...ordered.filter(({ id }) => id !== lastResumed.id)]
    : ordered;
}

export function moveProject(ids: string[], id: string, target: number): string[] {
  const index = ids.indexOf(id);
  if (index < 0 || target < 0 || target >= ids.length || index === target) return ids;
  const next = [...ids];
  next.splice(index, 1);
  next.splice(target, 0, id);
  return next;
}
