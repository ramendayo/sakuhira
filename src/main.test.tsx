import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultProjectOrder, defaultProjectView } from "./types/settings";

const loaded = vi.hoisted(() => [] as string[]);
vi.mock("react-markdown", () => { loaded.push("react-markdown"); return { default: () => null }; });
vi.mock("remark-parse", async (original) => { loaded.push("remark-parse"); return await original(); });

beforeEach(() => {
  loaded.length = 0;
  vi.resetModules();
  vi.stubGlobal("isTauri", true);
  document.body.innerHTML = '<div id="root"></div>';
  mockIPC((command) => {
    if (command === "list_projects") return [];
    if (command === "get_settings") {
      return { theme: "light", defaultEditor: "vsCode", projectOrder: defaultProjectOrder, projectView: defaultProjectView };
    }
  }, { shouldMockEvents: true });
});

afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("opens quick resume without loading the Markdown renderer", async () => {
  mockWindows("quick-resume");
  await act(async () => { await import("./main"); });
  expect(await screen.findByRole("main", { name: "sakuhira" })).toBeTruthy();
  expect(loaded).toEqual([]);
});

it("opens the project list in the main window", async () => {
  mockWindows("main");
  await act(async () => { await import("./main"); });
  expect(loaded).toContain("react-markdown");
  expect(screen.queryByRole("main", { name: "sakuhira" })).toBeNull();
});
