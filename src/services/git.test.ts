import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { getGitStatus } from "./git";

beforeEach(() => vi.stubGlobal("isTauri", true));
afterEach(() => { clearMocks(); vi.unstubAllGlobals(); });

it("requests Git status by registered project ID", async () => {
  const handler = vi.fn(() => ({ kind: "notRepository" }));
  mockIPC(handler);
  expect(await getGitStatus("project-id")).toEqual({ kind: "notRepository" });
  expect(handler).toHaveBeenCalledWith("get_git_status", { projectId: "project-id" });
});

it("propagates backend errors and rejects browser-only execution", async () => {
  mockIPC(() => { throw "Gitを読み込めません"; });
  await expect(getGitStatus("id")).rejects.toBe("Gitを読み込めません");
  vi.stubGlobal("isTauri", false);
  await expect(getGitStatus("id")).rejects.toThrow("デスクトップアプリ");
});
