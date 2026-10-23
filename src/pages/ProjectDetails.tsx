import { useEffect, useRef, useState } from "react";
import ProjectForm from "../components/ProjectForm";
import { errorMessage, removeProject } from "../services/projects";
import type { Project } from "../types/project";

type ProjectDetailsProps = {
  project: Project;
  onBack: () => void;
  onUpdated: (project: Project) => void;
  onRemoved: (project: Project) => void;
};

function ProjectDetails({ project, onBack, onUpdated, onRemoved }: ProjectDetailsProps) {
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const cancelRemove = useRef<HTMLButtonElement>(null);

  const returnFocus = useRef<"edit" | "remove" | null>(null);

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (mode === "remove") cancelRemove.current?.focus();
    if (mode === "view") {
      // 編集・確認画面を閉じた後は、その操作の起点へ戻す。
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
    <section id="projects" aria-labelledby="detail-heading" className="px-6 py-8 lg:px-10">
      <button type="button" onClick={onBack} className="mb-6 rounded text-sm text-zinc-400 hover:text-zinc-100">
        ← プロジェクト一覧に戻る
      </button>
      <p className="text-xs font-medium tracking-widest text-teal-300">PROJECT DETAILS</p>
      <h1 id="detail-heading" ref={heading} tabIndex={-1} className="mt-3 break-words text-2xl font-semibold">
        {project.name}
      </h1>
      <p role="status" className="mt-4 text-sm text-teal-300">{notice}</p>

      {mode === "edit" ? (
        <div className="mt-6">
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
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-medium">基本情報</h2>
          <dl className="mt-5 space-y-5">
            <div>
              <dt className="text-sm text-zinc-400">プロジェクト名</dt>
              <dd className="mt-2 break-words text-sm">{project.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-400">フォルダ</dt>
              <dd className="mt-2 break-all font-mono text-sm leading-6">{project.path}</dd>
            </div>
          </dl>
          {mode === "view" && (
            <div className="mt-6 flex flex-wrap gap-3 border-t border-zinc-800 pt-5">
              <button type="button" ref={editButton} onClick={() => {
                returnFocus.current = "edit";
                setMode("edit");
                setNotice("");
              }} className="rounded-lg border border-zinc-600 px-4 py-2.5 text-sm hover:bg-zinc-800">編集する</button>
              <button type="button" ref={removeButton} onClick={() => {
                returnFocus.current = "remove";
                setMode("remove");
                setError(null);
                setNotice("");
              }} className="rounded-lg border border-red-400/30 px-4 py-2.5 text-sm text-red-300 hover:bg-red-400/10">登録を解除</button>
            </div>
          )}
        </div>
      )}

      {mode === "remove" && (
        <section aria-labelledby="removal-heading" aria-busy={pending} className="mt-6 rounded-xl border border-red-400/30 bg-red-400/5 p-6">
          <h2 id="removal-heading" className="text-lg font-medium">登録を解除しますか？</h2>
          <p className="mt-3 break-words text-sm leading-7 text-zinc-300">
            「{project.name}」をReentryの一覧から削除します。フォルダとその中のファイルは削除されません。
          </p>
          <fieldset disabled={pending} className="mt-5 flex flex-wrap gap-3 disabled:opacity-60">
            <button type="button" ref={cancelRemove} onClick={() => setMode("view")} className="rounded-lg border border-zinc-600 px-4 py-2.5 text-sm hover:bg-zinc-800 disabled:cursor-wait">キャンセル</button>
            <button type="button" onClick={confirmRemoval} className="rounded-lg bg-red-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-red-200 disabled:cursor-wait">
              {pending ? "解除中…" : "登録解除を確定"}
            </button>
          </fieldset>
          {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-red-300">{error}</p>}
        </section>
      )}
    </section>
  );
}

export default ProjectDetails;
