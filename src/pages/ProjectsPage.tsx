import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import ProjectCollection from "../features/projects/components/ProjectCollection";
import ProjectViewControls, { ProjectCardSizeControl } from "../features/projects/components/ProjectViewControls";
import type { useProjectPresentation } from "../features/projects/hooks/useProjectPresentation";
import ProjectDetails from "./ProjectDetails";
import ProjectForm from "../features/projects/components/ProjectForm";
import type { useProjects } from "../features/projects/hooks/useProjects";
import { useShortcutIssues } from "../features/projects/hooks/useShortcutIssues";
import { orderedProjects } from "../features/projects/utils/projectOrder";
import { projectSortLabels } from "../types/settings";
import type { Project } from "../features/projects/types/project";

type ProjectsPageProps = {
  selectedId: string | null;
  projectState: ReturnType<typeof useProjects>;
  onOpenProject: (id: string) => void;
  onBack: () => void;
  onProjectRemoved: (id: string) => void;
  presentation: ReturnType<typeof useProjectPresentation>;
};

function ProjectsPage({ selectedId, projectState, onOpenProject, onBack, onProjectRemoved, presentation }: ProjectsPageProps) {
  const { projects, status, error, retry, append, replace, remove, recordResumed } = projectState;
  const shortcuts = useShortcutIssues();
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const searchTerm = query.trim().toLowerCase();
  const visibleProjects = orderedProjects(projects, presentation.order, query);
  const pinnedIds = new Set(presentation.order.pinnedIds);

  function move(id: string, target: number) {
    const anchor = visibleProjects[target].id;
    const placement = visibleProjects.findIndex((project) => project.id === id) < target ? "after" : "before";
    return presentation.saveOrder({ kind: "move", id, anchor, placement }, projects);
  }

  function togglePin(id: string) {
    return presentation.saveOrder({ kind: "pin", id, pinned: !pinnedIds.has(id) }, projects);
  }

  function clearSearch() {
    setQuery("");
    searchInput.current?.focus();
  }

  const listHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { listHeading.current?.focus(); }, []);
  const previousSelection = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId) setShowForm(false);
    if (previousSelection.current && !selectedId) listHeading.current?.focus();
    previousSelection.current = selectedId;
  }, [selectedId]);

  function closeForm() {
    setShowForm(false);
    addButton.current?.focus();
  }

  function registered(project: Project) {
    append(project);
    presentation.syncProjectOrder({ kind: "register", id: project.id });
    setQuery("");
    setNotice(`「${project.name}」を登録しました。`);
    closeForm();
  }

  const selected = projects.find((project) => project.id === selectedId);
  if (selected && status === "ready") {
    return <ProjectDetails
      key={selected.id}
      project={selected}
      shortcutIssue={shortcuts.issues.find((issue) => issue.projectId === selected.id)?.reason}
      onBack={onBack}
      onUpdated={(project) => {
        replace(project);
        shortcuts.refresh();
      }}
      onResumed={recordResumed}
      onRemoved={(project) => {
        remove(project.id);
        shortcuts.refresh();
        presentation.syncProjectOrder({ kind: "remove", id: project.id });
        onProjectRemoved(project.id);
        setNotice(`「${project.name}」の登録を解除しました。`);
      }}
    />;
  }

  return (
    <section id="projects" aria-labelledby="projects-heading" className="page-shell">
      {/* タイトル・追加・検索・表示切り替えを1行に並べる。検索と表示設定は一覧の読み込み後だけ出す。 */}
      <header className="project-toolbar mb-6">
        <h1 id="projects-heading" ref={listHeading} tabIndex={-1} className="page-heading project-page-title">
          プロジェクト
        </h1>
        <span aria-hidden="true" className="toolbar-divider" />
        <button
          type="button"
          ref={addButton}
          disabled={status !== "ready" || presentation.disabled}
          aria-expanded={showForm}
          aria-controls="project-registration"
          // 見た目は短く「追加」とし、読み上げ名は何を追加するか分かる形で保つ。
          aria-label="プロジェクトを追加"
          onClick={() => { setShowForm(true); setNotice(""); }}
          className="button-secondary"
        >
          <Icon name="plus" />
          追加
        </button>
        {status === "ready" && <>
          <div className="project-search">
            <label htmlFor="project-search" className="sr-only">プロジェクトを検索</label>
            <div className="flex items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"><Icon name="search" /></span>
                <input id="project-search" ref={searchInput} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名前・フォルダパスで検索" aria-controls="project-results" className="field pl-10" />
              </div>
              {query !== "" && <button type="button" onClick={clearSearch} className="button-secondary shrink-0">検索をクリア</button>}
            </div>
          </div>
          <ProjectViewControls view={presentation.view} sort={presentation.order.sort} disabled={presentation.disabled || showForm} onChange={presentation.saveView} onSortChange={(sort) => { void presentation.saveOrder({ kind: "sort", sort }); }} />
        </>}
      </header>

      <div>
        <p role="status" className="notice mb-6">{notice}</p>
        {status === "ready" && (shortcuts.error || shortcuts.issues.some((issue) => projects.some((project) => project.id === issue.projectId))) &&
          <div role="alert" className="mb-6 space-y-2 rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger">
            {shortcuts.error && <p>ショートカットの状態を読み込めません：{shortcuts.error}</p>}
            {projects.map((project) => {
              const issue = shortcuts.issues.find((issue) => issue.projectId === project.id);
              return issue && <p key={project.id} className="break-words">「{project.name}」のショートカット：{issue.reason}</p>;
            })}
          </div>}
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
            {(presentation.pending || presentation.failure) && <div className="mb-5">
              {presentation.pending && <p role="status" className="sr-only">表示設定を保存中…</p>}
              {presentation.failure && <div className="rounded-lg border border-danger-line bg-danger-soft p-3">
                <p role="alert" className="text-sm text-danger">表示設定を保存できませんでした：{presentation.failure.message}</p>
                <button type="button" disabled={presentation.disabled || showForm}
                  onClick={presentation.failure.recovery === "reload" ? retry : presentation.retry}
                  className="button-secondary mt-2">
                  {presentation.failure.recovery === "reload" ? "一覧を再読み込み" : "もう一度保存"}
                </button>
              </div>}
            </div>}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-medium text-ink">すべてのプロジェクト</h2>
              <span className="text-xs text-muted">{projectSortLabels[presentation.order.sort]}</span>
              <span role="status" aria-atomic="true" className="badge">
                {searchTerm ? `${visibleProjects.length} / ${projects.length} 件` : `${projects.length} 件`}
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <ProjectCardSizeControl view={presentation.view} disabled={presentation.disabled || showForm} onChange={presentation.saveView} />
                <button type="button" onClick={() => { retry(); shortcuts.refresh(); }} disabled={showForm || presentation.pending} className="button-quiet">再読み込み</button>
              </div>
            </div>

            {presentation.order.sort === "manual" && <p className="manual-order-help text-xs text-muted" id="manual-order-help">{searchTerm
              ? "検索中は移動できません。保存済みの配置で表示しています。"
              : "ハンドルをドラッグすると、ピン留めの有無が同じ項目の間で移動できます。キーボードでは矢印キーで前後、Home・Endでグループの先頭・末尾に移動します。"}</p>}
            <div id="project-results">
              {presentation.loading ? <p role="status" className="text-sm text-muted">表示設定を読み込み中…</p> : visibleProjects.length > 0 ? (
                <ProjectCollection projects={visibleProjects} view={presentation.view}
                  manual={presentation.order.sort === "manual"} moveDisabled={Boolean(searchTerm) || presentation.disabled || showForm}
                  pinnedIds={pinnedIds} pinDisabled={presentation.disabled || showForm} onTogglePin={togglePin}
                  onMove={move} editorName={presentation.editorLabel} onSelect={onOpenProject} onResumed={recordResumed} />
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
