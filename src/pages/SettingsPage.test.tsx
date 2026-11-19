import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { getSettings, saveSettings } from "../services/settings";
import { resumeProject } from "../services/launch";
import * as shortcuts from "../services/shortcuts";
import { editorName } from "../types/settings";
import type { Settings } from "../types/settings";
import type { Project } from "../types/project";

vi.mock("../services/settings", () => ({ applyTheme: vi.fn(async () => {}), getSettings: vi.fn(), saveSettings: vi.fn() }));
vi.mock("../services/launch", async (importOriginal) => ({ ...await importOriginal<typeof import("../services/launch")>(), resumeProject: vi.fn(), setProjectLaunchUrl: vi.fn() }));
vi.mock("../services/projects", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/projects")>(),
  listProjects: vi.fn(async () => [{ id: "id", name: "Example", path: "/project", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } } satisfies Project]),
}));
vi.mock("../services/git", () => ({ getGitStatus: vi.fn(async () => ({ kind: "notRepository" })) }));
vi.mock("../services/shortcuts", () => ({
  supportsShortcuts: vi.fn(() => false),
  onShortcutResume: vi.fn(),
  onShortcutsRestored: vi.fn(),
  onCapturedShortcut: vi.fn(),
  setShortcutCapture: vi.fn(),
  readShortcutIssues: vi.fn(),
  readQuickResumeShortcutIssue: vi.fn(),
  setQuickResumeShortcut: vi.fn(),
}));
let stored: Settings;
beforeEach(() => {
  vi.resetAllMocks();
  stored = { projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" };
  vi.mocked(getSettings).mockImplementation(async () => ({ ...stored }));
  vi.mocked(saveSettings).mockImplementation(async (_expected, settings) => { stored = { ...settings }; return { ...stored }; });
  vi.mocked(resumeProject).mockImplementation(async () => ({ history: { status: "skipped" }, editorName: editorName(stored.defaultEditor), editor: { status: "success" }, browser: null }));
});
afterEach(cleanup);

it("configures quick resume, retains the previous key on failure, and clears a restored key", async () => {
  vi.mocked(shortcuts.supportsShortcuts).mockReturnValue(true);
  vi.mocked(shortcuts.onShortcutResume).mockResolvedValue(() => {});
  vi.mocked(shortcuts.onShortcutsRestored).mockResolvedValue(() => {});
  vi.mocked(shortcuts.onCapturedShortcut).mockResolvedValue(() => {});
  vi.mocked(shortcuts.setShortcutCapture).mockResolvedValue(undefined);
  vi.mocked(shortcuts.readShortcutIssues).mockResolvedValue([]);
  vi.mocked(shortcuts.readQuickResumeShortcutIssue).mockResolvedValue(null);
  vi.mocked(shortcuts.setQuickResumeShortcut).mockImplementation(async (expected, shortcut) => {
    expect(expected).toEqual(stored);
    if (shortcut === "Control+KeyK") throw "このショートカットは「Example」に割り当てられています。";
    if (shortcut === "Control+KeyL") throw "OSにショートカットを登録できません。";
    stored = { ...expected, quickResumeShortcut: shortcut ?? undefined };
    return stored;
  });

  const user = userEvent.setup();
  const { unmount } = render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const quick = within(await screen.findByRole("form", { name: "クイック再開" }));
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
    "外観", "プロジェクトの再開", "ショートカット",
  ]);
  expect(quick.getByText("未設定")).toBeTruthy();
  const save = quick.getByRole("button", { name: "ショートカットを保存" });
  expect(save.matches(":disabled")).toBe(true);

  async function capture(letter: string) {
    await user.click(quick.getByRole("button", { name: "キーを入力" }));
    await quick.findByRole("button", { name: "キーを入力してください" });
    await user.keyboard(`{Control>}${letter}{/Control}`);
  }
  await capture("j");
  await user.tab();
  expect(document.activeElement).toBe(quick.getByRole("button", { name: "ショートカットを解除" }));
  await user.tab();
  expect(document.activeElement).toBe(save);
  await user.keyboard("{Enter}");
  expect(await quick.findByText("ショートカットを保存しました。")).toBeTruthy();
  expect(stored.quickResumeShortcut).toBe("Control+KeyJ");

  await capture("k");
  await user.click(save);
  expect((await quick.findByRole("alert")).textContent).toContain("Example");
  expect(quick.getByText("⌃ + J")).toBeTruthy();
  expect(quick.getByText("⌃ + K")).toBeTruthy();
  expect(stored.quickResumeShortcut).toBe("Control+KeyJ");

  await capture("l");
  await user.click(save);
  expect((await quick.findByRole("alert")).textContent).toContain("OSにショートカットを登録できません");
  expect(stored.quickResumeShortcut).toBe("Control+KeyJ");
  expect(saveSettings).not.toHaveBeenCalled();

  unmount();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const restored = within(await screen.findByRole("form", { name: "クイック再開" }));
  expect(restored.getByText("⌃ + J")).toBeTruthy();
  await user.click(restored.getByRole("button", { name: "ショートカットを解除" }));
  await user.click(restored.getByRole("button", { name: "ショートカットを保存" }));
  expect(await restored.findByText("ショートカットを解除しました。")).toBeTruthy();
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
  const quick = within(await screen.findByRole("form", { name: "クイック再開" }));
  await waitFor(() => expect(shortcuts.readQuickResumeShortcutIssue).toHaveBeenCalledTimes(1));
  act(() => notifyRestored());
  expect((await quick.findByRole("alert")).textContent).toBe(reason);
  expect(quick.getByRole("button", { name: "ショートカットを保存" }).matches(":disabled")).toBe(false);
});

it("applies themes only after a successful save and retains the saved choice across navigation", async () => {
  vi.mocked(saveSettings).mockRejectedValueOnce("保存できません").mockImplementation(async (_expected, settings) => { stored = { ...settings }; return { ...stored }; });
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
  expect(saveSettings).toHaveBeenLastCalledWith({ defaultEditor: "vsCode", theme: "light", projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" } }, { defaultEditor: "vsCode", theme: "dark", projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" } });
  await user.selectOptions(select, "light");
  await user.click(screen.getByRole("link", { name: "プロジェクト" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  await user.click(screen.getByRole("link", { name: "設定" }));
  expect((await screen.findByLabelText("表示テーマ") as HTMLSelectElement).value).toBe("dark");
  expect(getSettings).toHaveBeenCalledTimes(1);
});

it("moves keyboard focus to the page heading when navigating, including a failed project load", async () => {
  const { listProjects } = await import("../services/projects");
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
  await screen.findByRole("button", { name: "Exampleの詳細を開く" });
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "プロジェクト", level: 1 }));
});

it("saves a default editor, reloads it on return, and shows it in project details and launch results", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const select = await screen.findByLabelText("フォルダを開くエディタ");
  expect((select as HTMLSelectElement).value).toBe("vsCode");
  expect(screen.getByRole("link", { name: "設定" }).getAttribute("aria-current")).toBe("page");
  await user.selectOptions(select, "cursor");
  expect(saveSettings).not.toHaveBeenCalled();
  expect(resumeProject).not.toHaveBeenCalled();
  select.focus();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "設定を保存" }));
  await user.keyboard("{Enter}");
  await screen.findByText("設定を保存しました。");
  expect(saveSettings).toHaveBeenCalledWith({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" }, { projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" });
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
  expect(saveSettings).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "設定を再読み込み" }));
  expect(await screen.findByLabelText("フォルダを開くエディタ")).toBeTruthy();
});

it("retains failed selections, prevents duplicate saves, and updates the conflict baseline after success", async () => {
  let finish!: (settings: Settings) => void;
  vi.mocked(saveSettings).mockRejectedValueOnce("設定の保存に失敗しました").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  await user.selectOptions(await screen.findByLabelText("フォルダを開くエディタ"), "cursor");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  expect((await screen.findByRole("alert")).textContent).toBe("設定の保存に失敗しました");
  expect((screen.getByLabelText("フォルダを開くエディタ") as HTMLSelectElement).value).toBe("cursor");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await user.click(screen.getByRole("button", { name: "保存中…" }));
  expect(saveSettings).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "設定を再読み込み" }).matches(":disabled")).toBe(true);
  finish({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" });
  await screen.findByText("設定を保存しました。");
  await user.selectOptions(screen.getByLabelText("フォルダを開くエディタ"), "vsCode");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await waitFor(() => expect(saveSettings).toHaveBeenLastCalledWith({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" }, { projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" }));
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
  expect(saveSettings).not.toHaveBeenCalled();
});
