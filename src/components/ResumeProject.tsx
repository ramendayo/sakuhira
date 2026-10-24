import { useState } from "react";
import { resumeProject } from "../services/launch";
import { errorMessage } from "../services/projects";
import type { Project } from "../types/project";
import type { LaunchOutcome, ResumeReport } from "../types/launch";

function Outcome({ name, result }: { name: string; result: LaunchOutcome }) {
  return result.status === "success"
    ? <p role="status" className="text-teal-300">{name}：起動要求を送信しました。</p>
    : <p role="alert" className="text-red-300">{name}：{result.message}</p>;
}

function ResumeProject({ project }: { project: Project }) {
  // 保存済みの起動先が変わったら、以前の起動結果を持ち越さない。
  return <ResumeAction key={JSON.stringify(project)} project={project} />;
}

function ResumeAction({ project }: { project: Project }) {
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<ResumeReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    if (pending) return;
    setPending(true);
    setReport(null);
    setError(null);
    try {
      setReport(await resumeProject(project));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-5" aria-busy={pending}>
      <button type="button" onClick={resume} disabled={pending} aria-label={`${project.name}を再開`} className="rounded-lg bg-teal-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-teal-200 disabled:cursor-wait disabled:opacity-60">{pending ? "起動中…" : "再開"}</button>
      <div className="mt-3 space-y-2 break-words text-xs leading-6">
        {error && <p role="alert" className="text-red-300">{error}</p>}
        {report && <>
          <Outcome name={report.editorName} result={report.editor} />
          {report.browser ? <Outcome name="ブラウザ" result={report.browser} /> : <p role="status" className="text-zinc-400">URL未設定のため、ブラウザは開きませんでした。</p>}
          <p className="text-zinc-400">起動先での読み込み完了は確認していません。</p>
        </>}
      </div>
    </div>
  );
}

export default ResumeProject;
