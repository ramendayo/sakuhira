import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectForm from "./ProjectForm";
import * as api from "../services/projects";
import * as shortcuts from "../services/shortcuts";
import type { Project } from "../types/project";

vi.mock("../services/projects", async (importOriginal) => ({
  ...await importOriginal<typeof api>(),
  updateProject: vi.fn(),
}));
vi.mock("../services/shortcuts", () => ({
  supportsShortcuts: vi.fn(() => false),
  onCapturedShortcut: vi.fn(),
  setShortcutCapture: vi.fn(),
}));
afterEach(cleanup);

it("captures a registered key without resuming, preserves drafts after a conflict, and clears on retry", async () => {
  const project: Project = {
    id: "docs", name: "Docs", path: null, launchUrl: "https://example.com/",
    lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null },
    shortcut: "Control+KeyA",
  };
  const cleared = { ...project, name: "Draft", shortcut: undefined };
  const onSaved = vi.fn();
  const unlisten = vi.fn();
  let onNativeKey: (shortcut: string) => void = () => {};
  vi.mocked(shortcuts.supportsShortcuts).mockReturnValue(true);
  vi.mocked(shortcuts.onCapturedShortcut).mockImplementation(async (handler) => {
    onNativeKey = handler;
    return unlisten;
  });
  vi.mocked(shortcuts.setShortcutCapture).mockResolvedValue(undefined);
  vi.mocked(api.updateProject).mockRejectedValueOnce("このショートカットは「Other」に割り当てられています。").mockResolvedValueOnce(cleared);
  const user = userEvent.setup();
  render(<ProjectForm project={project} onSaved={onSaved} onCancel={vi.fn()} />);
  const field = within(screen.getByRole("group", { name: "グローバルショートカット" }));
  const name = screen.getByRole<HTMLInputElement>("textbox", { name: "プロジェクト名" });
  await user.clear(name);
  await user.type(name, "Draft");

  await user.click(field.getByRole("button", { name: "キーを入力" }));
  const input = await field.findByRole("button", { name: "キーを入力してください", pressed: true });
  fireEvent.keyDown(input, { key: "b", code: "KeyB", ctrlKey: true });
  expect(field.getByText("⌃ + B")).toBeTruthy();
  await waitFor(() => expect(shortcuts.setShortcutCapture).toHaveBeenLastCalledWith(false));
  await user.click(field.getByRole("button", { name: "キーを入力" }));
  await field.findByRole("button", { name: "キーを入力してください" });
  act(() => onNativeKey("Control+KeyC"));
  expect(field.getByText("⌃ + C")).toBeTruthy();
  expect(unlisten).toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "変更を保存" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Other"));
  expect(name.value).toBe("Draft");
  expect(field.getByText("⌃ + C")).toBeTruthy();
  expect(onSaved).not.toHaveBeenCalled();

  await user.click(field.getByRole("button", { name: "キーを入力" }));
  await field.findByRole("button", { name: "キーを入力してください" });
  await user.keyboard("{Escape}");
  expect(field.getByText("⌃ + C")).toBeTruthy();
  await user.click(field.getByRole("button", { name: "ショートカットを解除" }));
  await user.click(screen.getByRole("button", { name: "変更を保存" }));
  expect(api.updateProject).toHaveBeenLastCalledWith(project, "Draft", null, { mode: "auto" }, { shortcut: null });
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(cleared));
  vi.mocked(shortcuts.supportsShortcuts).mockReturnValue(false);
});

it("keeps the editing baseline when newer data arrives during editing", async () => {
  const original = { id: "id", name: "Original", path: "/original", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };
  const newer = { ...original, name: "Updated elsewhere" };
  vi.mocked(api.updateProject).mockRejectedValue("別の操作で更新されています");
  const user = userEvent.setup();
  const onSaved = vi.fn();
  const { rerender } = render(<ProjectForm project={original} onSaved={onSaved} onCancel={vi.fn()} />);
  expect(screen.queryByLabelText("起動URL（任意）")).toBeNull();
  await user.clear(screen.getByLabelText("プロジェクト名"));
  await user.type(screen.getByLabelText("プロジェクト名"), "My draft");
  rerender(<ProjectForm project={newer} onSaved={onSaved} onCancel={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "変更を保存" }));
  expect(api.updateProject).toHaveBeenCalledWith(original, "My draft", original.path, { mode: "auto" });
  expect((await screen.findByRole("alert")).textContent).toContain("別の操作");
  expect(onSaved).not.toHaveBeenCalled();
});

it("previews independent icon choices and keeps the draft after a failed save", async () => {
  const project: Project = {
    id: "lab", name: "Lab", path: null, launchUrl: "https://example.com/",
    lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null },
  };
  const updated: Project = {
    ...project, name: "Experiments", icon: { mode: "custom", shape: "flask", color: "default" },
  };
  vi.mocked(api.updateProject).mockRejectedValueOnce("保存できませんでした").mockResolvedValueOnce(updated);
  const user = userEvent.setup();
  const onSaved = vi.fn();
  const { unmount } = render(<ProjectForm project={project} onSaved={onSaved} onCancel={vi.fn()} />);
  expect(screen.getByRole("radio", { name: "自動", checked: true })).toBeTruthy();
  const preview = within(screen.getByRole("group", { name: "アイコンのプレビュー" }));
  const previewPath = () => preview.getByText("プレビュー").querySelector("path")?.getAttribute("d");
  const automaticShape = previewPath();
  expect(automaticShape).toBeTruthy();
  await user.click(screen.getByRole("radio", { name: "カスタム" }));
  expect(screen.getByRole("radio", { name: "カスタム", checked: true })).toBeTruthy();
  const shapes = within(screen.getByRole("group", { name: "形" }));
  expect(shapes.getAllByRole("radio")).toHaveLength(7);
  await user.click(shapes.getByText("フラスコ"));
  expect(shapes.getByRole("radio", { name: "フラスコ", checked: true })).toBeTruthy();
  const customShape = previewPath();
  expect(customShape).not.toBe(automaticShape);
  await user.selectOptions(screen.getByRole("combobox", { name: "背景色" }), "purple");
  expect(previewPath()).toBe(customShape);
  expect(preview.getByText("プレビュー").querySelector("[data-icon-color]")?.getAttribute("data-icon-color")).toBe("purple");
  await user.selectOptions(screen.getByRole("combobox", { name: "背景色" }), "デフォルト");
  expect(previewPath()).toBe(customShape);
  expect(preview.getByText("プレビュー").querySelector("[data-icon-color]")).toBeNull();

  const name = screen.getByRole<HTMLInputElement>("textbox", { name: "プロジェクト名" });
  await user.clear(name);
  await user.type(name, updated.name);
  const save = screen.getByRole("button", { name: "変更を保存" });
  await user.click(save);
  expect((await screen.findByRole("alert")).textContent).toContain("保存できませんでした");
  expect(name.value).toBe(updated.name);
  expect(shapes.getByRole("radio", { name: "フラスコ", checked: true })).toBeTruthy();
  expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "背景色" }).value).toBe("default");
  expect(onSaved).not.toHaveBeenCalled();
  await user.click(save);
  expect(api.updateProject).toHaveBeenLastCalledWith(project, updated.name, null, updated.icon);
  expect(onSaved).toHaveBeenCalledWith(updated);

  unmount();
  vi.mocked(api.updateProject).mockResolvedValueOnce({ ...updated, icon: undefined });
  render(<ProjectForm project={updated} onSaved={onSaved} onCancel={vi.fn()} />);
  expect(screen.getByRole("radio", { name: "カスタム", checked: true })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "フラスコ", checked: true })).toBeTruthy();
  expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "背景色" }).value).toBe("default");
  await user.click(screen.getByRole("radio", { name: "自動" }));
  expect(screen.queryByRole("group", { name: "形" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "変更を保存" }));
  expect(api.updateProject).toHaveBeenLastCalledWith(updated, updated.name, null, { mode: "auto" });
});
