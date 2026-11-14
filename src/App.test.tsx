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

it("returns the main window from settings to the project list on request", async () => {
  vi.stubGlobal("isTauri", true);
  mockIPC((command) => {
    if (command === "get_settings") {
      return { theme: "light", defaultEditor: "vsCode", projectOrder: defaultProjectOrder, projectView: defaultProjectView };
    }
    if (command === "list_projects") return [];
  }, { shouldMockEvents: true });

  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "設定" }));
  expect(await screen.findByRole("heading", { name: "設定", level: 1 })).toBeTruthy();
  await act(() => emit("show-project-list"));
  expect(await screen.findByRole("heading", { name: "プロジェクト", level: 1 })).toBeTruthy();
});
