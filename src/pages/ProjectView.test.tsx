import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { getSettings, saveSettings, saveSettingsWithShortcut } from "../services/settings";
import type { Settings } from "../types/settings";

vi.mock("../services/settings", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/settings")>(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  saveSettingsWithShortcut: vi.fn(),
  applyTheme: vi.fn(async () => {}),
}));
vi.mock("../services/projects", async (importOriginal) => ({ ...await importOriginal<typeof import("../services/projects")>(), listProjects: vi.fn(async () => [{ id: "id", name: "Example", path: "/project", launchUrl: null, lastResumedAt: null, notes: { lastWork: "Work", nextTask: "Next", updatedAt: null } }]) }));
vi.mock("../services/git", () => ({ getGitStatus: vi.fn(async () => ({ kind: "notRepository" })) }));

let stored: Settings;
beforeEach(() => {
  vi.resetAllMocks();
  stored = { defaultEditor: "cursor", theme: "dark", projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" } };
  vi.mocked(getSettings).mockImplementation(async () => structuredClone(stored));
  const persist: typeof saveSettings = async (_expected, settings) => {
    stored = structuredClone(settings);
    return structuredClone(stored);
  };
  vi.mocked(saveSettings).mockImplementation(persist);
  vi.mocked(saveSettingsWithShortcut).mockImplementation(persist);
});
afterEach(cleanup);

async function ready() {
  await waitFor(() => expect(screen.getByRole("button", { name: "リスト" }).matches(":disabled")).toBe(false));
}

it("persists layout and card size through filtering, reloading, navigation, and restart", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<App />);
  await ready();
  screen.getByRole("searchbox").focus();
  for (const name of ["カード", "リスト", "小", "標準", "大"]) {
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name }));
  }
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "並び順" }));
  expect(screen.getByRole("button", { name: "標準", pressed: true })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "大" }));
  await screen.findByRole("button", { name: "大", pressed: true });
  const listButton = screen.getByRole("button", { name: "リスト" });
  listButton.focus();
  await user.keyboard(" ");
  await screen.findByRole("button", { name: "リスト", pressed: true });
  expect(screen.queryByRole("group", { name: "カードサイズ" })).toBeNull();
  await user.type(screen.getByRole("searchbox"), "missing");
  expect(screen.getByText("一致するプロジェクトがありません")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "再読み込み" }));
  await screen.findByRole("searchbox");
  expect(screen.getByRole("button", { name: "リスト", pressed: true })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "検索をクリア" }));
  await screen.findByRole("heading", { name: "Example" });
  await user.click(screen.getByRole("link", { name: "設定" }));
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await screen.findByText("設定を保存しました。");
  expect(stored.projectView).toEqual({ layout: "list", cardSize: "large" });
  expect(stored.theme).toBe("dark");
  expect(stored.defaultEditor).toBe("cursor");
  unmount();
  render(<App />);
  await screen.findByRole("button", { name: "リスト", pressed: true });
  await user.click(screen.getByRole("button", { name: "カード" }));
  await screen.findByRole("button", { name: "大", pressed: true });
  expect(stored.projectView).toEqual({ layout: "cards", cardSize: "large" });
});

it("keeps the saved presentation on failure and retries without overwriting other settings", async () => {
  vi.mocked(saveSettings).mockRejectedValueOnce("書き込めません");
  const user = userEvent.setup();
  render(<App />);
  await ready();
  await user.click(screen.getByRole("button", { name: "リスト" }));
  expect((await screen.findByRole("alert")).textContent).toContain("書き込めません");
  expect(screen.getByRole("button", { name: "カード", pressed: true })).toBeTruthy();
  expect(stored.projectView.layout).toBe("cards");
  await user.click(screen.getByRole("button", { name: "もう一度保存" }));
  await screen.findByRole("button", { name: "リスト", pressed: true });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(stored.theme).toBe("dark");
  expect(stored.defaultEditor).toBe("cursor");
});

it("prevents duplicate saves while pending and supports keyboard activation", async () => {
  let finish!: (settings: Settings) => void;
  vi.mocked(saveSettings).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const user = userEvent.setup();
  render(<App />);
  await ready();
  const small = screen.getByRole("button", { name: "小" });
  small.focus();
  await user.keyboard("{Enter}");
  expect(small.matches(":disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "リスト" }));
  expect(saveSettings).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ...stored, projectView: { layout: "cards", cardSize: "small" } }));
  await screen.findByRole("button", { name: "小", pressed: true });
  expect(small.matches(":disabled")).toBe(false);
  expect(document.activeElement).toBe(small);
  await user.keyboard("{Enter}");
  expect(saveSettings).toHaveBeenCalledTimes(1);
});
