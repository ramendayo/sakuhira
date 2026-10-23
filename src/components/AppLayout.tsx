import type { ReactNode } from "react";

type AppLayoutProps = {
  children: ReactNode;
};

function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-teal-300 px-4 py-3 text-zinc-950 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-10"
      >
        メインコンテンツへ移動
      </a>
      <aside className="flex flex-col border-b border-zinc-800 bg-zinc-950 p-6 md:min-h-screen md:border-r md:border-b-0">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-xl border border-teal-400/25 bg-teal-400/10 text-lg font-semibold text-teal-300"
          >
            R
          </span>
          <span className="text-xl font-semibold tracking-tight">Reentry</span>
        </div>

        <nav aria-label="メインナビゲーション" className="mt-8">
          <p className="mb-3 px-3 text-xs font-medium tracking-widest text-zinc-500">
            WORKSPACE
          </p>
          <a
            href="#projects"
            aria-current="page"
            className="flex items-center gap-3 rounded-lg border border-zinc-700/60 bg-zinc-800/70 px-3 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
          >
            <span aria-hidden="true" className="size-2 rounded-full bg-teal-300" />
            プロジェクト
          </a>
        </nav>

        <div className="mt-6 border-t border-zinc-800 pt-5 md:mt-auto">
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-500 disabled:cursor-not-allowed"
          >
            <span>設定</span>
            <span className="text-xs">準備中</span>
          </button>
          <p className="mt-5 hidden px-3 text-xs leading-6 text-zinc-500 md:block">
            Your development workspace,
            <br />
            one click away.
          </p>
        </div>
      </aside>

      <main id="main-content" tabIndex={-1} className="min-w-0">
        {children}
      </main>
    </div>
  );
}

export default AppLayout;
