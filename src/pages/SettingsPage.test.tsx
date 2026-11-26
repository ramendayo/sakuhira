import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { getLaunchAtLogin, getSettings, onLaunchAtLoginChanged, saveSettingsWithShortcut, setLaunchAtLogin } from "../services/settings";
import { resumeProject } from "../features/projects/services/launch";
import * as shortcuts from "../services/shortcuts";
import { editorName } from "../types/settings";
import type { Settings } from "../types/settings";
import type { Project } from "../features/projects/types/project";

vi.mock("../services/settings", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/settings")>(),
  applyTheme: vi.fn(async () => {}),
  getSettings: vi.fn(),
  saveSettingsWithShortcut: vi.fn(),
  getLaunchAtLogin: vi.fn(),
  setLaunchAtLogin: vi.fn(),
  onLaunchAtLoginChanged: vi.fn(),
}));
vi.mock("../features/projects/services/launch", async (importOriginal) => ({ ...await importOriginal<typeof import("../features/projects/services/launch")>(), resumeProject: vi.fn(), setProjectLaunchUrl: vi.fn() }));
vi.mock("../features/projects/services/projects", async (importOriginal) => ({
  ...await importOriginal<typeof import("../features/projects/services/projects")>(),
  listProjects: vi.fn(async () => [{ id: "id", name: "Example", path: "/project", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } } satisfies Project]),
}));
vi.mock("../features/projects/services/git", () => ({ getGitStatus: vi.fn(async () => ({ kind: "notRepository" })) }));
vi.mock("../services/shortcuts", () => ({
  supportsShortcuts: vi.fn(() => false),
  onShortcutResume: vi.fn(),
  onShortcutsRestored: vi.fn(),
  onCapturedShortcut: vi.fn(),
  setShortcutCapture: vi.fn(),
  readShortcutIssues: vi.fn(),
  readQuickResumeShortcutIssue: vi.fn(),
}));
let stored: Settings;
beforeEach(() => {
  vi.resetAllMocks();
  stored = { projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" };
  vi.mocked(getSettings).mockImplementation(async () => ({ ...stored }));
  vi.mocked(saveSettingsWithShortcut).mockImplementation(async (_expected, settings) => { stored = { ...settings }; return { ...stored }; });
  vi.mocked(getLaunchAtLogin).mockResolvedValue(true);
  vi.mocked(onLaunchAtLoginChanged).mockResolvedValue(() => {});
  vi.mocked(resumeProject).mockImplementation(async () => ({ history: { status: "skipped" }, editorName: editorName(stored.defaultEditor), editor: { status: "success" }, browser: null }));
});
afterEach(cleanup);

it("saves all settings together, keeps drafts on a shortcut failure, and clears a saved key", async () => {
  const initial = { ...stored, quickResumeShortcut: "Control+KeyJ" };
  stored = initial;
  vi.mocked(shortcuts.supportsShortcuts).mockReturnValue(true);
  vi.mocked(shortcuts.onShortcutResume).mockResolvedValue(() => {});
  vi.mocked(shortcuts.onShortcutsRestored).mockResolvedValue(() => {});
  vi.mocked(shortcuts.onCapturedShortcut).mockResolvedValue(() => {});
  vi.mocked(shortcuts.setShortcutCapture).mockResolvedValue(undefined);
  vi.mocked(shortcuts.readShortcutIssues).mockResolvedValue([]);
  vi.mocked(shortcuts.readQuickResumeShortcutIssue).mockResolvedValue(null);
  vi.mocked(saveSettingsWithShortcut).mockImplementation(async (expected, draft) => {
    expect(expected).toEqual(stored);
    const reasons: Record<string, string> = {
      "Control+KeyK": "このショートカットは「Example」に割り当てられています。",
      "Control+KeyL": "OSにショートカットを登録できません。",
    };
    const message = draft.quickResumeShortcut && reasons[draft.quickResumeShortcut];
    if (message) throw { field: "quickResumeShortcut", message };
    stored = { ...draft };
    return { ...stored };
  });

  const user = userEvent.setup();
  const { unmount } = render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const quick = within(await screen.findByRole("region", { name: "ショートカット" }));
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
    "外観", "プロジェクトの再開", "ショートカット", "起動",
  ]);
  expect(quick.getByText("⌃ + J")).toBeTruthy();
  const save = screen.getByRole("button", { name: "設定を保存" });
  const theme = screen.getByRole<HTMLSelectElement>("combobox", { name: "表示テーマ" });
  const editor = screen.getByRole<HTMLSelectElement>("combobox", { name: "フォルダを開くエディタ" });
  await user.selectOptions(theme, "dark");
  await user.selectOptions(editor, "cursor");

  async function capture(letter: string) {
    quick.getByRole("button", { name: "変更" }).focus();
    await user.keyboard("{Enter}");
    await quick.findByRole("button", { name: "キーを入力してください" });
    await user.keyboard(`{Control>}${letter}{/Control}`);
  }

  await capture("k");
  expect(saveSettingsWithShortcut).not.toHaveBeenCalled();
  await user.click(save);
  expect((await quick.findByRole("alert")).textContent).toContain("Example");
  expect(document.activeElement).toBe(quick.getByRole("button", { name: "変更" }));
  expect(quick.getByText("⌃ + J")).toBeTruthy();
  expect(quick.getByText("⌃ + K")).toBeTruthy();
  expect(stored).toEqual(initial);
  expect(theme.value).toBe("dark");
  expect(editor.value).toBe("cursor");
  expect(document.documentElement.dataset.theme).toBe("light");

  await capture("l");
  await user.click(save);
  expect((await quick.findByRole("alert")).textContent).toContain("OSにショートカットを登録できません");
  expect(stored).toEqual(initial);

  await capture("m");
  await user.tab();
  expect(document.activeElement).toBe(quick.getByRole("button", { name: "解除" }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "ログイン時に起動" }));
  await user.tab();
  expect(document.activeElement).toBe(save);
  await user.keyboard("{Enter}");
  await screen.findByText("設定を保存しました。");
  expect(stored).toEqual({ ...initial, theme: "dark", defaultEditor: "cursor", quickResumeShortcut: "Control+KeyM" });
  expect(document.documentElement.dataset.theme).toBe("dark");

  unmount();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const restored = within(await screen.findByRole("region", { name: "ショートカット" }));
  expect(restored.getByText("⌃ + M")).toBeTruthy();
  expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "表示テーマ" }).value).toBe("dark");
  expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "フォルダを開くエディタ" }).value).toBe("cursor");
  await user.click(restored.getByRole("button", { name: "解除" }));
  expect(restored.getByText("未設定")).toBeTruthy();
  expect(document.activeElement).toBe(restored.getByRole("button", { name: "キーを入力" }));
  expect(stored.quickResumeShortcut).toBe("Control+KeyM");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await screen.findByText("設定を保存しました。");
  expect(stored.quickResumeShortcut).toBeUndefined();
});

it("reports a restore failure even when restoration finishes after opening settings", async () => {
  stored.quickResumeShortcut = "Control+KeyJ";
  vi.mocked(shortcuts.supportsShortcuts).mockReturnValue(true);
  vi.mocked(shortcuts.onShortcutResume).mockResolvedValue(() => {});
  vi.mocked(shortcuts.readShortcutIssues).mockResolvedValue([]);
  let notifyRestored!: () => void;
  vi.mocked(shortcuts.onShortcutsRestored).mockImplementation(async (handler) => {
    notifyRestored = handler;
    return () => {};
  });
  const reason = "クイック再開のショートカットを復元できません。";
  vi.mocked(shortcuts.readQuickResumeShortcutIssue).mockResolvedValueOnce(null).mockResolvedValueOnce(reason);
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const quick = within(await screen.findByRole("region", { name: "ショートカット" }));
  await waitFor(() => expect(shortcuts.readQuickResumeShortcutIssue).toHaveBeenCalledTimes(1));
  act(() => notifyRestored());
  expect((await quick.findByRole("alert")).textContent).toBe(reason);
  vi.mocked(shortcuts.readQuickResumeShortcutIssue).mockResolvedValueOnce(null);
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await screen.findByText("設定を保存しました。");
  await waitFor(() => expect(quick.queryByRole("alert")).toBeNull());
  expect(saveSettingsWithShortcut).toHaveBeenCalledWith(stored, stored);
});

it("keeps an old-key release warning after saving the active shortcut again", async () => {
  stored.quickResumeShortcut = "Control+KeyJ";
  vi.mocked(shortcuts.supportsShortcuts).mockReturnValue(true);
  vi.mocked(shortcuts.onShortcutResume).mockResolvedValue(() => {});
  vi.mocked(shortcuts.onShortcutsRestored).mockResolvedValue(() => {});
  vi.mocked(shortcuts.onCapturedShortcut).mockResolvedValue(() => {});
  vi.mocked(shortcuts.setShortcutCapture).mockResolvedValue(undefined);
  vi.mocked(shortcuts.readShortcutIssues).mockResolvedValue([]);
  const warning = "旧ショートカット「Control+KeyJ」を解除できませんでした: OS error\n⌘Qでsakuhiraを完全終了してから起動し直してください。";
  vi.mocked(shortcuts.readQuickResumeShortcutIssue).mockImplementation(async () =>
    stored.quickResumeShortcut === "Control+KeyK" ? warning : null);

  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const quick = within(await screen.findByRole("region", { name: "ショートカット" }));
  await user.click(quick.getByRole("button", { name: "変更" }));
  await quick.findByRole("button", { name: "キーを入力してください" });
  await user.keyboard("{Control>}k{/Control}");

  const save = screen.getByRole("button", { name: "設定を保存" });
  await user.click(save);
  expect((await quick.findByRole("alert")).textContent).toBe(warning);
  expect(quick.getByText("⌃ + K")).toBeTruthy();
  expect(stored.quickResumeShortcut).toBe("Control+KeyK");

  await user.selectOptions(screen.getByRole("combobox", { name: "表示テーマ" }), "dark");
  await user.click(save);
  await screen.findByText("設定を保存しました。");
  expect(stored.theme).toBe("dark");
  expect(stored.quickResumeShortcut).toBe("Control+KeyK");
  expect(quick.getByRole("alert").textContent).toBe(warning);
});

it("applies themes only after a successful save and retains the saved choice across navigation", async () => {
  vi.mocked(saveSettingsWithShortcut).mockRejectedValueOnce("保存できません").mockImplementation(async (_expected, settings) => { stored = { ...settings }; return { ...stored }; });
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const select = await screen.findByLabelText("表示テーマ");
  expect(document.documentElement.dataset.theme).toBe("light");
  await user.selectOptions(select, "dark");
  expect(document.documentElement.dataset.theme).toBe("light");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  expect((await screen.findByRole("alert")).textContent).toBe("保存できません");
  expect((select as HTMLSelectElement).value).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("light");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await screen.findByText("設定を保存しました。");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(saveSettingsWithShortcut).toHaveBeenLastCalledWith({ defaultEditor: "vsCode", theme: "light", projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" } }, { defaultEditor: "vsCode", theme: "dark", projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" } });
  await user.selectOptions(select, "light");
  await user.click(screen.getByRole("link", { name: "プロジェクト" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  await user.click(screen.getByRole("link", { name: "設定" }));
  expect((await screen.findByLabelText("表示テーマ") as HTMLSelectElement).value).toBe("dark");
  expect(getSettings).toHaveBeenCalledTimes(1);
});

it("moves keyboard focus to the page heading when navigating, including a failed project load", async () => {
  const { listProjects } = await import("../features/projects/services/projects");
  vi.mocked(listProjects).mockRejectedValueOnce("プロジェクトを読み込めません");
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("alert");
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "プロジェクト", level: 1 }));

  screen.getByRole("link", { name: "設定" }).focus();
  await user.keyboard("{Enter}");
  await screen.findByLabelText("フォルダを開くエディタ");
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "設定", level: 1 }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByLabelText("表示テーマ"));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByLabelText("フォルダを開くエディタ"));

  screen.getByRole("link", { name: "プロジェクト" }).focus();
  await user.keyboard("{Enter}");
  expect((await screen.findByRole("alert")).textContent).toBe("プロジェクトを読み込めません");
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "プロジェクト", level: 1 }));
  expect(listProjects).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "再読み込み" }));
  await screen.findByRole("button", { name: "Exampleの詳細を開く" });
  expect(listProjects).toHaveBeenCalledTimes(2);
});

it("saves a default editor, reloads it on return, and shows it in project details and launch results", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const select = await screen.findByLabelText("フォルダを開くエディタ");
  expect((select as HTMLSelectElement).value).toBe("vsCode");
  expect(screen.getByRole("link", { name: "設定" }).getAttribute("aria-current")).toBe("page");
  await user.selectOptions(select, "cursor");
  expect(saveSettingsWithShortcut).not.toHaveBeenCalled();
  expect(resumeProject).not.toHaveBeenCalled();
  select.focus();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "設定を保存" }));
  await user.keyboard("{Enter}");
  await screen.findByText("設定を保存しました。");
  expect(saveSettingsWithShortcut).toHaveBeenCalledWith({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" }, { projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" });
  await user.click(screen.getByRole("link", { name: "プロジェクト" }));
  await user.click(await screen.findByRole("button", { name: "Exampleの詳細を開く" }));
  expect(await screen.findByText("エディタ：Cursor（アプリ設定）")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Exampleを再開" }));
  expect(await screen.findByText("Cursor：起動要求を送信しました。")).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "設定" }));
  expect((await screen.findByLabelText("フォルダを開くエディタ") as HTMLSelectElement).value).toBe("cursor");
});

it("reports settings load errors without showing fallback values, and supports retry", async () => {
  vi.mocked(getSettings).mockRejectedValueOnce("アプリ設定が壊れています");
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  expect((await screen.findByRole("alert")).textContent).toBe("アプリ設定が壊れています");
  expect(screen.queryByLabelText("フォルダを開くエディタ")).toBeNull();
  expect(saveSettingsWithShortcut).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "設定を再読み込み" }));
  expect(await screen.findByLabelText("フォルダを開くエディタ")).toBeTruthy();
});

it("retains failed selections, prevents duplicate saves, and updates the conflict baseline after success", async () => {
  let finish!: (settings: Settings) => void;
  vi.mocked(saveSettingsWithShortcut).mockRejectedValueOnce("設定の保存に失敗しました").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  await user.selectOptions(await screen.findByLabelText("フォルダを開くエディタ"), "cursor");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  expect((await screen.findByRole("alert")).textContent).toBe("設定の保存に失敗しました");
  expect((screen.getByLabelText("フォルダを開くエディタ") as HTMLSelectElement).value).toBe("cursor");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await user.click(screen.getByRole("button", { name: "保存中…" }));
  expect(saveSettingsWithShortcut).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "設定を再読み込み" }).matches(":disabled")).toBe(true);
  finish({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" });
  await screen.findByText("設定を保存しました。");
  await user.selectOptions(screen.getByLabelText("フォルダを開くエディタ"), "vsCode");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await waitFor(() => expect(saveSettingsWithShortcut).toHaveBeenLastCalledWith({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" }, { projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" }));
});

it("discards unsaved selections when reloading and navigating away", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  await user.selectOptions(await screen.findByLabelText("フォルダを開くエディタ"), "cursor");
  await user.click(screen.getByRole("button", { name: "設定を再読み込み" }));
  expect((await screen.findByLabelText("フォルダを開くエディタ") as HTMLSelectElement).value).toBe("vsCode");
  await user.selectOptions(screen.getByLabelText("フォルダを開くエディタ"), "cursor");
  await user.click(screen.getByRole("link", { name: "プロジェクト" }));
  await user.click(await screen.findByRole("button", { name: "Exampleの詳細を開く" }));
  expect(await screen.findByText("エディタ：VS Code（アプリ設定）")).toBeTruthy();
  expect(saveSettingsWithShortcut).not.toHaveBeenCalled();
});

it("changes launch at login immediately, follows the menu bar, and shows the real state after a failure", async () => {
  vi.mocked(shortcuts.supportsShortcuts).mockReturnValue(true);
  vi.mocked(shortcuts.onShortcutResume).mockResolvedValue(() => {});
  vi.mocked(shortcuts.onShortcutsRestored).mockResolvedValue(() => {});
  vi.mocked(shortcuts.readShortcutIssues).mockResolvedValue([]);
  vi.mocked(shortcuts.readQuickResumeShortcutIssue).mockResolvedValue(null);
  let notifyChanged!: (enabled: boolean) => void;
  vi.mocked(onLaunchAtLoginChanged).mockImplementation(async (handler) => {
    notifyChanged = handler;
    return () => {};
  });
  vi.mocked(setLaunchAtLogin).mockResolvedValueOnce(false).mockRejectedValueOnce("登録できません。");
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const startup = within(await screen.findByRole("region", { name: "起動" }));
  const toggle = startup.getByRole("checkbox", { name: "ログイン時に起動" });
  await waitFor(() => expect((toggle as HTMLInputElement).checked).toBe(true));

  await user.click(toggle);
  await waitFor(() => expect((toggle as HTMLInputElement).checked).toBe(false));
  expect(setLaunchAtLogin).toHaveBeenLastCalledWith(false);
  expect(saveSettingsWithShortcut).not.toHaveBeenCalled();

  act(() => notifyChanged(true));
  expect((toggle as HTMLInputElement).checked).toBe(true);

  await user.click(toggle);
  expect((await startup.findByRole("alert")).textContent).toBe("ログイン時の起動を変更できません：登録できません。");
  act(() => notifyChanged(true));
  expect((toggle as HTMLInputElement).checked).toBe(true);
});
