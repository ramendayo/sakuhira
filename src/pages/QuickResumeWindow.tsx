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

type SearchProps = {
  projects: Project[];
  pinnedIds?: string[];
  loading?: boolean;
  error?: string | null;
  resumeErrors?: string[];
  pending?: boolean;
  onDismiss: () => void;
  onResume: (project: Project) => void;
};

export function QuickResumeSearch({ projects, pinnedIds, loading, error, resumeErrors, pending, onDismiss, onResume }: SearchProps) {
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

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    // WebKit can report the IME confirmation key after compositionend.
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onDismiss();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!selected || pending) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const index = Math.max(0, Math.min(selectedIndex + direction, candidates.length - 1));
      setSelectedId(candidates[index].id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat && selected && !pending) {
        setSelectedId(selected.id);
        onResume(selected);
      }
    }
  }

  return (
    <main aria-label="クイック再開" className="flex h-dvh min-h-0 flex-col bg-surface px-4 pt-4">
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
          readOnly={pending}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setSelectedId(null); }}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={handleKey}
          className="field pl-10"
        />
      </div>
      {resumeErrors && resumeErrors.length > 0 && (
        <div role="alert" className="mt-2 max-h-28 shrink-0 space-y-1 overflow-y-auto break-words rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
          {resumeErrors.map((message) => <p key={message}>{message}</p>)}
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
                aria-disabled={pending || undefined}
                ref={active ? selectedRow : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { if (!pending) setSelectedId(project.id); }}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:bg-subtle aria-selected:border-accent aria-selected:bg-accent-soft"
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
      <footer className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-t border-line py-3 text-xs text-muted">
        <span><kbd>↑↓</kbd> 選択</span>
        <span><kbd>Enter</kbd> 再開</span>
        <span><kbd>Esc</kbd> 閉じる</span>
        {pending && <span role="status" className="ml-auto">起動中…</span>}
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
  const [resumeErrors, setResumeErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const launching = useRef(false);
  const pinnedIds = result.status === "ready" ? result.settings.projectOrder.pinnedIds : undefined;

  async function resume(project: Project) {
    if (launching.current) return;
    launching.current = true;
    setPending(true);
    setResumeErrors([]);
    try {
      const report = await resumeProject(project);
      setResumeErrors(resumeErrorMessages(report));
    } catch (error) {
      setResumeErrors([errorMessage(error)]);
    } finally {
      launching.current = false;
      setPending(false);
    }
  }

  return <QuickResumeSearch
    projects={status === "ready" && result.status !== "loading" ? projects : []}
    pinnedIds={pinnedIds}
    loading={status === "loading" || result.status === "loading"}
    error={error ?? appearance.loadError ?? appearance.error ?? dismissError}
    resumeErrors={resumeErrors}
    pending={pending}
    onResume={resume}
    onDismiss={() => { void invoke("close_quick_resume").catch((error) => setDismissError(errorMessage(error))); }}
  />;
}

export default function QuickResumeWindow() {
  return <SettingsProvider><QuickResumeContent /></SettingsProvider>;
}
