import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import { defaultProjectOrder, defaultProjectView } from "./types/settings";

afterEach(async () => {
  await act(() => cleanup());
  clearMocks();
  vi.unstubAllGlobals();
});

it("returns to the project list on request without reloading projects across navigation", async () => {
  vi.stubGlobal("isTauri", true);
  const listProjects = vi.fn(() => [{
    id: "docs", name: "開発", path: null, launchUrl: "https://example.com/",
    notes: { lastWork: "", nextTask: "", updatedAt: null }, lastResumedAt: null,
  }]);
  mockIPC((command) => {
    if (command === "get_settings") {
      return { theme: "light", defaultEditor: "vsCode", projectOrder: defaultProjectOrder, projectView: defaultProjectView };
    }
    if (command === "list_projects") return listProjects();
  }, { shouldMockEvents: true });

  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "開発の詳細を開く" }));
  expect(screen.getByRole("heading", { name: "開発", level: 1 })).toBe(document.activeElement);
  await user.click(screen.getByRole("link", { name: "設定" }));
  expect(await screen.findByRole("heading", { name: "設定", level: 1 })).toBeTruthy();
  await act(() => emit("show-project-list"));
  expect(await screen.findByRole("heading", { name: "プロジェクト", level: 1 })).toBeTruthy();
  expect(screen.getByRole("button", { name: "開発の詳細を開く" })).toBeTruthy();
  expect(listProjects).toHaveBeenCalledTimes(1);
});

it("shows per-target launch errors from a project shortcut", async () => {
  vi.stubGlobal("isTauri", true);
  mockIPC((command) => {
    if (command === "get_settings") {
      return { theme: "light", defaultEditor: "vsCode", projectOrder: defaultProjectOrder, projectView: defaultProjectView };
    }
    if (command === "list_projects") return [];
  }, { shouldMockEvents: true });

  const user = userEvent.setup();
  render(<App />);
  await act(() => emit("project-shortcut-launch-failed", {
    projectName: "開発",
    result: { Ok: {
      editorName: "VS Code",
      editor: { status: "success" },
      browser: null,
      apps: [
        { target: { appPath: "/Applications/Preview.app", filePath: "/work/仕様書.pdf" }, outcome: { status: "error", message: "ファイルが見つかりません。" } },
        { target: { appPath: "/Applications/Slack.app", filePath: null }, outcome: { status: "success" } },
      ],
      history: { status: "saved", timestamp: 100 },
    } },
  }));
  expect(screen.getByRole("alert").textContent).toContain("「開発」をショートカットで再開");
  expect(screen.getByRole("alert").textContent).toContain("Preview（仕様書.pdf）：ファイルが見つかりません。");
  expect(screen.getByRole("alert").textContent).not.toContain("Slack");
  await user.click(screen.getByRole("button", { name: "通知を閉じる" }));
  expect(screen.queryByRole("alert")).toBeNull();
});
