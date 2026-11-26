import { useEffect, useState } from "react";
import { errorMessage } from "../features/projects/services/projects";
import { getLaunchAtLogin, onLaunchAtLoginChanged, setLaunchAtLogin } from "../services/settings";

// The login item is OS state rather than part of settings.json, so it applies
// immediately instead of waiting for the settings form to be saved.
export default function LaunchAtLoginSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const subscription = onLaunchAtLoginChanged((value) => { if (!cancelled) setEnabled(value); });
    // Subscribe first so a change from the menu bar during the initial read is not missed.
    const read = () => getLaunchAtLogin().then(
      (value) => { if (!cancelled) setEnabled(value); },
      (reason: unknown) => { if (!cancelled) setError(`ログイン時の起動の状態を読み込めません：${errorMessage(reason)}`); },
    );
    void subscription.then(read, read);
    return () => {
      cancelled = true;
      void subscription.then((unlisten) => unlisten(), () => {});
    };
  }, []);

  async function change(value: boolean) {
    setPending(true);
    setError(null);
    try {
      setEnabled(await setLaunchAtLogin(value));
    } catch (reason) {
      setError(`ログイン時の起動を変更できません：${errorMessage(reason)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="startup-settings" className="settings-section">
      <h2 id="startup-settings" className="section-title">起動</h2>
      <div className="settings-row">
        <div>
          <label htmlFor="launch-at-login" className="settings-row-label">ログイン時に起動</label>
          <p id="launch-at-login-help" className="settings-row-description">
            Macにログインすると、ウィンドウを開かずにメニューバーで待機し、ショートカットを使えるようにします。切り替えるとすぐに反映されます。
          </p>
        </div>
        <input
          id="launch-at-login"
          type="checkbox"
          aria-describedby="launch-at-login-help"
          checked={enabled ?? false}
          disabled={enabled === null || pending}
          onChange={(event) => { void change(event.target.checked); }}
          className="size-4 accent-accent disabled:opacity-60"
        />
      </div>
      {error && <p role="alert" className="mt-3 break-words text-sm leading-6 text-danger">{error}</p>}
    </section>
  );
}
