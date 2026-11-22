import Icon from "../../../components/Icon";
import { useEffect, useRef } from "react";
import { projectSortLabels } from "../../../types/settings";
import type { ProjectSort, ProjectView } from "../../../types/settings";

type ActivationTarget = HTMLButtonElement | HTMLSelectElement;

/** 保存中の無効化でフォーカスを失った場合だけ、操作の起点に戻す。 */
function useFocusRestoredAfterSave(disabled: boolean) {
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const activationTarget = useRef<ActivationTarget | null>(null);
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    if (wasDisabled.current && !disabled && document.activeElement === document.body) {
      const target = activationTarget.current?.isConnected ? activationTarget.current : fieldset.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      target?.focus();
    }
    if (!disabled) activationTarget.current = null;
    wasDisabled.current = disabled;
  }, [disabled]);
  return { fieldset, remember: (target: ActivationTarget) => { activationTarget.current = target; } };
}

type Props = {
  view: ProjectView;
  disabled: boolean;
  onChange: (view: ProjectView) => void;
};

/** 表示形式（カード/リスト）と並び順。ヘッダーの1行に置く。 */
export default function ProjectViewControls({ view, disabled, onChange, sort, onSortChange }: Props & { sort: ProjectSort; onSortChange: (sort: ProjectSort) => void }) {
  const { fieldset, remember } = useFocusRestoredAfterSave(disabled);

  function choose(button: HTMLButtonElement, next: ProjectView) {
    remember(button);
    onChange(next);
  }

  return <fieldset ref={fieldset} disabled={disabled} className="view-controls">
    <legend className="sr-only">プロジェクトの表示設定</legend>
    <div className="view-control-group">
      {/* アイコンだけで見た目を絞る代わりに、読み上げ名とツールチップで操作内容を伝える。 */}
      <div role="group" aria-label="表示形式" className="segmented-control segmented-icons">
        <button type="button" aria-label="カード" title="カード表示" aria-pressed={view.layout === "cards"} onClick={(event) => choose(event.currentTarget, { ...view, layout: "cards" })}><Icon name="projects" /></button>
        <button type="button" aria-label="リスト" title="リスト表示" aria-pressed={view.layout === "list"} onClick={(event) => choose(event.currentTarget, { ...view, layout: "list" })}><Icon name="list" /></button>
      </div>
    </div>
    <label className="sort-control">
      <span className="sr-only">並び順</span>
      <select className="field" value={sort} onChange={(event) => {
        remember(event.currentTarget);
        onSortChange(event.target.value as ProjectSort);
      }}>
        {(Object.entries(projectSortLabels) as [ProjectSort, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  </fieldset>;
}

/** カードサイズ。カード表示のときだけ意味があるため、ヘッダーの外（件数の行）に置く。 */
export function ProjectCardSizeControl({ view, disabled, onChange }: Props) {
  const { fieldset, remember } = useFocusRestoredAfterSave(disabled);
  if (view.layout !== "cards") return null;
  return <fieldset ref={fieldset} disabled={disabled} className="view-controls card-size-controls">
    <legend className="sr-only">カードサイズの設定</legend>
    <div role="group" aria-label="カードサイズ" className="segmented-control">
      {(["small", "standard", "large"] as const).map((size, index) => <button type="button" key={size} aria-pressed={view.cardSize === size} onClick={(event) => { remember(event.currentTarget); onChange({ ...view, cardSize: size }); }}>{["小", "標準", "大"][index]}</button>)}
    </div>
  </fieldset>;
}
