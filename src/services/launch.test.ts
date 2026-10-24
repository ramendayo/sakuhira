import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { resumeProject, setProjectLaunchUrl } from "./launch";

const project = { id: "id", name: "Project", path: "/project", launchUrl: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };
beforeEach(() => vi.stubGlobal("isTauri", true));
afterEach(() => { clearMocks(); vi.unstubAllGlobals(); });

it("sends saved project expectations and normalizes optional URL arguments", async () => {
  const handler = vi.fn(() => project);
  mockIPC(handler);
  await setProjectLaunchUrl(project, " https://example.com ");
  await setProjectLaunchUrl(project, "  ");
  await resumeProject(project);
  expect(handler).toHaveBeenNthCalledWith(1, "set_project_launch_url", { project, url: "https://example.com" });
  expect(handler).toHaveBeenNthCalledWith(2, "set_project_launch_url", { project, url: null });
  expect(handler).toHaveBeenNthCalledWith(3, "resume_project", { project });
});

it("propagates launch failures and prevents browser-only native calls", async () => {
  mockIPC(() => { throw "起動できません"; });
  await expect(resumeProject(project)).rejects.toBe("起動できません");
  vi.stubGlobal("isTauri", false);
  await expect(resumeProject(project)).rejects.toThrow("デスクトップアプリ");
  await expect(setProjectLaunchUrl(project, "")).rejects.toThrow("デスクトップアプリ");
});
