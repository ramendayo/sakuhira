import { useGitStatus } from "../hooks/useGitStatus";
import type { Project } from "../types/project";

function ProjectGitStatus({ project }: { project: Project }) {
  if (project.path === null) return <section aria-label="Gitの状態" className="mt-5 border-t border-zinc-800 pt-4"><p className="text-sm text-zinc-400">URLのみのプロジェクトにはGit情報がありません。</p></section>;
  return <FolderGitStatus projectId={project.id} path={project.path} />;
}

function FolderGitStatus({ projectId, path }: { projectId: string; path: string }) {
  const { result, refresh } = useGitStatus(projectId, path);
  return (
    <section aria-label="Gitの状態" className="mt-5 border-t border-zinc-800 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-medium text-zinc-400">Gitの状態</span>
        <button type="button" onClick={refresh} disabled={result.status === "loading"} className="rounded text-xs text-zinc-400 hover:text-zinc-100 disabled:cursor-wait disabled:opacity-50">Gitを更新</button>
      </div>
      {result.status === "loading" && <p role="status" className="mt-3 text-sm text-zinc-400">Gitを確認中…</p>}
      {result.status === "error" && <p role="alert" className="mt-3 break-words text-sm leading-6 text-red-300">{result.message}</p>}
      {result.status === "ready" && (
        result.data.kind === "notRepository" ? (
          <p className="mt-3 text-sm text-zinc-400">Git管理されていないフォルダです。</p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <p className="break-all font-mono text-zinc-200">
              {result.data.head.kind === "branch"
                ? `ブランチ: ${result.data.head.name}${result.data.head.unborn ? "（初回コミット前）" : ""}`
                : `HEAD分離中: ${result.data.head.commit.slice(0, 7)}`}
            </p>
            <p className={result.data.changedFiles > 0 ? "text-amber-300" : "text-teal-300"}>
              {result.data.changedFiles > 0 ? "未コミットの変更あり" : "未コミットの変更なし"}
              <span className="ml-2">変更ファイル: {result.data.changedFiles} 件</span>
            </p>
            <p className="break-all text-xs leading-6 text-zinc-400">対象リポジトリ: {result.data.rootPath}</p>
          </div>
        )
      )}
    </section>
  );
}

export default ProjectGitStatus;
