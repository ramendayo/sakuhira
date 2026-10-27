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
  const handler = vi.fn((_command: string) => ({ theme: "light", defaultEditor: "cursor" }));
  mockIPC(handler);
  expect(await getSettings()).toEqual({ theme: "light", defaultEditor: "cursor" });
  await saveSettings({ theme: "light", defaultEditor: "vsCode" }, { theme: "light", defaultEditor: "cursor" });
  expect(handler.mock.calls[0][0]).toBe("get_settings");
  expect(handler).toHaveBeenLastCalledWith("save_settings", { expected: { theme: "light", defaultEditor: "vsCode" }, settings: { theme: "light", defaultEditor: "cursor" } });
});

it("propagates settings errors and blocks browser-only writes", async () => {
  mockIPC(() => { throw "設定を読み込めません"; });
  await expect(getSettings()).rejects.toBe("設定を読み込めません");
  await expect(applyTheme()).rejects.toBe("設定を読み込めません");
  vi.stubGlobal("isTauri", false);
  await expect(getSettings()).rejects.toThrow("デスクトップアプリ");
  await expect(saveSettings({ theme: "light", defaultEditor: "vsCode" }, { theme: "light", defaultEditor: "cursor" })).rejects.toThrow("デスクトップアプリ");
});
