import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { getSettings, saveSettings } from "../services/settings";
import { resumeProject } from "../services/launch";
import { editorName } from "../types/settings";
import type { Settings } from "../types/settings";
import type { Project } from "../types/project";

vi.mock("../services/settings", () => ({ getSettings: vi.fn(), saveSettings: vi.fn() }));
vi.mock("../services/launch", () => ({ resumeProject: vi.fn(), setProjectLaunchUrl: vi.fn() }));
vi.mock("../services/projects", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/projects")>(),
  listProjects: vi.fn(async () => [{ id: "id", name: "Example", path: "/project", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } } satisfies Project]),
}));
vi.mock("../services/git", () => ({ getGitStatus: vi.fn(async () => ({ kind: "notRepository" })) }));
let stored: Settings;
beforeEach(() => {
  vi.resetAllMocks();
  stored = { defaultEditor: "vsCode" };
  vi.mocked(getSettings).mockImplementation(async () => ({ ...stored }));
  vi.mocked(saveSettings).mockImplementation(async (_expected, settings) => { stored = { ...settings }; return { ...stored }; });
  vi.mocked(resumeProject).mockImplementation(async () => ({ history: { status: "skipped" }, editorName: editorName(stored.defaultEditor), editor: { status: "success" }, browser: null }));
});
afterEach(cleanup);

it("moves keyboard focus to the page heading when navigating, including a failed project load", async () => {
  const { listProjects } = await import("../services/projects");
  vi.mocked(listProjects).mockRejectedValueOnce("プロジェクトを読み込めません");
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("alert");
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "プロジェクト", level: 1 }));

  screen.getByRole("link", { name: "設定" }).focus();
  await user.keyboard("{Enter}");
  await screen.findByLabelText("デフォルトエディタ");
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "設定", level: 1 }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByLabelText("デフォルトエディタ"));

  screen.getByRole("link", { name: "プロジェクト" }).focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("button", { name: "Exampleの詳細を開く" });
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "プロジェクト", level: 1 }));
});

it("saves a default editor, reloads it on return, and shows it in project details and launch results", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  const select = await screen.findByLabelText("デフォルトエディタ");
  expect((select as HTMLSelectElement).value).toBe("vsCode");
  expect(screen.getByRole("link", { name: "設定" }).getAttribute("aria-current")).toBe("page");
  await user.selectOptions(select, "cursor");
  expect(saveSettings).not.toHaveBeenCalled();
  expect(resumeProject).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await screen.findByText("設定を保存しました。次の再開から反映されます。");
  expect(saveSettings).toHaveBeenCalledWith({ defaultEditor: "vsCode" }, { defaultEditor: "cursor" });
  await user.click(screen.getByRole("link", { name: "プロジェクト" }));
  await user.click(await screen.findByRole("button", { name: "Exampleの詳細を開く" }));
  expect(await screen.findByText("エディタ：Cursor（アプリ設定）")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Exampleを再開" }));
  expect(await screen.findByText("Cursor：起動要求を送信しました。")).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "設定" }));
  expect((await screen.findByLabelText("デフォルトエディタ") as HTMLSelectElement).value).toBe("cursor");
});

it("reports settings load errors without showing fallback values, and supports retry", async () => {
  vi.mocked(getSettings).mockRejectedValueOnce("アプリ設定が壊れています");
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  expect((await screen.findByRole("alert")).textContent).toBe("アプリ設定が壊れています");
  expect(screen.queryByLabelText("デフォルトエディタ")).toBeNull();
  expect(saveSettings).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "設定を再読み込み" }));
  expect(await screen.findByLabelText("デフォルトエディタ")).toBeTruthy();
});

it("retains failed selections, prevents duplicate saves, and updates the conflict baseline after success", async () => {
  let finish!: (settings: Settings) => void;
  vi.mocked(saveSettings).mockRejectedValueOnce("設定の保存に失敗しました").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  await user.selectOptions(await screen.findByLabelText("デフォルトエディタ"), "cursor");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  expect((await screen.findByRole("alert")).textContent).toBe("設定の保存に失敗しました");
  expect((screen.getByLabelText("デフォルトエディタ") as HTMLSelectElement).value).toBe("cursor");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await user.click(screen.getByRole("button", { name: "保存中…" }));
  expect(saveSettings).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "設定を再読み込み" }).matches(":disabled")).toBe(true);
  finish({ defaultEditor: "cursor" });
  await screen.findByText("設定を保存しました。次の再開から反映されます。");
  await user.selectOptions(screen.getByLabelText("デフォルトエディタ"), "vsCode");
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await waitFor(() => expect(saveSettings).toHaveBeenLastCalledWith({ defaultEditor: "cursor" }, { defaultEditor: "vsCode" }));
});

it("discards unsaved selections when reloading and navigating away", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  await user.selectOptions(await screen.findByLabelText("デフォルトエディタ"), "cursor");
  await user.click(screen.getByRole("button", { name: "設定を再読み込み" }));
  expect((await screen.findByLabelText("デフォルトエディタ") as HTMLSelectElement).value).toBe("vsCode");
  await user.selectOptions(screen.getByLabelText("デフォルトエディタ"), "cursor");
  await user.click(screen.getByRole("link", { name: "プロジェクト" }));
  await user.click(await screen.findByRole("button", { name: "Exampleの詳細を開く" }));
  expect(await screen.findByText("エディタ：VS Code（アプリ設定）")).toBeTruthy();
  expect(saveSettings).not.toHaveBeenCalled();
});
