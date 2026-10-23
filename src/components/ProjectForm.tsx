import { useId, useState } from "react";
import type { FormEvent } from "react";
import { addProject, errorMessage, selectProjectDirectory } from "../services/projects";
import type { Project } from "../types/project";

type ProjectFormProps = {
  onSaved: (project: Project) => void;
  onCancel: () => void;
};

function ProjectForm({ onSaved, onCancel }: ProjectFormProps) {
  const id = useId();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"picking" | "saving" | null>(null);

  async function chooseDirectory() {
    setError(null);
    setPending("picking");
    try {
      const selected = await selectProjectDirectory();
      if (selected) {
        setPath(selected.path);
        setName((current) => current.trim() ? current : selected.suggestedName);
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      setError("プロジェクト名を入力してください。");
      return;
    }
    setError(null);
    setPending("saving");
    try {
      const project = await addProject(name.trim(), path);
      onSaved(project);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby={`${id}-heading`}
      aria-busy={pending !== null}
      className="mb-8 rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6"
    >
      <h2 id={`${id}-heading`} className="text-lg font-medium">プロジェクトを登録</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        ローカルフォルダを選び、表示名を入力してください。
      </p>
      <fieldset disabled={pending !== null} className="mt-5 space-y-5 disabled:opacity-60">
        <div>
          <label htmlFor={`${id}-path`} className="mb-2 block text-sm text-zinc-300">フォルダ</label>
          <div className="flex flex-wrap gap-3">
            <input
              id={`${id}-path`}
              value={path}
              onChange={(event) => setPath(event.target.value)}
              required
              autoFocus
              placeholder="フォルダを選択、または絶対パスを入力"
              className="min-w-0 flex-[1_1_260px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm"
            />
            <button type="button" onClick={chooseDirectory} className="rounded-lg border border-zinc-600 px-4 py-2.5 text-sm hover:bg-zinc-800 disabled:cursor-wait">
              {pending === "picking" ? "選択中…" : "フォルダを選択"}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-name`} className="mb-2 block text-sm text-zinc-300">プロジェクト名</label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
            placeholder="例：Reentry"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm"
          />
        </div>
        <p className="text-xs leading-6 text-zinc-400">登録してもフォルダ内のファイルは変更されません。</p>
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm hover:bg-zinc-800 disabled:cursor-wait">キャンセル</button>
          <button type="submit" className="rounded-lg bg-teal-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-teal-200 disabled:cursor-wait">
            {pending === "saving" ? "保存中…" : "登録する"}
          </button>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-red-300">{error}</p>}
    </form>
  );
}

export default ProjectForm;
