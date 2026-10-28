import Icon from "./Icon";
import LastResumedAt from "./LastResumedAt";
import ProjectGitStatus from "./ProjectGitStatus";
import { ProjectNotesPreview } from "./ProjectNotes";
import ResumeProject from "./ResumeProject";
import type { Project } from "../types/project";
import type { ProjectView } from "../types/settings";

type Props = {
  projects: Project[];
  view: ProjectView;
  onSelect: (id: string) => void;
  onResumed: (id: string, timestamp: number) => void;
};

export default function ProjectCollection({ projects, view, onSelect, onResumed }: Props) {
  const cards = view.layout === "cards";
  const small = cards && view.cardSize === "small";
  return <ul aria-label="登録済みプロジェクト" className={cards ? `project-collection cards-${view.cardSize}` : "project-collection project-list"}>
    {projects.map((project) => <li key={project.id} className={cards ? "project-item project-card" : "project-item project-row"}>
      <div className="item-identity">
        <span className="project-icon"><Icon name={project.path ? "folder" : "link"} className="size-5" /></span>
        <div className="item-name-path">
          <h3 className="project-title" aria-label={project.name}><button type="button" aria-label={`${project.name}の詳細を開く`} title={project.name} onClick={() => onSelect(project.id)} className="project-name-button">{project.name}</button></h3>
          {!small && <p className="item-path font-mono text-xs text-muted" title={project.path ?? project.launchUrl ?? undefined}>{project.path ?? project.launchUrl}</p>}
        </div>
      </div>
      {!small && <ProjectGitStatus project={project} compact />}
      <LastResumedAt timestamp={project.lastResumedAt} className="item-resumed text-xs leading-6 text-muted" />
      {cards && !small && <ProjectNotesPreview project={project} summary={view.cardSize === "standard"} />}
      <div className="item-actions"><ResumeProject project={project} onResumed={onResumed} /></div>
    </li>)}
  </ul>;
}
