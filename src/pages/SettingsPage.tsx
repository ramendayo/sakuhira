import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSettings } from "../hooks/useSettings";
import QuickResumeSettings from "../components/QuickResumeSettings";
import { saveSettings } from "../services/settings";
import { supportsShortcuts } from "../services/shortcuts";
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
  const [shortcutPending, setShortcutPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || shortcutPending) return;
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
    <div className="settings-panel mt-8 max-w-2xl panel">
      <form onSubmit={save} aria-label="アプリ設定" aria-busy={pending}>
        <fieldset disabled={pending || shortcutPending} className="min-w-0 space-y-5 disabled:opacity-60">
          <section aria-labelledby="appearance-settings" className="settings-section">
            <h2 id="appearance-settings" className="section-title">外観</h2>
            <div className="settings-row">
              <div>
                <label htmlFor="display-theme" className="settings-row-label">表示テーマ</label>
                <p id="display-theme-help" className="settings-row-description">保存すると反映されます。「OSに合わせる」はシステムの外観に追従します。</p>
              </div>
              <select id="display-theme" aria-describedby="display-theme-help" value={theme} onChange={(event) => { setTheme(event.target.value as ThemePreference); setNotice(""); }} className="field settings-select">
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
                <option value="system">OSに合わせる</option>
              </select>
            </div>
          </section>
          <section aria-labelledby="resume-settings" className="settings-section">
            <h2 id="resume-settings" className="section-title">プロジェクトの再開</h2>
            <div className="settings-row">
              <div>
                <label htmlFor="default-editor" className="settings-row-label">フォルダを開くエディタ</label>
                <p id="default-editor-help" className="settings-row-description">保存後、次にプロジェクトを再開したときに使います。</p>
              </div>
              <select id="default-editor" aria-describedby="default-editor-help" value={editor} onChange={(event) => { setEditor(event.target.value as Editor); setNotice(""); }} className="field settings-select">
                <option value="vsCode">VS Code</option>
                <option value="cursor">Cursor</option>
              </select>
            </div>
          </section>
          <div className="settings-form-actions flex flex-wrap gap-3">
            <button type="submit" className="button-primary">{pending ? "保存中…" : "設定を保存"}</button>
            <button type="button" onClick={reload} className="button-secondary">設定を再読み込み</button>
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-4 break-words text-sm leading-6 text-danger">{error}</p>}
        <p role="status" className="notice mt-4">{notice}</p>
      </form>
      {supportsShortcuts() && (
        <QuickResumeSettings
          settings={baseline}
          busy={pending || shortcutPending}
          onBusy={setShortcutPending}
          onSaved={(saved) => { setBaseline(saved); onSaved(saved); }}
        />
      )}
    </div>
  );
}

export default SettingsPage;
