import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { applyTheme, getSettings, saveSettings } from "./settings";

beforeEach(() => vi.stubGlobal("isTauri", true));
afterEach(() => { clearMocks(); vi.unstubAllGlobals(); });

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
  const handler = vi.fn((_command: string) => ({ projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" }));
  mockIPC(handler);
  expect(await getSettings()).toEqual({ projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" });
  await saveSettings({ projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" }, { projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" });
  expect(handler.mock.calls[0][0]).toBe("get_settings");
  expect(handler).toHaveBeenLastCalledWith("save_settings", { expected: { projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" }, settings: { projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" } });
});

it("propagates settings errors and blocks browser-only writes", async () => {
  mockIPC(() => { throw "設定を読み込めません"; });
  await expect(getSettings()).rejects.toBe("設定を読み込めません");
  await expect(applyTheme()).rejects.toBe("設定を読み込めません");
  vi.stubGlobal("isTauri", false);
  await expect(getSettings()).rejects.toThrow("デスクトップアプリ");
  await expect(saveSettings({ projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" }, { projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "cursor" })).rejects.toThrow("デスクトップアプリ");
});
