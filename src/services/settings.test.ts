import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { applyTheme, getSettings, saveSettings } from "./settings";
import { readQuickResumeShortcutIssue, setQuickResumeShortcut } from "./shortcuts";
import type { Settings } from "../types/settings";

beforeEach(() => vi.stubGlobal("isTauri", true));
afterEach(() => { clearMocks(); vi.unstubAllGlobals(); });

it("uses a dedicated shortcut command with a settings baseline and reads restoration failures", async () => {
  const expected: Settings = {
    defaultEditor: "vsCode", theme: "light",
    projectView: { layout: "cards", cardSize: "standard" },
    projectOrder: { sort: "recent", manualIds: [] },
  };
  const shortcut = "Control+KeyJ";
  const saved = { ...expected, quickResumeShortcut: shortcut };
  const failure = "クイック再開のショートカットを復元できません。";
  const handler = vi.fn((command: string) => command === "set_quick_resume_shortcut" ? saved : failure);
  mockIPC(handler);
  expect(await setQuickResumeShortcut(expected, shortcut)).toEqual(saved);
  expect(handler).toHaveBeenNthCalledWith(1, "set_quick_resume_shortcut", { expected, shortcut });
  expect(await readQuickResumeShortcutIssue()).toBe(failure);
  expect(handler).toHaveBeenNthCalledWith(2, "get_quick_resume_shortcut_error", {});
});

it("applies the saved native theme without exposing arbitrary window commands", async () => {
  const handler = vi.fn();
  mockIPC(handler);
  await applyTheme();
  expect(handler).toHaveBeenCalledWith("apply_theme", {});
  vi.stubGlobal("isTauri", false);
  await applyTheme();
  expect(handler).toHaveBeenCalledTimes(1);
});

it("reads settings and submits the original value for conflict detection", async () => {
  const handler = vi.fn((_command: string) => ({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" }));
  mockIPC(handler);
  expect(await getSettings()).toEqual({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" });
  await saveSettings({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" }, { projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" });
  expect(handler.mock.calls[0][0]).toBe("get_settings");
  expect(handler).toHaveBeenLastCalledWith("save_settings", { expected: { projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" }, settings: { projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" } });
});

it("propagates settings errors and blocks browser-only writes", async () => {
  mockIPC(() => { throw "設定を読み込めません"; });
  await expect(getSettings()).rejects.toBe("設定を読み込めません");
  await expect(applyTheme()).rejects.toBe("設定を読み込めません");
  vi.stubGlobal("isTauri", false);
  await expect(getSettings()).rejects.toThrow("デスクトップアプリ");
  await expect(saveSettings({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" }, { projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" })).rejects.toThrow("デスクトップアプリ");
});
