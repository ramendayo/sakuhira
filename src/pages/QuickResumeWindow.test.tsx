import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { ResumeReport } from "../types/launch";
import type { Project } from "../types/project";
import QuickResumeWindow, { QuickResumeSearch } from "./QuickResumeWindow";

const pinned: Project = {
  id: "pinned", name: "ガイド", path: null, launchUrl: "https://example.com/guide",
  notes: { lastWork: "", nextTask: "", updatedAt: null }, lastResumedAt: null,
};
const latest: Project = {
  ...pinned, id: "latest", name: "開発ツール", path: "/work/tool", launchUrl: null, lastResumedAt: 100,
};

afterEach(() => {
  cleanup();
  clearMocks();
  vi.unstubAllGlobals();
});

it("focuses an empty search and starts on the most recently resumed project each time it opens", async () => {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  const onResume = vi.fn();
  const props = { projects: [pinned, latest], pinnedIds: [pinned.id], onDismiss, onResume, onOpenReentry: vi.fn() };
  const { rerender } = render(<QuickResumeSearch key="first" {...props} />);
  const input = screen.getByRole<HTMLInputElement>("combobox", { name: "プロジェクトを検索" });
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("");
  expect(screen.getByRole("option", { name: /開発ツール/, selected: true })).toBeTruthy();
  expect(screen.getByText("/work/tool")).toBeTruthy();
  expect(screen.getByText("https://example.com/guide")).toBeTruthy();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onResume).toHaveBeenCalledWith(pinned);
  await user.keyboard("{ArrowUp}{Enter}");
  expect(onResume).toHaveBeenLastCalledWith(latest);
  await user.type(input, "ガイド");
  expect(screen.getByRole("option", { selected: true }).textContent).toContain("ガイド");
  await user.keyboard("{Escape}");
  expect(onDismiss).toHaveBeenCalledOnce();

  rerender(<QuickResumeSearch key="reopened" {...props} />);
  const reopened = screen.getByRole<HTMLInputElement>("combobox");
  expect(document.activeElement).toBe(reopened);
  expect(reopened.value).toBe("");
  expect(screen.getByRole("option", { name: /開発ツール/, selected: true })).toBeTruthy();
});

it("leaves IME confirmation and an empty result alone", async () => {
  const user = userEvent.setup();
  const onResume = vi.fn();
  const onDismiss = vi.fn();
  render(<QuickResumeSearch projects={[latest]} onResume={onResume} onDismiss={onDismiss} onOpenReentry={vi.fn()} />);
  const input = screen.getByRole("combobox");
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(onResume).not.toHaveBeenCalled();
  expect(onDismiss).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  expect(onResume).toHaveBeenCalledOnce();

  await user.type(input, "該当なし");
  expect(screen.getByRole("status").textContent).toContain("一致するプロジェクトがありません");
  expect(input.getAttribute("aria-activedescendant")).toBeNull();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onResume).toHaveBeenCalledOnce();
});

it("resumes a clicked candidate and retains the query and selection after a partial failure", async () => {
  vi.stubGlobal("isTauri", true);
  const other = { ...pinned, name: "開発ガイド", path: "/work/guide" };
  const success: ResumeReport = {
    editorName: "VS Code", editor: { status: "success" }, browser: { status: "success" },
    history: { status: "saved", timestamp: 200 },
  };
  let finish!: (report: ResumeReport) => void;
  const resume = vi.fn()
    .mockImplementationOnce(() => new Promise<ResumeReport>((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce(success);
  mockIPC((command, args) => {
    switch (command) {
      case "get_settings": return { theme: "light", defaultEditor: "vsCode", projectOrder: { sort: "recent", manualIds: [] } };
      case "list_projects": return [latest, other];
      case "resume_project": return resume(args);
      default: return undefined;
    }
  }, { shouldMockEvents: true });

  const user = userEvent.setup();
  render(<QuickResumeWindow />);
  await screen.findByRole("option", { name: /開発ツール/, selected: true });
  const input = screen.getByRole<HTMLInputElement>("combobox");
  await user.type(input, "開発");
  const candidate = screen.getByRole("option", { name: /開発ガイド/, selected: false });
  await user.dblClick(candidate);
  await user.keyboard("{Enter}");
  expect(screen.getByRole("status").textContent).toBe("起動中…");
  expect(resume).toHaveBeenCalledExactlyOnceWith({ project: other });
  await act(async () => finish({ ...success, browser: { status: "error", message: "起動先を開けませんでした。" } }));
  expect(screen.getByRole("alert").textContent).toBe("ブラウザ：起動先を開けませんでした。");
  expect(input.value).toBe("開発");
  expect(screen.getByRole("option", { name: /開発ガイド/, selected: true })).toBeTruthy();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(resume).toHaveBeenCalledTimes(2);
  expect(resume).toHaveBeenLastCalledWith({ project: other });
});

it("opens Reentry with Tab and Enter from an empty search and allows retry after failure", async () => {
  vi.stubGlobal("isTauri", true);
  const openReentry = vi.fn()
    .mockRejectedValueOnce("メインウィンドウを表示できません。")
    .mockResolvedValueOnce(undefined);
  const resume = vi.fn();
  const dismiss = vi.fn();
  mockIPC((command, args) => {
    switch (command) {
      case "get_settings": return { theme: "light", defaultEditor: "vsCode", projectOrder: { sort: "recent", manualIds: [] } };
      case "list_projects": return [latest];
      case "open_reentry": return openReentry(args);
      case "resume_project": return resume();
      case "close_quick_resume": return dismiss();
      default: return undefined;
    }
  }, { shouldMockEvents: true });

  const user = userEvent.setup();
  render(<QuickResumeWindow />);
  await screen.findByRole("option");
  const input = screen.getByRole<HTMLInputElement>("combobox");
  await user.type(input, "該当なし");
  expect(screen.getByRole("status").textContent).toContain("一致するプロジェクトがありません");
  await user.tab();
  const button = screen.getByRole("button", { name: "Reentryを開く" });
  expect(document.activeElement).toBe(button);
  await user.keyboard("{Enter}");
  expect((await screen.findByRole("alert")).textContent).toBe("メインウィンドウを表示できません。");
  expect(openReentry).toHaveBeenCalledExactlyOnceWith({});
  expect(resume).not.toHaveBeenCalled();
  expect(input.value).toBe("該当なし");
  expect(document.activeElement).toBe(button);
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(openReentry).toHaveBeenCalledTimes(2);
  await user.keyboard("{Escape}");
  expect(dismiss).toHaveBeenCalledOnce();
});
