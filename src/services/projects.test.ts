import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { addProject, listProjects, selectProjectDirectory } from "./projects";

beforeEach(() => vi.stubGlobal("isTauri", true));
afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
});

it("passes registration arguments through the Tauri bridge", async () => {
  const result = { id: "id", name: "Example", path: "/example" };
  const handler = vi.fn(() => result);
  mockIPC(handler);
  expect(await addProject(result.name, result.path)).toEqual(result);
  expect(handler).toHaveBeenCalledWith("add_project", { name: result.name, path: result.path });
});

it("loads projects and treats folder picker cancellation as a normal result", async () => {
  const handler = vi.fn((command: string) => command === "list_projects" ? [] : null);
  mockIPC(handler);
  expect(await listProjects()).toEqual([]);
  expect(await selectProjectDirectory()).toBeNull();
  expect(handler.mock.calls.map(([command]) => command)).toEqual(["list_projects", "select_project_directory"]);
});

it("propagates backend errors to the caller", async () => {
  mockIPC(() => { throw "保存できません"; });
  await expect(addProject("Example", "/example")).rejects.toBe("保存できません");
});

it("reports browser-only execution without attempting native commands", async () => {
  vi.stubGlobal("isTauri", false);
  const handler = vi.fn();
  mockIPC(handler);
  await expect(listProjects()).rejects.toThrow("デスクトップアプリ");
  expect(handler).not.toHaveBeenCalled();
});
