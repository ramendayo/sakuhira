import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { setProjectNotes } from "./notes";

const project = { id: "id", name: "Project", path: "/project", launchUrl: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };
beforeEach(() => vi.stubGlobal("isTauri", true));
afterEach(() => { clearMocks(); vi.unstubAllGlobals(); });

it("preserves whitespace and sends the original record without a client timestamp", async () => {
  const handler = vi.fn(() => project);
  mockIPC(handler);
  await setProjectNotes(project, "  previous\n", "next\n  task");
  expect(handler).toHaveBeenCalledWith("set_project_notes", { project, lastWork: "  previous\n", nextTask: "next\n  task" });
});

it("propagates backend errors and rejects browser-only saves", async () => {
  mockIPC(() => { throw "保存できません"; });
  await expect(setProjectNotes(project, "work", "next")).rejects.toBe("保存できません");
  vi.stubGlobal("isTauri", false);
  await expect(setProjectNotes(project, "", "")).rejects.toThrow("デスクトップアプリ");
});
