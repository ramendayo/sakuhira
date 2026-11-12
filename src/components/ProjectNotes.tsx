import { useId, useState } from "react";
import LocalDateTime from "./LocalDateTime";
import NoteMarkdown from "./NoteMarkdown";
import type { FormEvent, Ref } from "react";
import { setProjectNotes } from "../services/notes";
import { errorMessage } from "../services/projects";
import type { Project, ProjectNotes as Notes } from "../types/project";

function NotesUpdatedAt({ notes }: { notes: Notes }) {
  if (notes.updatedAt === null) return <p className="text-xs text-muted">メモはまだ保存されていません。</p>;
  return <p className="text-xs leading-6 text-muted">メモ更新：<LocalDateTime timestamp={notes.updatedAt} /></p>;
}

export function ProjectNotesPreview({ project, summary = false }: { project: Project; summary?: boolean }) {
  const { lastWork, nextTask } = project.notes;
  if (summary) {
    const memo = nextTask.trim() ? nextTask : lastWork;
    return <p className="item-note-summary text-sm text-muted" title={memo || undefined}>{memo.trim() ? memo : "作業メモはまだありません。"}</p>;
  }
  return (
    <div className="notes-preview mt-5 space-y-3">
      {!lastWork.trim() && !nextTask.trim() ? <p className="text-xs text-muted">作業メモはまだありません。</p> : <>
        {nextTask.trim() && <div><p className="text-xs text-muted">次にやること</p><p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm font-medium leading-6 text-ink">{nextTask}</p></div>}
        {lastWork.trim() && <div><p className="text-xs text-muted">前回の作業内容</p><p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm leading-6 text-muted">{lastWork}</p></div>}
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
    <section aria-label="作業メモ" className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">作業メモ</h2>
        <button type="button" ref={editButtonRef} onClick={onEdit} className="button-secondary">メモを編集</button>
      </div>
      <div className="mt-5"><NotesContent lastWork={project.notes.lastWork} nextTask={project.notes.nextTask} /></div>
      <div className="mt-5"><NotesUpdatedAt notes={project.notes} /></div>
    </section>
  );
}

function NotesContent({ lastWork, nextTask }: Pick<Notes, "lastWork" | "nextTask">) {
  return (
    <dl className="space-y-5">
      <div>
        <dt className="text-sm text-muted">前回の作業内容</dt>
        <dd className="mt-2 text-sm leading-7"><NoteMarkdown source={lastWork} /></dd>
      </div>
      <div>
        <dt className="text-sm text-muted">次にやること</dt>
        <dd className="mt-2 text-sm leading-7"><NoteMarkdown source={nextTask} /></dd>
      </div>
    </dl>
  );
}

function NotesForm({ project: initialProject, onSaved, onCancel }: { project: Project; onSaved: (project: Project) => void; onCancel: () => void }) {
  // 編集開始時の内容を基準にし、途中の別操作による更新を上書きしない。
  const [project] = useState(initialProject);
  const [lastWork, setLastWork] = useState(project.notes.lastWork);
  const [nextTask, setNextTask] = useState(project.notes.nextTask);
  const [preview, setPreview] = useState(false);
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
    <form onSubmit={save} aria-labelledby={`${id}-heading`} aria-busy={pending} className="panel">
      <h2 id={`${id}-heading`} className="section-title">作業メモを編集</h2>
      <p className="mt-2 text-xs leading-6 text-muted">Markdownで入力できます（各欄10,000文字まで）。</p>
      <fieldset disabled={pending} className="mt-5 space-y-5 disabled:opacity-60">
        <div role="group" aria-label="作業メモの表示" className="segmented-control">
          <button type="button" aria-pressed={!preview} aria-controls={`${id}-content`} onClick={() => setPreview(false)}>編集</button>
          <button type="button" aria-pressed={preview} aria-controls={`${id}-content`} onClick={() => setPreview(true)}>プレビュー</button>
        </div>
        <div id={`${id}-content`}>
          <div hidden={preview} className="space-y-5">
            <div><label htmlFor={`${id}-last-work`} className="field-label">前回の作業内容</label><textarea id={`${id}-last-work`} autoFocus rows={5} maxLength={10000} value={lastWork} onChange={(event) => setLastWork(event.target.value)} className="field resize-y" /></div>
            <div><label htmlFor={`${id}-next-task`} className="field-label">次にやること</label><textarea id={`${id}-next-task`} rows={5} maxLength={10000} value={nextTask} onChange={(event) => setNextTask(event.target.value)} className="field resize-y" /></div>
          </div>
          {preview && <NotesContent lastWork={lastWork} nextTask={nextTask} />}
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className="button-secondary">キャンセル</button>
          <button type="submit" className="button-primary">{pending ? "保存中…" : "メモを保存"}</button>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-danger">{error}</p>}
    </form>
  );
}

export default ProjectNotes;
