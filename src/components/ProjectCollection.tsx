import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon";
import ProjectIcon from "./ProjectIcon";
import LastResumedAt from "./LastResumedAt";
import ProjectGitStatus from "./ProjectGitStatus";
import { ProjectNotesPreview } from "./ProjectNotes";
import ResumeProject from "./ResumeProject";
import { projectLaunchLocation } from "../services/launch";
import type { Project } from "../types/project";
import type { ProjectView } from "../types/settings";

type Props = {
  projects: Project[];
  view: ProjectView;
  manual?: boolean;
  moveDisabled?: boolean;
  onMove?: (id: string, target: number) => Promise<boolean>;
  pinnedIds?: ReadonlySet<string>;
  pinDisabled?: boolean;
  onTogglePin?: (id: string) => Promise<boolean>;
  onSelect: (id: string) => void;
  onResumed: (id: string, timestamp: number) => void;
};

const noPins: ReadonlySet<string> = new Set();

function ProjectLocation({ project, compact }: { project: Project; compact: boolean }) {
  const location = projectLaunchLocation(project, compact);
  return location && <p className="item-path font-mono text-xs text-muted" title={location}>{location}</p>;
}

export default function ProjectCollection({
  projects, view, onSelect, onResumed, manual = false, moveDisabled = false, onMove,
  pinnedIds = noPins, pinDisabled = false, onTogglePin,
}: Props) {
  const cards = view.layout === "cards";
  const small = cards && view.cardSize === "small";
  const collection = useRef<HTMLUListElement>(null);
  const dragId = useRef<string | null>(null);
  const pinFocus = useRef<{ id: string; wasPinned: boolean; button: HTMLButtonElement } | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const hintId = useId();
  const canMove = manual && !moveDisabled && Boolean(onMove);
  const pinnedCount = projects.filter(({ id }) => pinnedIds.has(id)).length;
  useEffect(() => { dragId.current = null; setDropId(null); }, [canMove, view.layout, view.cardSize]);

  useLayoutEffect(() => {
    const pending = pinFocus.current;
    if (!pending || pending.wasPinned === pinnedIds.has(pending.id)) return;
    // ピン解除でDOM上の位置が変わっても、キーボード操作を続けられるようにする。
    if (document.activeElement === document.body) pending.button.focus();
    pinFocus.current = null;
  }, [pinnedIds]);

  async function togglePin(id: string, button: HTMLButtonElement) {
    if (pinDisabled || !onTogglePin) return;
    if (document.activeElement === button) {
      pinFocus.current = { id, wasPinned: pinnedIds.has(id), button };
    }
    if (!await onTogglePin(id)) pinFocus.current = null;
  }

  function canMoveTo(sourceId: string, targetId: string) {
    return canMove && sourceId !== targetId && pinnedIds.has(sourceId) === pinnedIds.has(targetId);
  }

  async function move(id: string, target: number) {
    const destination = projects[target];
    if (!destination || !canMoveTo(id, destination.id)) return;
    const origin = document.activeElement;
    const project = projects.find((item) => item.id === id)!;
    const saved = await onMove!(id, target);
    setAnnouncement(saved ? `「${project.name}」を${projects.length}件中${target + 1}番目に移動しました。` : "");
    if (document.activeElement === document.body || document.activeElement === origin) {
      Array.from(collection.current?.querySelectorAll<HTMLButtonElement>(".reorder-handle") ?? []).find((button) => button.dataset.projectId === id)?.focus();
    }
  }

  return <>
    <p id={hintId} className="sr-only">ピン留めの有無が同じ項目の間で、ドラッグまたは矢印キーで移動。Home・Endでグループの先頭・末尾に移動。検索中と保存中は移動できません。</p>
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>
    <ul ref={collection} aria-label="登録済みプロジェクト" className={cards ? `project-collection cards-${view.cardSize}` : "project-collection project-list"}>
    {projects.map((project, index) => <li key={project.id} className={`${cards ? "project-item project-card" : "project-item project-row"}${dropId === project.id ? " drop-target" : ""}`}
      onDragOver={(event) => {
        if (!dragId.current || !canMoveTo(dragId.current, project.id)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropId(project.id);
      }}
      onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropId(null); }}
      onDrop={(event) => {
        if (!canMove || !dragId.current) return;
        event.preventDefault();
        const id = dragId.current;
        dragId.current = null;
        setDropId(null);
        void move(id, index);
      }}>
      {manual && <button type="button" className="reorder-handle" data-project-id={project.id}
        aria-label={`${project.name}の順序を変更（${index + 1}/${projects.length}）`} aria-describedby={hintId}
        aria-disabled={!canMove} draggable={canMove}
        title="ドラッグまたは矢印キーで移動"
        onDragStart={(event) => {
          if (!canMove) { event.preventDefault(); return; }
          dragId.current = project.id;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", project.id);
        }}
        onDragEnd={() => { dragId.current = null; setDropId(null); }}
        onKeyDown={(event) => {
          const pinned = pinnedIds.has(project.id);
          const target = ({
            ArrowUp: index - 1, ArrowLeft: index - 1, ArrowDown: index + 1, ArrowRight: index + 1,
            Home: pinned ? 0 : pinnedCount, End: pinned ? pinnedCount - 1 : projects.length - 1,
          } as Record<string, number>)[event.key];
          if (target === undefined) return;
          event.preventDefault();
          void move(project.id, target);
        }}>
        <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="currentColor">{[5, 10, 15].flatMap((y) => [7, 13].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />))}</svg>
      </button>}
      <div className="item-identity">
        <ProjectIcon path={project.path} appearance={project.icon} compact={small || !cards} />
        <div className="item-name-path">
          <h3 className="project-title" aria-label={project.name}><button type="button" aria-label={`${project.name}の詳細を開く`} title={project.name} onClick={() => onSelect(project.id)} className="project-name-button">{project.name}</button></h3>
          <ProjectLocation project={project} compact={small} />
        </div>
        {onTogglePin && <button
          type="button"
          className="project-pin"
          aria-label={`${project.name}のピン留め`}
          aria-pressed={pinnedIds.has(project.id)}
          aria-disabled={pinDisabled}
          title={pinnedIds.has(project.id) ? "ピン留めを解除" : "ピン留め"}
          onClick={(event) => { void togglePin(project.id, event.currentTarget); }}
        >
          <Icon name="pin" />
        </button>}
      </div>
      {!small && <ProjectGitStatus project={project} compact />}
      <LastResumedAt timestamp={project.lastResumedAt} className="item-resumed text-xs leading-6 text-muted" />
      {cards && !small && <ProjectNotesPreview project={project} summary={view.cardSize === "standard"} />}
      <div className="item-actions"><ResumeProject project={project} onResumed={onResumed} /></div>
    </li>)}
  </ul></>;
}
