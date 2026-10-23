function ProjectsPage() {
  return (
    <section id="projects" aria-labelledby="projects-heading">
      <header className="border-b border-zinc-800 px-6 py-8 lg:px-10">
        <p className="text-xs font-medium tracking-widest text-teal-300">YOUR WORKSPACE</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 id="projects-heading" className="text-2xl font-semibold tracking-tight">
              プロジェクト
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              作業環境とメモをまとめて、前回の続きから。
            </p>
          </div>
          <button
            type="button"
            disabled
            aria-describedby="registration-notice"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span aria-hidden="true" className="mr-2">+</span>
            プロジェクトを追加
          </button>
        </div>
      </header>

      <div className="px-6 py-8 lg:px-10">
        <div className="mb-5 flex items-center gap-3">
          <h2 className="text-sm font-medium text-zinc-300">すべてのプロジェクト</h2>
          <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">
            0 件
          </span>
        </div>

        <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-zinc-700/70 bg-zinc-900/30 px-6 py-14 text-center">
          <div className="max-w-sm">
            <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-teal-300">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-6"
              >
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                <path d="M9 14h6m-3-3v6" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-zinc-100">
              まだプロジェクトがありません
            </h3>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              プロジェクトを登録すると、Gitの状態や作業メモをここから確認できます。
            </p>
            <p id="registration-notice" className="mt-6 text-xs leading-6 text-zinc-500">
              プロジェクト登録は準備中です。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProjectsPage;
