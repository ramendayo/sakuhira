import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ProjectNotesPreview } from "../components/ProjectNotes";
import ResumeProject from "../components/ResumeProject";
import ProjectDetails from "./ProjectDetails";
import ProjectGitStatus from "../components/ProjectGitStatus";
import ProjectForm from "../components/ProjectForm";
import { useProjects } from "../hooks/useProjects";
import type { Project } from "../types/project";

type ProjectsPageProps = {
  selectedId: string | null;
  onSelect: Dispatch<SetStateAction<string | null>>;
};

function ProjectsPage({ selectedId, onSelect }: ProjectsPageProps) {
  const { projects, status, error, retry, append, replace, remove } = useProjects();
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);

  const listHeading = useRef<HTMLHeadingElement>(null);
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
      onRemoved={(project) => {
        remove(project.id);
        onSelect((current) => current === project.id ? null : current);
        setNotice(`「${project.name}」の登録を解除しました。`);
      }}
    />;
  }

  return (
    <section id="projects" aria-labelledby="projects-heading">
      <header className="border-b border-zinc-800 px-6 py-8 lg:px-10">
        <p className="text-xs font-medium tracking-widest text-teal-300">YOUR WORKSPACE</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 id="projects-heading" ref={listHeading} tabIndex={-1} className="text-2xl font-semibold tracking-tight">
              プロジェクト
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              作業環境とメモをまとめて、前回の続きから。
            </p>
          </div>
          <button
            type="button"
            ref={addButton}
            disabled={status !== "ready"}
            aria-expanded={showForm}
            aria-controls="project-registration"
            onClick={() => { setShowForm(true); setNotice(""); }}
            className="rounded-lg bg-teal-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true" className="mr-2">+</span>
            プロジェクトを追加
          </button>
        </div>
      </header>

      <div className="px-6 py-8 lg:px-10">
        <p role="status" className="mb-4 text-sm text-teal-300">{notice}</p>
        <div id="project-registration">
          {showForm && <ProjectForm onSaved={registered} onCancel={closeForm} />}
        </div>
        {status === "loading" && <p role="status" className="text-sm text-zinc-400">プロジェクトを読み込み中…</p>}
        {status === "error" && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-5">
            <p role="alert" className="break-words text-sm leading-6 text-red-300">{error}</p>
            <button type="button" onClick={retry} className="mt-4 rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800">再読み込み</button>
          </div>
        )}
        {status === "ready" && (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-medium text-zinc-300">すべてのプロジェクト</h2>
              <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">
                {projects.length} 件
              </span>
              <button type="button" onClick={retry} disabled={showForm} className="ml-auto rounded text-sm text-zinc-400 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50">再読み込み</button>
            </div>

            {projects.length > 0 ? (
              <ul className="grid gap-4 lg:grid-cols-2" aria-label="登録済みプロジェクト">
                {projects.map((project) => (
                  <li key={project.id} className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                    <h3 className="break-words text-lg font-medium">{project.name}</h3>
                    <p className="mt-3 break-all font-mono text-xs leading-6 text-zinc-400">{project.path}</p>
                    <ProjectNotesPreview project={project} />
                    <ResumeProject project={project} />
                    <ProjectGitStatus project={project} />
                    <button type="button" aria-label={`${project.name}の詳細を開く`} onClick={() => {
                      setShowForm(false);
                      onSelect(project.id);
                    }} className="mt-4 rounded text-sm font-medium text-teal-300 hover:text-teal-200">詳細を開く →</button>
                  </li>
                ))}
              </ul>
            ) : <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-zinc-700/70 bg-zinc-900/30 px-6 py-14 text-center">
              <div className="max-w-sm">
                <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-teal-300">
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
                <h3 className="text-lg font-medium text-zinc-100">
                  まだプロジェクトがありません
                </h3>
                <p className="mt-3 text-sm leading-7 text-zinc-400">
                  プロジェクトを登録すると、Gitの状態や作業メモをここから確認できます。
                </p>
                <p className="mt-6 text-xs leading-6 text-zinc-400">
                  「プロジェクトを追加」から、最初のフォルダを登録しましょう。
                </p>
              </div>
            </div>}
          </>
        )}
      </div>
    </section>
  );
}

export default ProjectsPage;
