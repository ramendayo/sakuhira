import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ProjectNotesPreview } from "../components/ProjectNotes";
import ResumeProject from "../components/ResumeProject";
import LastResumedAt from "../components/LastResumedAt";
import Icon from "../components/Icon";
import ProjectDetails from "./ProjectDetails";
import ProjectGitStatus from "../components/ProjectGitStatus";
import ProjectForm from "../components/ProjectForm";
import { useProjects } from "../hooks/useProjects";
import type { Project } from "../types/project";

type ProjectsPageProps = {
  selectedId: string | null;
  onSelect: Dispatch<SetStateAction<string | null>>;
};

function searchPriority(project: Project, term: string): number {
  const name = project.name.toLowerCase();
  if (name === term) return 0;
  if (name.startsWith(term)) return 1;
  if (name.includes(term)) return 2;
  if (project.path?.toLowerCase().includes(term)) return 3;
  return 4;
}

function ProjectsPage({ selectedId, onSelect }: ProjectsPageProps) {
  const { projects, status, error, retry, append, replace, remove, recordResumed } = useProjects();
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const searchTerm = query.trim().toLowerCase();
  // 同じ一致条件では、useProjectsが返す再開日時順を安定ソートで維持する。
  const visibleProjects = searchTerm
    ? projects.map((project) => ({ project, priority: searchPriority(project, searchTerm) }))
      .filter(({ priority }) => priority < 4)
      .sort((a, b) => a.priority - b.priority)
      .map(({ project }) => project)
    : projects;

  function clearSearch() {
    setQuery("");
    searchInput.current?.focus();
  }

  const listHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { listHeading.current?.focus(); }, []);
  const previousSelection = useRef<string | null>(null);
  useEffect(() => {
    if (previousSelection.current && !selectedId) listHeading.current?.focus();
    previousSelection.current = selectedId;
  }, [selectedId]);

  function closeForm() {
    setShowForm(false);
    addButton.current?.focus();
  }

  function registered(project: Project) {
    append(project);
    setQuery("");
    setNotice(`「${project.name}」を登録しました。`);
    closeForm();
  }

  const selected = projects.find((project) => project.id === selectedId);
  if (selected && status === "ready") {
    return <ProjectDetails
      key={selected.id}
      project={selected}
      onBack={() => onSelect(null)}
      onUpdated={replace}
      onResumed={recordResumed}
      onRemoved={(project) => {
        remove(project.id);
        onSelect((current) => current === project.id ? null : current);
        setNotice(`「${project.name}」の登録を解除しました。`);
      }}
    />;
  }

  return (
    <section id="projects" aria-labelledby="projects-heading" className="page-shell">
      <header className="mb-8 border-b border-line pb-7">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <h1 id="projects-heading" ref={listHeading} tabIndex={-1} className="page-heading">
              プロジェクト
            </h1>
            <p className="page-description">
              登録した作業環境を、ここから再開できます。
            </p>
          </div>
          <button
            type="button"
            ref={addButton}
            disabled={status !== "ready"}
            aria-expanded={showForm}
            aria-controls="project-registration"
            onClick={() => { setShowForm(true); setNotice(""); }}
            className="button-primary"
          >
            <Icon name="plus" />
            プロジェクトを追加
          </button>
        </div>
      </header>

      <div>
        <p role="status" className="notice mb-6">{notice}</p>
        <div id="project-registration">
          {showForm && <ProjectForm onSaved={registered} onCancel={closeForm} />}
        </div>
        {status === "loading" && <p role="status" className="text-sm text-muted">プロジェクトを読み込み中…</p>}
        {status === "error" && (
          <div className="rounded-xl border border-danger-line bg-danger-soft p-5">
            <p role="alert" className="break-words text-sm leading-6 text-danger">{error}</p>
            <button type="button" onClick={retry} className="mt-4 button-secondary">再読み込み</button>
          </div>
        )}
        {status === "ready" && (
          <>
            <div className="mb-6">
              <label htmlFor="project-search" className="field-label">プロジェクトを検索</label>
              <div className="flex flex-wrap gap-3">
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"><Icon name="search" /></span>
                  <input id="project-search" ref={searchInput} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名前・フォルダパスで検索" aria-controls="project-results" className="field pl-10" />
                </div>
                {query !== "" && <button type="button" onClick={clearSearch} className="button-secondary">検索をクリア</button>}
              </div>
            </div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-medium text-ink">すべてのプロジェクト</h2>
              <span className="text-xs text-muted">{searchTerm ? "名前の一致度順・同順位は最近再開した順" : "最近再開した順"}</span>
              <span role="status" aria-atomic="true" className="badge">
                {searchTerm ? `${visibleProjects.length} / ${projects.length} 件` : `${projects.length} 件`}
              </span>
              <button type="button" onClick={retry} disabled={showForm} className="ml-auto button-quiet">再読み込み</button>
            </div>

            <div id="project-results">
              {visibleProjects.length > 0 ? (
                <ul className="grid gap-5 lg:grid-cols-2" aria-label="登録済みプロジェクト">
                  {visibleProjects.map((project) => (
                    <li key={project.id} className="project-card">
                      <div className="flex items-start gap-3">
                        <span className="project-icon"><Icon name={project.path ? "folder" : "link"} className="size-5" /></span>
                        <div className="min-w-0 flex-1"><h3 className="project-title">{project.name}</h3><p className="mt-1 text-xs text-muted">{project.path ? "ローカルプロジェクト" : "URLのみ・ブラウザで再開"}</p></div>
                      </div>
                      <p className="mt-4 break-all font-mono text-xs leading-6 text-muted">{project.path ?? project.launchUrl}</p>
                      <LastResumedAt timestamp={project.lastResumedAt} />
                      <div className="card-actions mt-5 flex items-start gap-3">
                        <ResumeProject project={project} onResumed={recordResumed} />
                        <button type="button" aria-label={`${project.name}の詳細を開く`} onClick={() => {
                          setShowForm(false);
                          onSelect(project.id);
                        }} className="button-secondary">詳細を開く <span aria-hidden="true">→</span></button>
                      </div>
                      <ProjectNotesPreview project={project} />
                      <ProjectGitStatus project={project} />
                    </li>
                  ))}
                </ul>
              ) : projects.length > 0 ? <div className="empty-state">
                <h3 className="section-title">一致するプロジェクトがありません</h3>
                <p className="mt-3 text-sm leading-7 text-muted">検索語を変えるか、検索をクリアしてください。</p>
              </div> : <div className="empty-state flex min-h-80 items-center justify-center">
                <div className="max-w-sm">
                  <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border border-line bg-subtle text-success">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-6"
                    >
                      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                      <path d="M9 14h6m-3-3v6" />
                    </svg>
                  </div>
                  <h3 className="section-title text-ink">
                    まだプロジェクトがありません
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    プロジェクトを登録すると、Gitの状態や作業メモをここから確認できます。
                  </p>
                  <p className="mt-6 text-xs leading-6 text-muted">
                    「プロジェクトを追加」から、最初のフォルダを登録しましょう。
                  </p>
                </div>
              </div>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default ProjectsPage;
