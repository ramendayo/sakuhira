import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { addProject, listProjects, selectProjectDirectory } from "./projects";

beforeEach(() => vi.stubGlobal("isTauri", true));
afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
});

it("passes registration arguments through the Tauri bridge", async () => {
  const result = { id: "id", name: "Example", path: "/example", launchUrl: null };
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

it("sends the original record with edit and removal commands to detect conflicts", async () => {
  const { updateProject, removeProject } = await import("./projects");
  const project = { id: "id", name: "Original", path: "/original", launchUrl: null };
  const edited = { ...project, name: "Edited", path: "/edited", launchUrl: null };
  const handler = vi.fn((command: string) => command === "update_project" ? edited : undefined);
  mockIPC(handler);
  expect(await updateProject(project, edited.name, edited.path)).toEqual(edited);
  await removeProject(edited);
  expect(handler).toHaveBeenNthCalledWith(1, "update_project", { project, name: edited.name, path: edited.path });
  expect(handler).toHaveBeenNthCalledWith(2, "remove_project", { project: edited });
});
