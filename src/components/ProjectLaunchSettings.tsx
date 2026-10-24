import { useId, useState } from "react";
import type { FormEvent } from "react";
import { setProjectLaunchUrl } from "../services/launch";
import { errorMessage } from "../services/projects";
import type { Project } from "../types/project";

function ProjectLaunchSettings({ project, onSaved }: { project: Project; onSaved: (project: Project) => void }) {
  const id = useId();
  const [baseline, setBaseline] = useState(project);
  const [url, setUrl] = useState(project.launchUrl ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice("");
    try {
      const updated = await setProjectLaunchUrl(baseline, url);
      setBaseline(updated);
      setUrl(updated.launchUrl ?? "");
      onSaved(updated);
      setNotice("起動設定を保存しました。");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} aria-labelledby={`${id}-heading`} aria-busy={pending} className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <h2 id={`${id}-heading`} className="text-lg font-medium">起動設定</h2>
      <p className="mt-4 text-sm text-zinc-300">エディタ：VS Code</p>
      <fieldset disabled={pending} className="mt-5 disabled:opacity-60">
        <label htmlFor={`${id}-url`} className="mb-2 block text-sm text-zinc-300">起動URL（任意）</label>
        <input id={`${id}-url`} type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://localhost:3000" aria-describedby={`${id}-hint`} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm" />
        <p id={`${id}-hint`} className="mt-2 text-xs leading-6 text-zinc-400">HTTP/HTTPSのURLを既定ブラウザで開きます。空欄で保存すると、エディタだけを開きます。</p>
        <p className="mt-1 text-xs leading-6 text-zinc-400">再開には保存済みの設定を使用します。</p>
        <button type="submit" className="mt-4 rounded-lg border border-zinc-600 px-4 py-2.5 text-sm hover:bg-zinc-800 disabled:cursor-wait">{pending ? "保存中…" : "起動設定を保存"}</button>
      </fieldset>
      {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-red-300">{error}</p>}
      <p role="status" className="mt-3 text-sm text-teal-300">{notice}</p>
    </form>
  );
}

export default ProjectLaunchSettings;
