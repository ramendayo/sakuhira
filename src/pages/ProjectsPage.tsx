import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Icon from "../components/Icon";
import ProjectCollection from "../components/ProjectCollection";
import ProjectViewControls from "../components/ProjectViewControls";
import { useProjectPresentation } from "../hooks/useProjectPresentation";
import ProjectDetails from "./ProjectDetails";
import ProjectForm from "../components/ProjectForm";
import { useProjects } from "../hooks/useProjects";
import { moveProject, normalizeManualIds, orderedProjects } from "../utils/projectOrder";
import { projectSortLabels } from "../types/settings";
import type { Project } from "../types/project";

type ProjectsPageProps = {
  selectedId: string | null;
  onSelect: Dispatch<SetStateAction<string | null>>;
};

function ProjectsPage({ selectedId, onSelect }: ProjectsPageProps) {
  const { projects, status, error, retry, append, replace, remove, recordResumed } = useProjects();
  const presentation = useProjectPresentation();
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const searchTerm = query.trim().toLowerCase();
  const visibleProjects = orderedProjects(projects, presentation.order, query);
  const manualIds = normalizeManualIds(projects, presentation.order.manualIds);
  const pinnedIds = new Set(presentation.order.pinnedIds);

  async function move(id: string, target: number) {
    // 表示位置にはピン留めが反映されるため、保存順での位置はIDから求める。
    const targetIndex = manualIds.indexOf(visibleProjects[target].id);
    return presentation.saveOrder({ ...presentation.order, manualIds: moveProject(manualIds, id, targetIndex) });
  }

  function togglePin(id: string) {
    const next = projects.filter((project) =>
      project.id === id ? !pinnedIds.has(id) : pinnedIds.has(project.id),
    ).map((project) => project.id);
    return presentation.saveOrder({ ...presentation.order, pinnedIds: next });
  }

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
    void presentation.saveOrder({ ...presentation.order, manualIds: [project.id, ...manualIds] });
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
        void presentation.saveOrder({
          ...presentation.order,
          manualIds: manualIds.filter((id) => id !== project.id),
          pinnedIds: presentation.order.pinnedIds?.filter((id) => id !== project.id),
        });
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
              名前を選ぶと詳細を確認できます。
            </p>
          </div>
          <button
            type="button"
            ref={addButton}
            disabled={status !== "ready" || presentation.disabled}
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
            <div className="project-toolbar mb-5">
              <div className="project-search">
                <label htmlFor="project-search" className="field-label">プロジェクトを検索</label>
                <div className="flex flex-wrap gap-3">
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"><Icon name="search" /></span>
                    <input id="project-search" ref={searchInput} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名前・フォルダパスで検索" aria-controls="project-results" className="field pl-10" />
                  </div>
                  {query !== "" && <button type="button" onClick={clearSearch} className="button-secondary">検索をクリア</button>}
                </div>
              </div>
              <div className="project-view-options">
                <ProjectViewControls view={presentation.view} sort={presentation.order.sort} disabled={presentation.disabled || showForm} onChange={presentation.save} onSortChange={(sort) => { void presentation.saveOrder({ ...presentation.order, sort, manualIds }); }} />
                {presentation.pending && <p role="status" className="sr-only">表示設定を保存中…</p>}
                {presentation.failure && <div className="mt-3 rounded-lg border border-danger-line bg-danger-soft p-3">
                  <p role="alert" className="text-sm text-danger">表示設定を保存できませんでした：{presentation.failure.message}</p>
                  <button type="button" disabled={presentation.disabled} onClick={presentation.retry} className="button-secondary mt-2">もう一度保存</button>
                </div>}
              </div>
            </div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-medium text-ink">すべてのプロジェクト</h2>
              <span className="text-xs text-muted">{projectSortLabels[presentation.order.sort]}</span>
              <span role="status" aria-atomic="true" className="badge">
                {searchTerm ? `${visibleProjects.length} / ${projects.length} 件` : `${projects.length} 件`}
              </span>
              <button type="button" onClick={retry} disabled={showForm || presentation.pending} className="ml-auto button-quiet">再読み込み</button>
            </div>

            {presentation.order.sort === "manual" && <p className="manual-order-help text-xs text-muted" id="manual-order-help">{searchTerm
              ? "検索中は移動できません。保存済みの配置で表示しています。"
              : "ハンドルをドラッグすると、ピン留めの有無が同じ項目の間で移動できます。キーボードでは矢印キーで前後、Home・Endでグループの先頭・末尾に移動します。"}</p>}
            <div id="project-results">
              {presentation.loading ? <p role="status" className="text-sm text-muted">表示設定を読み込み中…</p> : visibleProjects.length > 0 ? (
                <ProjectCollection projects={visibleProjects} view={presentation.view}
                  manual={presentation.order.sort === "manual"} moveDisabled={Boolean(searchTerm) || presentation.disabled || showForm}
                  pinnedIds={pinnedIds} pinDisabled={presentation.disabled || showForm} onTogglePin={togglePin}
                  onMove={move} onSelect={(id) => {
                  setShowForm(false);
                  onSelect(id);
                }} onResumed={recordResumed} />
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
