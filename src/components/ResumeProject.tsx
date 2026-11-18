import { useState } from "react";
import Icon from "./Icon";
import { appLaunchTargetLabel, resumeProject } from "../services/launch";
import { errorMessage } from "../services/projects";
import type { Project } from "../types/project";
import type { LaunchOutcome, ResumeReport } from "../types/launch";

function Outcome({ name, result }: { name: string; result: LaunchOutcome }) {
  return result.status === "success"
    ? <p role="status" className="text-success">{name}：起動要求を送信しました。</p>
    : <p role="alert" className="text-danger">{name}：{result.message}</p>;
}

type ResumeProjectProps = { project: Project; onResumed?: (id: string, timestamp: number) => void };

function ResumeProject({ project, onResumed }: ResumeProjectProps) {
  // 保存済みの起動先が変わったら、以前の起動結果を持ち越さない。
  return <ResumeAction key={JSON.stringify({ ...project, lastResumedAt: null })} project={project} onResumed={onResumed} />;
}

function ResumeAction({ project, onResumed }: ResumeProjectProps) {
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<ResumeReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    if (pending) return;
    setPending(true);
    setReport(null);
    setError(null);
    try {
      const result = await resumeProject(project);
      setReport(result);
      if (result.history.status === "saved") onResumed?.(project.id, result.history.timestamp);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="resume-action" aria-busy={pending}>
      <button type="button" onClick={resume} disabled={pending} aria-label={`${project.name}を再開`} className="button-primary"><Icon name="play" />{pending ? "起動中…" : "再開"}</button>
      <div className="launch-results mt-3 space-y-2 break-words text-xs leading-6">
        {error && <p role="alert" className="text-danger">{error}</p>}
        {report && <>
          {report.editor ? <Outcome name={report.editorName} result={report.editor} /> : <p className="text-muted">フォルダ未設定のため、エディタは開きませんでした。</p>}
          {report.browser ? <Outcome name="ブラウザ" result={report.browser} /> : <p role="status" className="text-muted">URL未設定のため、ブラウザは開きませんでした。</p>}
          {report.apps?.map(({ target, outcome }, index) => (
            <Outcome key={index} name={appLaunchTargetLabel(target)} result={outcome} />
          ))}
          <p className="text-muted">起動先での読み込み完了は確認していません。</p>
          {report.history.status === "error" && <p role="alert" className="text-danger">最終再開日時を保存できませんでした：{report.history.message}</p>}
        </>}
      </div>
    </div>
  );
}

export default ResumeProject;
