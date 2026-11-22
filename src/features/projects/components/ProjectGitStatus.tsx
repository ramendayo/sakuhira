import { useGitStatus } from "../hooks/useGitStatus";
import type { Project } from "../types/project";
import type { GitHead } from "../types/git";

function headLabel(head: GitHead): string {
  return head.kind === "branch" ? `ブランチ: ${head.name}${head.unborn ? "（初回コミット前）" : ""}` : `HEAD分離中: ${head.commit.slice(0, 7)}`;
}

function ProjectGitStatus({ project, compact = false }: { project: Project; compact?: boolean }) {
  if (project.path === null) return <section aria-label="Gitの状態" className={compact ? "git-compact" : "git-status"}><p className="text-xs leading-6 text-muted" title={compact ? "Git対象外（フォルダ未設定）" : undefined}>{compact ? "Git対象外（フォルダ未設定）" : "フォルダが未設定のため、Git情報はありません。"}</p></section>;
  return <FolderGitStatus projectId={project.id} projectName={project.name} path={project.path} compact={compact} />;
}

function FolderGitStatus({ projectId, projectName, path, compact }: { projectId: string; projectName: string; path: string; compact: boolean }) {
  const { result, refresh } = useGitStatus(projectId, path);
  if (compact) return <section aria-label="Gitの状態" className="git-compact">
    {result.status === "loading" && <p role="status" className="text-xs text-muted">Gitを確認中…</p>}
    {result.status === "error" && <p role="alert" className="text-xs text-danger" title={result.message}>{result.message}</p>}
    {result.status === "ready" && (result.data.kind === "notRepository" ? <p className="text-xs text-muted">Git管理外</p> : <>
      <p className="text-xs text-ink" title={headLabel(result.data.head)} aria-label={headLabel(result.data.head)}>{result.data.head.kind === "branch" ? `${result.data.head.name}${result.data.head.unborn ? "（初回コミット前）" : ""}` : result.data.head.commit.slice(0, 7)}</p>
      <p className={`text-xs ${result.data.changedFiles > 0 ? "text-warning" : "text-success"}`} title={`変更ファイル: ${result.data.changedFiles} 件`}>{result.data.changedFiles > 0 ? `変更 ${result.data.changedFiles}件` : "変更なし"}</p>
    </>)}
    <button type="button" aria-label={`${projectName}のGitを更新`} title="Gitを更新" onClick={refresh} disabled={result.status === "loading"} className="git-refresh button-quiet">↻</button>
  </section>;
  return (
    <section aria-label="Gitの状態" className="git-status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted">Gitの状態</span>
        <button type="button" onClick={refresh} disabled={result.status === "loading"} className="button-quiet text-xs">Gitを更新</button>
      </div>
      {result.status === "loading" && <p role="status" className="mt-3 text-sm text-muted">Gitを確認中…</p>}
      {result.status === "error" && <p role="alert" className="mt-3 break-words text-sm leading-6 text-danger">{result.message}</p>}
      {result.status === "ready" && (
        result.data.kind === "notRepository" ? (
          <p className="mt-3 text-sm text-muted">Git管理されていないフォルダです。</p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <p className="break-all font-mono text-ink">
              {headLabel(result.data.head)}
            </p>
            <p className={result.data.changedFiles > 0 ? "text-warning" : "text-success"}>
              {result.data.changedFiles > 0 ? "未コミットの変更あり" : "未コミットの変更なし"}
              <span className="ml-2">変更ファイル: {result.data.changedFiles} 件</span>
            </p>
            <p className="break-all text-xs leading-6 text-muted">対象リポジトリ: {result.data.rootPath}</p>
          </div>
        )
      )}
    </section>
  );
}

export default ProjectGitStatus;
