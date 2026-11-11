import { useEffect, useRef, useState } from "react";
import ProjectNotes from "../components/ProjectNotes";
import ResumeProject from "../components/ResumeProject";
import LastResumedAt from "../components/LastResumedAt";
import ProjectLaunchSettings from "../components/ProjectLaunchSettings";
import ProjectGitStatus from "../components/ProjectGitStatus";
import ProjectForm from "../components/ProjectForm";
import ProjectIcon from "../components/ProjectIcon";
import { errorMessage, removeProject } from "../services/projects";
import type { Project } from "../types/project";

type ProjectDetailsProps = {
  project: Project;
  onBack: () => void;
  onUpdated: (project: Project) => void;
  onResumed: (id: string, timestamp: number) => void;
  onRemoved: (project: Project) => void;
};

function ProjectDetails({ project, onBack, onUpdated, onRemoved, onResumed }: ProjectDetailsProps) {
  const [mode, setMode] = useState<"view" | "edit" | "remove" | "notes">("view");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const notesEditButton = useRef<HTMLButtonElement>(null);
  const cancelRemove = useRef<HTMLButtonElement>(null);

  const returnFocus = useRef<"edit" | "remove" | "notes" | null>(null);

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (mode === "remove") cancelRemove.current?.focus();
    if (mode === "view") {
      // 編集・確認画面を閉じた後は、その操作の起点へ戻す。
      if (returnFocus.current === "notes") notesEditButton.current?.focus();
      if (returnFocus.current === "edit") editButton.current?.focus();
      if (returnFocus.current === "remove") removeButton.current?.focus();
    }
  }, [mode]);
  async function confirmRemoval() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await removeProject(project);
      onRemoved(project);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="projects" aria-labelledby="detail-heading" className="page-shell">
      <button type="button" onClick={onBack} className="mb-6 button-quiet">
        ← プロジェクト一覧に戻る
      </button>
      <header className="border-b border-line pb-7">
        <div className="flex items-center gap-3">
          <ProjectIcon path={project.path} appearance={project.icon} />
          <h1 id="detail-heading" ref={heading} tabIndex={-1} className="page-heading min-w-0 break-words">{project.name}</h1>
        </div>
        <LastResumedAt timestamp={project.lastResumedAt} />
        {mode === "view" && <div className="mt-5"><ResumeProject project={project} onResumed={onResumed} /></div>}
      </header>
      <p role="status" className="notice mt-4">{notice}</p>

      <div className={mode === "view" ? "detail-grid" : "mt-6 space-y-6"}>
        {mode === "edit" ? (
          <div>
            <ProjectForm
              project={project}
              onSaved={(updated) => {
                onUpdated(updated);
                setMode("view");
                setNotice("変更を保存しました。");
              }}
              onCancel={() => setMode("view")}
            />
          </div>
        ) : (
          <div className="panel">
            <h2 className="section-title">基本情報</h2>
            <dl className="mt-5 space-y-5">
              <div>
                <dt className="text-sm text-muted">プロジェクト名</dt>
                <dd className="mt-2 break-words text-sm">{project.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">フォルダ</dt>
                <dd className="mt-2 break-all font-mono text-sm leading-6">{project.path ?? "未設定（URLのみ・ブラウザで再開）"}</dd>
              </div>
            </dl>
            {mode === "view" && (
              <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5">
                <button type="button" ref={editButton} onClick={() => {
                  returnFocus.current = "edit";
                  setMode("edit");
                  setNotice("");
                }} className="button-secondary">編集する</button>
                <button type="button" ref={removeButton} onClick={() => {
                  returnFocus.current = "remove";
                  setMode("remove");
                  setError(null);
                  setNotice("");
                }} className="button-danger">登録を解除</button>
              </div>
            )}
          </div>
        )}

        {(mode === "view" || mode === "notes") && <ProjectNotes
          project={project}
          editing={mode === "notes"}
          editButtonRef={notesEditButton}
          onEdit={() => { returnFocus.current = "notes"; setMode("notes"); setNotice(""); }}
          onCancel={() => setMode("view")}
          onSaved={(updated) => { onUpdated(updated); setMode("view"); setNotice("作業メモを保存しました。"); }}
        />}

        {mode === "view" && <ProjectLaunchSettings project={project} onSaved={onUpdated} />}

        {mode === "view" && <div className="detail-git panel"><ProjectGitStatus project={project} /></div>}

        {mode === "remove" && (
          <section aria-labelledby="removal-heading" aria-busy={pending} className="rounded-xl border border-danger-line bg-danger-soft p-6">
            <h2 id="removal-heading" className="section-title">登録を解除しますか？</h2>
            <p className="mt-3 break-words text-sm leading-7 text-ink">
              「{project.name}」をReentryの一覧から削除します。フォルダとその中のファイルは削除されません。
            </p>
            <fieldset disabled={pending} className="mt-5 flex flex-wrap gap-3 disabled:opacity-60">
              <button type="button" ref={cancelRemove} onClick={() => setMode("view")} className="button-secondary">キャンセル</button>
              <button type="button" onClick={confirmRemoval} className="button-danger-solid">
                {pending ? "解除中…" : "登録解除を確定"}
              </button>
            </fieldset>
            {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-danger">{error}</p>}
          </section>
        )}
      </div>
    </section>
  );
}

export default ProjectDetails;
