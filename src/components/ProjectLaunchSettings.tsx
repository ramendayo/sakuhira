import { useSettings } from "../hooks/useSettings";
import { editorName } from "../types/settings";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { hasLaunchTarget, lastLaunchTargetMessage, setProjectAppLaunchTargets, setProjectLaunchUrl, supportsAppLaunchTargets } from "../services/launch";
import { errorMessage } from "../services/projects";
import type { AppLaunchTarget, Project } from "../types/project";
import ProjectAppLaunchTargets from "./ProjectAppLaunchTargets";

function EditorSetting() {
  const { result, reload } = useSettings();
  return <>
    {result.status === "ready" && <p className="mt-4 text-sm text-ink">エディタ：{editorName(result.settings.defaultEditor)}（アプリ設定）</p>}
    {result.status === "loading" && <p role="status" className="mt-4 text-sm text-muted">エディタ設定を読み込み中…</p>}
    {result.status === "error" && <div className="mt-4"><p role="alert" className="break-words text-sm text-danger">{result.message}</p><button type="button" onClick={reload} className="mt-2 button-quiet text-xs">エディタ設定を再読み込み</button></div>}
  </>;
}

function ProjectLaunchSettings({ project, onSaved }: { project: Project; onSaved: (project: Project) => void }) {
  const id = useId();
  const [baseline, setBaseline] = useState(project);
  const [url, setUrl] = useState(project.launchUrl ?? "");
  const [pending, setPending] = useState(false);
  const [appsBusy, setAppsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  function commit(updated: Project) {
    setBaseline(updated);
    onSaved(updated);
  }

  async function saveApps(targets: AppLaunchTarget[]) {
    if (!hasLaunchTarget(baseline.path, baseline.launchUrl, targets)) {
      throw new Error(lastLaunchTargetMessage);
    }
    commit(await setProjectAppLaunchTargets(baseline, targets));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || appsBusy) return;
    setNotice("");
    if (!hasLaunchTarget(baseline.path, url, baseline.appLaunchTargets)) {
      setError(lastLaunchTargetMessage);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const updated = await setProjectLaunchUrl(baseline, url);
      commit(updated);
      setUrl(updated.launchUrl ?? "");
      setNotice("起動設定を保存しました。");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} aria-busy={pending || appsBusy} className="panel">
      <h2 id={`${id}-heading`} className="section-title">起動設定</h2>
      {project.path ? <EditorSetting /> : <p className="mt-4 text-sm text-ink">プロジェクトフォルダが未設定のため、エディタは開きません。</p>}
      <form onSubmit={save}>
        <fieldset disabled={pending || appsBusy} className="mt-5 disabled:opacity-60">
          <label htmlFor={`${id}-url`} className="field-label">起動URL（任意）</label>
          <input id={`${id}-url`} type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://localhost:3000" aria-describedby={`${id}-hint`} className="field" />
          <p id={`${id}-hint`} className="mt-2 text-xs leading-6 text-muted">HTTP/HTTPSのURLを既定ブラウザで開きます。削除するには、空欄にして保存します。</p>
          <p className="mt-1 text-xs leading-6 text-muted">再開には保存済みの設定を使用します。</p>
          <button type="submit" className="mt-4 button-secondary">{pending ? "保存中…" : "起動設定を保存"}</button>
        </fieldset>
        {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-danger">{error}</p>}
        <p role="status" className="notice mt-3">{notice}</p>
      </form>
      {supportsAppLaunchTargets() && <ProjectAppLaunchTargets
        targets={baseline.appLaunchTargets ?? []}
        disabled={pending || appsBusy}
        onBusyChange={setAppsBusy}
        onChange={saveApps}
      />}
    </section>
  );
}

export default ProjectLaunchSettings;
