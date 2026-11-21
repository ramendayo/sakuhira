import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { addProject, errorMessage, listProjects, selectProjectDirectory, shortcutRegistrationError } from "./projects";

beforeEach(() => vi.stubGlobal("isTauri", true));
afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
});

it("passes registration arguments through the Tauri bridge", async () => {
  const result = { id: "id", name: "Example", path: "/example", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };
  const handler = vi.fn(() => result);
  mockIPC(handler);
  expect(await addProject(result.name, result.path)).toEqual(result);
  expect(handler).toHaveBeenCalledWith("add_project", { name: result.name, path: result.path, launchUrl: null });
});

it("sends an optional registration URL and treats blank input as unset", async () => {
  const handler = vi.fn(() => ({}));
  mockIPC(handler);
  await addProject("Example", "/example", " https://example.com ");
  expect(handler).toHaveBeenLastCalledWith("add_project", { name: "Example", path: "/example", launchUrl: "https://example.com" });
  await addProject("Example", "/example", "   ");
  expect(handler).toHaveBeenLastCalledWith("add_project", { name: "Example", path: "/example", launchUrl: null });
  await addProject("Web", null, "https://example.com");
  expect(handler).toHaveBeenLastCalledWith("add_project", { name: "Web", path: null, launchUrl: "https://example.com" });
});

it("sends icon and shortcut together and exposes shortcut errors to the form", async () => {
  const failure = { field: "shortcut", message: "このショートカットは「Other」に割り当てられています。" };
  const handler = vi.fn(() => { throw failure; });
  mockIPC(handler);
  const icon = { mode: "custom", shape: "code", color: "blue" } as const;
  await expect(addProject("Example", "/example", "https://example.com", { icon, shortcut: "Control+KeyA" }))
    .rejects.toBe(failure);
  expect(handler).toHaveBeenCalledWith("add_project", {
    name: "Example", path: "/example", launchUrl: "https://example.com", icon, shortcut: "Control+KeyA",
  });
  expect(shortcutRegistrationError(failure)).toBe(failure.message);
  expect(errorMessage(failure)).toBe(failure.message);
  expect(shortcutRegistrationError("保存できません")).toBeNull();
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
  const project = { id: "id", name: "Original", path: "/original", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };
  const edited = { ...project, name: "Edited", path: "/edited", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };
  const handler = vi.fn((command: string) => command === "update_project" ? edited : undefined);
  mockIPC(handler);
  expect(await updateProject(project, edited.name, edited.path)).toEqual(edited);
  await removeProject(edited);
  expect(handler).toHaveBeenNthCalledWith(1, "update_project", { project, name: edited.name, path: edited.path });
  expect(handler).toHaveBeenNthCalledWith(2, "remove_project", { project: edited });
});
