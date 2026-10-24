import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSettings } from "../hooks/useSettings";
import { saveSettings } from "../services/settings";
import { errorMessage } from "../services/projects";
import type { Editor, Settings } from "../types/settings";

function SettingsPage() {
  const { result, reload } = useSettings();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <section id="settings" aria-labelledby="settings-heading" className="px-6 py-8 lg:px-10">
      <p className="text-xs font-medium tracking-widest text-teal-300">PREFERENCES</p>
      <h1 ref={heading} id="settings-heading" tabIndex={-1} className="mt-3 text-2xl font-semibold">設定</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-400">すべてのプロジェクトで使う、再開時のデフォルト設定です。</p>
      {result.status === "loading" && <p role="status" className="mt-6 text-sm text-zinc-400">設定を読み込み中…</p>}
      {result.status === "error" && <div className="mt-6 rounded-xl border border-red-400/30 bg-red-400/5 p-5">
        <p role="alert" className="break-words text-sm leading-6 text-red-300">{result.message}</p>
        <button type="button" onClick={reload} className="mt-4 rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800">設定を再読み込み</button>
      </div>}
      {result.status === "ready" && <SettingsForm initial={result.settings} reload={reload} />}
    </section>
  );
}

function SettingsForm({ initial, reload }: { initial: Settings; reload: () => void }) {
  const [baseline, setBaseline] = useState(initial);
  const [editor, setEditor] = useState(initial.defaultEditor);
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
      const saved = await saveSettings(baseline, { defaultEditor: editor });
      setBaseline(saved);
      setEditor(saved.defaultEditor);
      setNotice("設定を保存しました。次の再開から反映されます。");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} aria-label="アプリ設定" aria-busy={pending} className="mt-8 max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <h2 className="text-lg font-medium">開発環境</h2>
      <fieldset disabled={pending} className="mt-5 space-y-5 disabled:opacity-60">
        <div>
          <label htmlFor="default-editor" className="mb-2 block text-sm text-zinc-300">デフォルトエディタ</label>
          <select id="default-editor" value={editor} onChange={(event) => { setEditor(event.target.value as Editor); setNotice(""); }} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm">
            <option value="vsCode">VS Code</option><option value="cursor">Cursor</option>
          </select>
          <p className="mt-3 text-sm leading-7 text-zinc-400">macOSにインストール済みのアプリを開きます。選択だけでは起動しません。</p>
          <p className="mt-2 text-xs leading-6 text-zinc-400">起動URLは各プロジェクトの詳細で設定できます。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="rounded-lg bg-teal-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-teal-200 disabled:cursor-wait">{pending ? "保存中…" : "設定を保存"}</button>
          <button type="button" onClick={reload} className="rounded-lg border border-zinc-600 px-4 py-2.5 text-sm hover:bg-zinc-800 disabled:cursor-wait">設定を再読み込み</button>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-red-300">{error}</p>}
      <p role="status" className="mt-4 text-sm text-teal-300">{notice}</p>
      <p className="mt-3 text-xs leading-6 text-zinc-400">再読み込みや画面移動で、未保存の選択は破棄されます。</p>
    </form>
  );
}

export default SettingsPage;
