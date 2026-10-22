import "./App.css";

function App() {
  return (
    <main className="flex min-h-screen items-center justify-center px-8 py-16">
      <div className="max-w-xl">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.25em] text-teal-400">
          Development workspace
        </p>
        <h1 className="text-5xl font-semibold tracking-tight text-zinc-100">
          Reentry
        </h1>
        <p className="mt-5 text-xl leading-relaxed text-zinc-300">
          Your development workspace, one click away.
        </p>
        <p className="mt-8 border-t border-zinc-800 pt-6 text-sm leading-7 text-zinc-400">
          開発環境と作業の続きを、ひとつの場所に。
          <br />
          これからプロジェクト管理機能を追加していきます。
        </p>
      </div>
    </main>
  );
}

export default App;
