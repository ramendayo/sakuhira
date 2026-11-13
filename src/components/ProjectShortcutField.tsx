import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { errorMessage } from "../services/projects";
import { onCapturedShortcut, setShortcutCapture } from "../services/shortcuts";

export function shortcutLabel(shortcut: string) {
  const labels: Record<string, string> = { Command: "⌘", Control: "⌃", Alt: "⌥", Shift: "⇧" };
  return shortcut.split("+").map((part) => labels[part] ?? part.replace(/^(Key|Digit)(?=[A-Z0-9]$)/, "")).join(" + ");
}

type Props = {
  shortcut: string | null;
  onChange: (shortcut: string | null) => void;
  saveError?: string | null;
  legend?: string;
};

export default function ProjectShortcutField({ shortcut, onChange, saveError, legend = "グローバルショートカット" }: Props) {
  const id = useId();
  const [capturing, setCapturing] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const captureButton = useRef<HTMLButtonElement>(null);
  const feedback = error ?? saveError;
  const feedbackId = feedback ? `${id}-error` : undefined;

  useEffect(() => {
    if (saveError) captureButton.current?.focus();
  }, [saveError]);

  function stop() {
    active.current = false;
    setCapturing(false);
    setReady(false);
  }

  useEffect(() => {
    if (!capturing) return;
    let cancelled = false;
    let requested = false;
    let unlisten: (() => void) | undefined;

    async function start() {
      try {
        unlisten = await onCapturedShortcut((key) => {
          if (!active.current || cancelled) return;
          onChange(key);
          setError(null);
          stop();
        });
        if (cancelled) {
          unlisten();
          return;
        }
        requested = true;
        await setShortcutCapture(true);
        if (!cancelled) setReady(true);
      } catch (error) {
        if (!cancelled) {
          setError(errorMessage(error));
          stop();
        }
      }
    }

    const onWindowBlur = () => stop();
    window.addEventListener("blur", onWindowBlur);
    void start();
    return () => {
      cancelled = true;
      window.removeEventListener("blur", onWindowBlur);
      unlisten?.();
      if (requested) void setShortcutCapture(false).catch((error) => console.error(error));
    };
  }, [capturing, onChange]);

  function captureKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!capturing || event.key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      stop();
      return;
    }
    if (!ready || event.repeat || event.nativeEvent.isComposing || /^(Meta|Control|Alt|Shift)(Left|Right)$/.test(event.code)) return;

    if ((!event.metaKey && !event.ctrlKey && !event.altKey) || !/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/.test(event.code)) {
      setError("⌘・⌃・⌥のいずれかと、英字・数字・F1〜F12を組み合わせてください。");
      return;
    }
    if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && /^(KeyQ|KeyW)$/.test(event.code)) {
      setError("⌘Qと⌘Wは予約されています。");
      return;
    }

    onChange([
      event.metaKey && "Command", event.ctrlKey && "Control",
      event.altKey && "Alt", event.shiftKey && "Shift", event.code,
    ].filter(Boolean).join("+"));
    setError(null);
    stop();
  }

  return (
    <fieldset aria-describedby={feedbackId} className="space-y-3 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap items-center gap-3">
        <span aria-live="polite" className="text-sm">{shortcut ? <kbd>{shortcutLabel(shortcut)}</kbd> : "未設定"}</span>
        <button ref={captureButton} type="button" className="button-secondary" aria-pressed={capturing}
          aria-describedby={feedbackId ? `${id} ${feedbackId}` : id}
          onBlur={stop} onKeyDown={captureKey} onClick={(event) => {
            if (capturing) { stop(); return; }
            event.currentTarget.focus();
            setError(null);
            active.current = true;
            setCapturing(true);
          }}>
          {capturing ? (ready ? "キーを入力してください" : "入力を準備中…") : "キーを入力"}
        </button>
        {shortcut && <button type="button" className="button-quiet" onClick={() => { setError(null); onChange(null); }}>ショートカットを解除</button>}
      </div>
      <p id={id} className="text-xs leading-6 text-muted">⌘・⌃・⌥のいずれかと英字・数字・F1〜F12を押します。Escで入力を終了できます。</p>
      {feedback && <p id={feedbackId} role="alert" className="text-sm text-danger">{feedback}</p>}
    </fieldset>
  );
}
