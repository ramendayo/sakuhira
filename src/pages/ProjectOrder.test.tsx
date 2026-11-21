import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { getSettings, saveSettings, saveSettingsWithShortcut } from "../services/settings";
import * as projectsApi from "../features/projects/services/projects";
import type { Settings } from "../types/settings";
import type { Project } from "../features/projects/types/project";

vi.mock("../services/settings", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/settings")>(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  saveSettingsWithShortcut: vi.fn(),
  applyTheme: vi.fn(async () => {}),
}));
vi.mock("../features/projects/services/projects", async (original) => ({ ...await original<typeof projectsApi>(), listProjects: vi.fn(), addProject: vi.fn(), removeProject: vi.fn() }));
vi.mock("../features/projects/services/git", () => ({ getGitStatus: vi.fn(async () => ({ kind: "notRepository" })) }));
let stored: Settings;
const fixture = (id: string, name: string, lastResumedAt: number | null = null): Project => ({ id, name, lastResumedAt, path: null, launchUrl: "https://example.com/", notes: { lastWork: "", nextTask: "", updatedAt: null } });
const fixtures = [fixture("a", "アプリ10", 20), fixture("b", "アプリ2", 30), fixture("c", "サイト")];
const names = () => within(screen.getByRole("list", { name: "登録済みプロジェクト" })).getAllByRole("heading").map((item) => item.textContent);
const handle = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}の順序を変更`) });
async function ready() { await waitFor(() => expect(screen.getByRole("combobox", { name: "並び順" }).matches(":disabled")).toBe(false)); }

beforeEach(() => {
  vi.resetAllMocks();
  stored = { defaultEditor: "cursor", theme: "dark", projectView: { layout: "cards", cardSize: "standard" }, projectOrder: { sort: "recent", manualIds: [] } };
  vi.mocked(getSettings).mockImplementation(async () => structuredClone(stored));
  const persist: typeof saveSettings = async (_expected, settings) => {
    stored = structuredClone(settings);
    return structuredClone(stored);
  };
  vi.mocked(saveSettings).mockImplementation(persist);
  vi.mocked(saveSettingsWithShortcut).mockImplementation(persist);
  vi.mocked(projectsApi.listProjects).mockResolvedValue(fixtures);
});
afterEach(cleanup);

it("persists sorting across layouts, sizes, searches, reloads, other settings saves, and restarts", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<App />);
  await ready();
  expect(names()).toEqual(["アプリ2", "アプリ10", "サイト"]);
  await user.selectOptions(screen.getByRole("combobox", { name: "並び順" }), "newest");
  await ready();
  expect(names()).toEqual(["サイト", "アプリ2", "アプリ10"]);
  await user.click(screen.getByRole("button", { name: "小" }));
  await user.click(screen.getByRole("button", { name: "リスト" }));
  expect((screen.getByRole("combobox", { name: "並び順" }) as HTMLSelectElement).value).toBe("newest");
  await user.type(screen.getByRole("searchbox"), "アプリ");
  expect(names()).toEqual(["アプリ2", "アプリ10"]);
  await user.selectOptions(screen.getByRole("combobox", { name: "並び順" }), "name");
  await user.click(screen.getByRole("button", { name: "再読み込み" }));
  await screen.findByRole("searchbox");
  expect(names()).toEqual(["アプリ2", "アプリ10"]);
  await user.click(screen.getByRole("link", { name: "設定" }));
  await user.click(screen.getByRole("button", { name: "設定を保存" }));
  await screen.findByText("設定を保存しました。");
  unmount(); render(<App />); await ready();
  expect((screen.getByRole("combobox", { name: "並び順" }) as HTMLSelectElement).value).toBe("name");
  expect(stored.projectView).toEqual({ layout: "list", cardSize: "small" });
  expect(stored.theme).toBe("dark");
  expect(stored.defaultEditor).toBe("cursor");
});

it.each(["cards", "list"] as const)("supports keyboard manual moves and stable filtered placement in %s", async (layout) => {
  stored.projectView.layout = layout;
  stored.projectOrder = { sort: "manual", manualIds: ["gone", "b", "b", "a"] };
  const user = userEvent.setup();
  const { unmount } = render(<App />); await ready();
  expect(names()).toEqual(["サイト", "アプリ2", "アプリ10"]);
  handle("アプリ10").focus(); await user.keyboard("{Home}");
  await waitFor(() => expect(names()).toEqual(["アプリ10", "サイト", "アプリ2"]));
  expect(document.activeElement).toBe(handle("アプリ10"));
  expect(screen.getByText("「アプリ10」を3件中1番目に移動しました。")).toBeTruthy();
  await user.keyboard("{ArrowDown}"); await ready();
  expect(names()).toEqual(["サイト", "アプリ10", "アプリ2"]);
  await user.keyboard("{End}"); await ready();
  expect(names()).toEqual(["サイト", "アプリ2", "アプリ10"]);
  await user.keyboard("{ArrowDown}");
  expect(stored.projectOrder.manualIds).toEqual(["c", "b", "a"]);
  await user.selectOptions(screen.getByRole("combobox", { name: "並び順" }), "name");
  expect(screen.queryByRole("button", { name: /順序を変更/ })).toBeNull();
  await user.selectOptions(screen.getByRole("combobox", { name: "並び順" }), "manual");
  await user.type(screen.getByRole("searchbox"), "アプリ");
  expect(names()).toEqual(["アプリ2", "アプリ10"]);
  expect(handle("アプリ10").getAttribute("aria-disabled")).toBe("true");
  expect(handle("アプリ10").getAttribute("draggable")).toBe("false");
  const saves = vi.mocked(saveSettings).mock.calls.length;
  handle("アプリ10").focus(); await user.keyboard("{Home}");
  expect(saveSettings).toHaveBeenCalledTimes(saves);
  unmount(); render(<App />); await ready();
  expect(names()).toEqual(["サイト", "アプリ2", "アプリ10"]);
});

it("uses the same manual move for drag and drop and ignores external drops", async () => {
  stored.projectOrder = { sort: "manual", manualIds: ["a", "b", "c"] };
  render(<App />); await ready();
  const transfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  const target = handle("サイト").closest("li")!;
  fireEvent.drop(target, { dataTransfer: transfer });
  expect(saveSettings).not.toHaveBeenCalled();
  fireEvent.dragStart(handle("アプリ10"), { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer });
  expect(target.classList.contains("drop-target")).toBe(true);
  fireEvent.drop(target, { dataTransfer: transfer });
  await waitFor(() => expect(names()).toEqual(["アプリ2", "サイト", "アプリ10"]));
  expect(stored.projectOrder.manualIds).toEqual(["b", "c", "a"]);
});

it("keeps the saved order on failure and retries with current unrelated preferences", async () => {
  stored.projectOrder = { sort: "manual", manualIds: ["a", "b", "c"] };
  const user = userEvent.setup(); render(<App />); await ready();
  vi.mocked(saveSettings).mockRejectedValueOnce("書き込めません");
  handle("アプリ10").focus(); await user.keyboard("{End}");
  expect((await screen.findByRole("alert")).textContent).toContain("書き込めません");
  expect(names()).toEqual(["アプリ10", "アプリ2", "サイト"]);
  stored.theme = "light";
  await user.click(screen.getByRole("button", { name: "もう一度保存" }));
  await waitFor(() => expect(names()).toEqual(["アプリ2", "サイト", "アプリ10"]));
  expect(stored.theme).toBe("light");
  expect(screen.queryByRole("alert")).toBeNull();
  vi.mocked(saveSettings).mockRejectedValueOnce("選択を保存できません");
  await user.selectOptions(screen.getByRole("combobox", { name: "並び順" }), "name");
  await screen.findByRole("alert");
  expect((screen.getByRole("combobox", { name: "並び順" }) as HTMLSelectElement).value).toBe("manual");
  await user.click(screen.getByRole("button", { name: "もう一度保存" }));
  await ready();
  expect(stored.projectOrder.sort).toBe("name");
  expect(stored.projectOrder.manualIds).toEqual(["b", "c", "a"]);
});

it("prepends new registrations to manual placement in automatic mode and removes unregistered IDs", async () => {
  stored.projectOrder = { sort: "name", manualIds: ["a", "c", "b"], pinnedIds: ["a"] };
  const added = fixture("new", "新しいアプリ");
  vi.mocked(projectsApi.addProject).mockResolvedValue(added);
  vi.mocked(projectsApi.removeProject).mockResolvedValue();
  const user = userEvent.setup(); render(<App />); await ready();
  await user.click(screen.getByRole("button", { name: "プロジェクトを追加" }));
  await user.type(screen.getByRole("textbox", { name: "プロジェクト名" }), added.name);
  await user.click(screen.getByRole("button", { name: "URL" }));
  await user.type(screen.getByRole("textbox", { name: /起動URL/ }), added.launchUrl!);
  await user.click(screen.getByRole("button", { name: "登録する" }));
  await waitFor(() => expect(stored.projectOrder.manualIds).toEqual(["new", "a", "c", "b"]));
  expect(stored.projectOrder.sort).toBe("name");
  expect(names()).toEqual(["アプリ10", "アプリ2", "サイト", "新しいアプリ"]);
  await user.selectOptions(screen.getByRole("combobox", { name: "並び順" }), "manual");
  expect(names().slice(0, 2)).toEqual(["アプリ10", added.name]);
  await user.click(screen.getByRole("button", { name: "アプリ10の詳細を開く" }));
  await user.click(screen.getByRole("button", { name: "登録を解除" }));
  await user.click(screen.getByRole("button", { name: "登録解除を確定" }));
  await waitFor(() => expect(stored.projectOrder.manualIds).toEqual(["new", "c", "b"]));
  expect(stored.projectOrder.pinnedIds).toEqual([]);
  expect(names()).toEqual(["新しいアプリ", "サイト", "アプリ2"]);
});

it("pins from either layout, preserves pins across sorting and reload, and retries a failed unpin", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<App />);
  await ready();
  const pin = { name: "アプリ10のピン留め" };
  screen.getByRole("button", pin).focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("button", { ...pin, pressed: true });
  expect(names()).toEqual(["アプリ10", "アプリ2", "サイト"]);
  expect(stored.projectOrder.pinnedIds).toEqual(["a"]);
  await user.selectOptions(screen.getByRole("combobox", { name: "並び順" }), "newest");
  await user.click(screen.getByRole("button", { name: "リスト" }));
  expect(names()).toEqual(["アプリ10", "サイト", "アプリ2"]);
  await user.type(screen.getByRole("searchbox"), "サイト");
  expect(names()).toEqual(["サイト"]);
  unmount();
  render(<App />);
  await ready();
  expect(names()).toEqual(["アプリ10", "サイト", "アプリ2"]);
  vi.mocked(saveSettings).mockRejectedValueOnce("書き込めません");
  await user.click(screen.getByRole("button", { ...pin, pressed: true }));
  expect((await screen.findByRole("alert")).textContent).toContain("書き込めません");
  expect(names()[0]).toBe("アプリ10");
  await user.click(screen.getByRole("button", { name: "もう一度保存" }));
  await screen.findByRole("button", { ...pin, pressed: false });
  expect(names()).toEqual(["サイト", "アプリ2", "アプリ10"]);
  expect(stored.projectOrder.pinnedIds).toEqual([]);
});

it("reorders within a pin group without treating visible indexes as saved indexes", async () => {
  stored.projectOrder = { sort: "manual", manualIds: ["a", "b", "c"], pinnedIds: ["a", "c"] };
  const user = userEvent.setup();
  render(<App />);
  await ready();
  expect(names()).toEqual(["アプリ10", "サイト", "アプリ2"]);
  handle("アプリ10").focus();
  await user.keyboard("{End}");
  await waitFor(() => expect(names()).toEqual(["サイト", "アプリ10", "アプリ2"]));
  expect(stored.projectOrder.manualIds).toEqual(["b", "c", "a"]);
  await user.keyboard("{ArrowDown}");
  const transfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(handle("アプリ10"), { dataTransfer: transfer });
  const otherGroup = handle("アプリ2").closest("li")!;
  fireEvent.dragOver(otherGroup, { dataTransfer: transfer });
  expect(otherGroup.classList.contains("drop-target")).toBe(false);
  fireEvent.drop(otherGroup, { dataTransfer: transfer });
  expect(saveSettings).toHaveBeenCalledTimes(1);
  expect(stored.projectOrder.pinnedIds).toEqual(["a", "c"]);
});


it("serializes manual saves and leaves focus and placement stable while pending", async () => {
  stored.projectOrder = { sort: "manual", manualIds: ["a", "b", "c"] };
  let finish!: (settings: Settings) => void;
  vi.mocked(saveSettings).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const user = userEvent.setup(); render(<App />); await ready();
  handle("アプリ10").focus(); await user.keyboard("{End}");
  expect(handle("アプリ10").getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByRole("combobox", { name: "並び順" }).matches(":disabled")).toBe(true);
  await user.keyboard("{ArrowDown}{Home}");
  expect(saveSettings).toHaveBeenCalledTimes(1);
  expect(names()).toEqual(["アプリ10", "アプリ2", "サイト"]);
  await act(async () => finish({ ...stored, projectOrder: { sort: "manual", manualIds: ["b", "c", "a"] } }));
  await waitFor(() => expect(names()).toEqual(["アプリ2", "サイト", "アプリ10"]));
  expect(document.activeElement).toBe(handle("アプリ10"));
});
