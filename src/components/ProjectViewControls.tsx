import Icon from "./Icon";
import { useEffect, useRef } from "react";
import type { ProjectView } from "../types/settings";

type Props = {
  view: ProjectView;
  disabled: boolean;
  onChange: (view: ProjectView) => void;
};

export default function ProjectViewControls({ view, disabled, onChange }: Props) {
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const activationTarget = useRef<HTMLButtonElement | null>(null);
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    // 保存中の無効化でフォーカスを失った場合だけ、操作の起点に戻す。
    if (wasDisabled.current && !disabled && document.activeElement === document.body) {
      const target = activationTarget.current?.isConnected ? activationTarget.current : fieldset.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      target?.focus();
    }
    if (!disabled) activationTarget.current = null;
    wasDisabled.current = disabled;
  }, [disabled]);

  function choose(button: HTMLButtonElement, next: ProjectView) {
    activationTarget.current = button;
    onChange(next);
  }

  return <fieldset ref={fieldset} disabled={disabled} className="view-controls">
    <legend className="sr-only">プロジェクトの表示設定</legend>
    <div role="group" aria-label="表示形式" className="segmented-control">
      <button type="button" aria-pressed={view.layout === "cards"} onClick={(event) => choose(event.currentTarget, { ...view, layout: "cards" })}><Icon name="projects" />カード</button>
      <button type="button" aria-pressed={view.layout === "list"} onClick={(event) => choose(event.currentTarget, { ...view, layout: "list" })}><Icon name="list" />リスト</button>
    </div>
    {view.layout === "cards" && <div role="group" aria-label="カードサイズ" className="segmented-control">
      {(["small", "standard", "large"] as const).map((size, index) => <button type="button" key={size} aria-pressed={view.cardSize === size} onClick={(event) => choose(event.currentTarget, { ...view, cardSize: size })}>{["小", "標準", "大"][index]}</button>)}
    </div>}
  </fieldset>;
}
