import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import Icon from "../components/Icon";
import ProjectIcon from "../components/ProjectIcon";
import SettingsProvider from "../components/SettingsProvider";
import { useAppearance } from "../hooks/useAppearance";
import { useProjects } from "../hooks/useProjects";
import { useSettings } from "../hooks/useSettings";
import { resumeProject } from "../services/launch";
import { errorMessage } from "../services/projects";
import type { ResumeReport } from "../types/launch";
import type { Project } from "../types/project";
import { quickResumeCandidates } from "../utils/projectOrder";

type PendingAction = "resume" | "openReentry";

type SearchProps = {
  projects: Project[];
  pinnedIds?: string[];
  loading?: boolean;
  error?: string | null;
  actionErrors?: string[];
  pending?: PendingAction | null;
  onDismiss: () => void;
  onResume: (project: Project) => void;
  onOpenReentry: () => void;
};

export function QuickResumeSearch({ projects, pinnedIds, loading, error, actionErrors, pending, onDismiss, onResume, onOpenReentry }: SearchProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const composing = useRef(false);
  const selectedRow = useRef<HTMLLIElement>(null);
  const candidates = quickResumeCandidates(projects, query, pinnedIds);
  const selectedIndex = Math.max(0, candidates.findIndex((project) => project.id === selectedId));
  const selected = candidates[selectedIndex];

  useEffect(() => {
    selectedRow.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected?.id]);

  function resumeCandidate(project: Project) {
    if (pending) return;
    setSelectedId(project.id);
    onResume(project);
  }

  function isComposing(event: KeyboardEvent) {
    // WebKit can report the IME confirmation key after compositionend.
    return composing.current || event.nativeEvent.isComposing || event.keyCode === 229;
  }

  function handleEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !isComposing(event)) {
      event.preventDefault();
      onDismiss();
    }
  }

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (isComposing(event)) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!selected || pending) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const index = Math.max(0, Math.min(selectedIndex + direction, candidates.length - 1));
      setSelectedId(candidates[index].id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat && selected) resumeCandidate(selected);
    }
  }

  return (
    <main aria-label="クイック再開" onKeyDown={handleEscape} className="flex h-dvh min-h-0 flex-col bg-surface px-4 pt-4">
      <label htmlFor={`${id}-search`} className="sr-only">プロジェクトを検索</label>
      <div className="relative shrink-0">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"><Icon name="search" /></span>
        <input
          autoFocus
          id={`${id}-search`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={Boolean(selected)}
          aria-controls={`${id}-results`}
          aria-activedescendant={selected ? `${id}-option-${selectedIndex}` : undefined}
          placeholder="名前・フォルダパスで検索"
          autoComplete="off"
          readOnly={Boolean(pending)}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setSelectedId(null); }}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={handleSearchKey}
          className="field pl-10"
        />
      </div>
      {actionErrors && actionErrors.length > 0 && (
        <div role="alert" className="mt-2 max-h-28 shrink-0 space-y-1 overflow-y-auto break-words rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
          {actionErrors.map((message) => <p key={message}>{message}</p>)}
        </div>
      )}
      <div className="my-3 min-h-0 flex-1 overflow-y-auto">
        {error && <p role="alert" className="px-3 py-2 text-sm text-danger">{error}</p>}
        {loading ? <p role="status" className="px-3 py-2 text-sm text-muted">プロジェクトを読み込み中…</p> :
          !error && !selected && <p role="status" className="px-3 py-2 text-sm text-muted">
            {query.trim() ? "一致するプロジェクトがありません。" : "まだプロジェクトがありません。"}
          </p>}
        <ul id={`${id}-results`} role="listbox" aria-label="再開候補" className="space-y-1" hidden={!selected}>
          {candidates.map((project, index) => {
            const active = index === selectedIndex;
            const location = project.path ?? project.launchUrl;
            return (
              <li
                key={project.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active}
                aria-disabled={pending ? true : undefined}
                ref={active ? selectedRow : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => resumeCandidate(project)}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:bg-subtle aria-disabled:cursor-default aria-selected:border-accent aria-selected:bg-accent-soft"
              >
                <ProjectIcon path={project.path} appearance={project.icon} compact />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" title={project.name}>{project.name}</p>
                  <p className="truncate font-mono text-xs text-muted" title={location ?? undefined}>{location}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line py-2 text-xs text-muted">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span><kbd>↑↓</kbd> 選択</span>
          <span><kbd>Enter</kbd>／クリック 再開</span>
          <span><kbd>Esc</kbd> 閉じる</span>
          {pending && <span role="status">{pending === "resume" ? "起動中…" : "表示中…"}</span>}
        </div>
        <button type="button" className="ml-auto button-quiet" aria-disabled={pending ? true : undefined} onClick={onOpenReentry}>
          sakuhiraを開く <span aria-hidden="true">↗</span>
        </button>
      </footer>
    </main>
  );
}

function resumeErrorMessages(report: ResumeReport): string[] {
  const errors: string[] = [];
  if (report.editor?.status === "error") errors.push(`${report.editorName}：${report.editor.message}`);
  if (report.browser?.status === "error") errors.push(`ブラウザ：${report.browser.message}`);
  if (report.history.status === "error") errors.push(`最終再開日時を保存できませんでした：${report.history.message}`);
  return errors;
}

function QuickResumeContent() {
  const { projects, status, error } = useProjects();
  const { result } = useSettings();
  const appearance = useAppearance();
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const running = useRef(false);
  const pinnedIds = result.status === "ready" ? result.settings.projectOrder.pinnedIds : undefined;

  async function runAction(action: PendingAction, run: () => Promise<string[]>) {
    if (running.current) return;
    running.current = true;
    setPending(action);
    setActionErrors([]);
    try {
      setActionErrors(await run());
    } catch (error) {
      setActionErrors([errorMessage(error)]);
    } finally {
      running.current = false;
      setPending(null);
    }
  }

  return <QuickResumeSearch
    projects={status === "ready" && result.status !== "loading" ? projects : []}
    pinnedIds={pinnedIds}
    loading={status === "loading" || result.status === "loading"}
    error={error ?? appearance.loadError ?? appearance.error ?? dismissError}
    actionErrors={actionErrors}
    pending={pending}
    onResume={(project) => { void runAction("resume", async () => resumeErrorMessages(await resumeProject(project))); }}
    onOpenReentry={() => {
      void runAction("openReentry", async () => {
        await invoke("open_reentry");
        return [];
      });
    }}
    onDismiss={() => { void invoke("close_quick_resume").catch((error) => setDismissError(errorMessage(error))); }}
  />;
}

export default function QuickResumeWindow() {
  return <SettingsProvider><QuickResumeContent /></SettingsProvider>;
}
