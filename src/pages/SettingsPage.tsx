import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSettings } from "../hooks/useSettings";
import { saveSettings } from "../services/settings";
import { errorMessage } from "../services/projects";
import type { Editor, Settings, ThemePreference } from "../types/settings";

function SettingsPage() {
  const { result, reload, replace } = useSettings();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <section id="settings" aria-labelledby="settings-heading" className="page-shell">
      <header className="border-b border-line pb-7">
        <h1 ref={heading} id="settings-heading" tabIndex={-1} className="page-heading">設定</h1>
        <p className="page-description">アプリの表示と、プロジェクト再開時の設定です。</p>
      </header>
      {result.status === "loading" && <p role="status" className="mt-6 text-sm text-muted">設定を読み込み中…</p>}
      {result.status === "error" && <div className="mt-6 rounded-xl border border-danger-line bg-danger-soft p-5">
        <p role="alert" className="break-words text-sm leading-6 text-danger">{result.message}</p>
        <button type="button" onClick={reload} className="mt-4 button-secondary">設定を再読み込み</button>
      </div>}
      {result.status === "ready" && <SettingsForm initial={result.settings} reload={reload} onSaved={replace} />}
    </section>
  );
}

function SettingsForm({ initial, reload, onSaved }: { initial: Settings; reload: () => void; onSaved: (settings: Settings) => void }) {
  const [baseline, setBaseline] = useState(initial);
  const [editor, setEditor] = useState(initial.defaultEditor);
  const [theme, setTheme] = useState(initial.theme);
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
      const saved = await saveSettings(baseline, { ...baseline, defaultEditor: editor, theme });
      setBaseline(saved);
      setEditor(saved.defaultEditor);
      setTheme(saved.theme);
      onSaved(saved);
      setNotice("設定を保存しました。");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} aria-label="アプリ設定" aria-busy={pending} className="mt-8 max-w-2xl panel">
      <h2 className="section-title">開発環境</h2>
      <fieldset disabled={pending} className="mt-5 space-y-5 disabled:opacity-60">
        <div>
          <label htmlFor="default-editor" className="field-label">デフォルトエディタ</label>
          <select id="default-editor" value={editor} onChange={(event) => { setEditor(event.target.value as Editor); setNotice(""); }} className="field">
            <option value="vsCode">VS Code</option><option value="cursor">Cursor</option>
          </select>
          <p className="mt-3 text-sm leading-7 text-muted">macOSにインストール済みのアプリを開きます。選択だけでは起動しません。</p>
          <p className="mt-2 text-xs leading-6 text-muted">起動URLは各プロジェクトの詳細で設定できます。</p>
        </div>
        <div className="border-t border-line pt-5">
          <h2 className="section-title mb-4">外観</h2>
          <label htmlFor="display-theme" className="field-label">表示テーマ</label>
          <select id="display-theme" value={theme} onChange={(event) => { setTheme(event.target.value as ThemePreference); setNotice(""); }} className="field">
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
            <option value="system">OSに合わせる</option>
          </select>
          <p className="mt-3 text-sm leading-7 text-muted">「OSに合わせる」では、OSのライト・ダーク設定の変更にも追従します。</p>
          <p className="mt-2 text-xs leading-6 text-muted">表示テーマは保存後に反映されます。エディタは次の再開から反映されます。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="button-primary">{pending ? "保存中…" : "設定を保存"}</button>
          <button type="button" onClick={reload} className="button-secondary">設定を再読み込み</button>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-danger">{error}</p>}
      <p role="status" className="notice mt-4">{notice}</p>
      <p className="mt-3 text-xs leading-6 text-muted">再読み込みや画面移動で、未保存の選択は破棄されます。</p>
    </form>
  );
}

export default SettingsPage;
