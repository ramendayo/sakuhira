import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { getSettings, saveSettings } from "./settings";

beforeEach(() => vi.stubGlobal("isTauri", true));
afterEach(() => { clearMocks(); vi.unstubAllGlobals(); });

it("reads settings and submits the original value for conflict detection", async () => {
  const handler = vi.fn((_command: string) => ({ defaultEditor: "cursor" }));
  mockIPC(handler);
  expect(await getSettings()).toEqual({ defaultEditor: "cursor" });
  await saveSettings({ defaultEditor: "vsCode" }, { defaultEditor: "cursor" });
  expect(handler.mock.calls[0][0]).toBe("get_settings");
  expect(handler).toHaveBeenLastCalledWith("save_settings", { expected: { defaultEditor: "vsCode" }, settings: { defaultEditor: "cursor" } });
});

it("propagates settings errors and blocks browser-only writes", async () => {
  mockIPC(() => { throw "設定を読み込めません"; });
  await expect(getSettings()).rejects.toBe("設定を読み込めません");
  vi.stubGlobal("isTauri", false);
  await expect(getSettings()).rejects.toThrow("デスクトップアプリ");
  await expect(saveSettings({ defaultEditor: "vsCode" }, { defaultEditor: "cursor" })).rejects.toThrow("デスクトップアプリ");
});
