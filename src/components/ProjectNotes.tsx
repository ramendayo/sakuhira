import { useId, useState } from "react";
import type { FormEvent, Ref } from "react";
import { setProjectNotes } from "../services/notes";
import { errorMessage } from "../services/projects";
import type { Project, ProjectNotes as Notes } from "../types/project";

function NotesUpdatedAt({ notes }: { notes: Notes }) {
  if (notes.updatedAt === null) return <p className="text-xs text-zinc-400">メモはまだ保存されていません。</p>;
  const date = new Date(notes.updatedAt);
  return <p className="text-xs leading-6 text-zinc-400">メモ更新：<time dateTime={date.toISOString()}>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(date)}</time></p>;
}

export function ProjectNotesPreview({ project }: { project: Project }) {
  const { lastWork, nextTask } = project.notes;
  return (
    <div className="mt-5 space-y-3 border-t border-zinc-800 pt-4">
      {!lastWork.trim() && !nextTask.trim() ? <p className="text-xs text-zinc-400">作業メモはまだありません。</p> : <>
        {lastWork.trim() && <div><p className="text-xs text-zinc-400">前回の作業内容</p><p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm leading-6 text-zinc-300">{lastWork}</p></div>}
        {nextTask.trim() && <div><p className="text-xs text-zinc-400">次にやること</p><p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm leading-6 text-zinc-300">{nextTask}</p></div>}
      </>}
      {project.notes.updatedAt !== null && <NotesUpdatedAt notes={project.notes} />}
    </div>
  );
}

type ProjectNotesProps = {
  project: Project;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (project: Project) => void;
  editButtonRef?: Ref<HTMLButtonElement>;
};

function ProjectNotes({ project, editing, onEdit, onCancel, onSaved, editButtonRef }: ProjectNotesProps) {
  if (editing) return <NotesForm project={project} onSaved={onSaved} onCancel={onCancel} />;
  return (
    <section aria-label="作業メモ" className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">作業メモ</h2>
        <button type="button" ref={editButtonRef} onClick={onEdit} className="rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800">メモを編集</button>
      </div>
      <dl className="mt-5 space-y-5">
        <div><dt className="text-sm text-zinc-400">前回の作業内容</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{project.notes.lastWork.trim() ? project.notes.lastWork : "未記入"}</dd></div>
        <div><dt className="text-sm text-zinc-400">次にやること</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{project.notes.nextTask.trim() ? project.notes.nextTask : "未記入"}</dd></div>
      </dl>
      <div className="mt-5"><NotesUpdatedAt notes={project.notes} /></div>
    </section>
  );
}

function NotesForm({ project: initialProject, onSaved, onCancel }: { project: Project; onSaved: (project: Project) => void; onCancel: () => void }) {
  // 編集開始時の内容を基準にし、途中の別操作による更新を上書きしない。
  const [project] = useState(initialProject);
  const [lastWork, setLastWork] = useState(project.notes.lastWork);
  const [nextTask, setNextTask] = useState(project.notes.nextTask);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      onSaved(await setProjectNotes(project, lastWork, nextTask));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} aria-labelledby={`${id}-heading`} aria-busy={pending} className="mt-6 rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6">
      <h2 id={`${id}-heading`} className="text-lg font-medium">作業メモを編集</h2>
      <p className="mt-2 text-xs leading-6 text-zinc-400">各欄10,000文字まで。保存するまで一覧には反映されません。</p>
      <fieldset disabled={pending} className="mt-5 space-y-5 disabled:opacity-60">
        <div><label htmlFor={`${id}-last-work`} className="mb-2 block text-sm text-zinc-300">前回の作業内容</label><textarea id={`${id}-last-work`} autoFocus rows={5} maxLength={10000} value={lastWork} onChange={(event) => setLastWork(event.target.value)} className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm leading-7" /></div>
        <div><label htmlFor={`${id}-next-task`} className="mb-2 block text-sm text-zinc-300">次にやること</label><textarea id={`${id}-next-task`} rows={5} maxLength={10000} value={nextTask} onChange={(event) => setNextTask(event.target.value)} className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm leading-7" /></div>
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm hover:bg-zinc-800 disabled:cursor-wait">キャンセル</button>
          <button type="submit" className="rounded-lg bg-teal-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-teal-200 disabled:cursor-wait">{pending ? "保存中…" : "メモを保存"}</button>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-red-300">{error}</p>}
    </form>
  );
}

export default ProjectNotes;
