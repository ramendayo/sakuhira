import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectForm from "./ProjectForm";
import ProjectAppLaunchTargets from "./ProjectAppLaunchTargets";
import ProjectIconField from "./ProjectIconField";
import ProjectShortcutField from "./ProjectShortcutField";
import * as launch from "../services/launch";
import * as api from "../services/projects";
import * as shortcuts from "../services/shortcuts";
import type { Project } from "../types/project";

vi.mock("../services/projects", async (importOriginal) => ({
  ...await importOriginal<typeof api>(),
  updateProject: vi.fn(),
  addProject: vi.fn(),
}));
vi.mock("../services/shortcuts", () => ({
  supportsShortcuts: vi.fn(() => false),
  onCapturedShortcut: vi.fn(),
  setShortcutCapture: vi.fn(),
}));
vi.mock("../services/launch", async (importOriginal) => ({
  ...await importOriginal<typeof launch>(),
  supportsAppLaunchTargets: vi.fn(() => false),
  selectProjectLaunchItem: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.mocked(launch.supportsAppLaunchTargets).mockReturnValue(false);
});

it("shows a save error in the shortcut field without replacing the entered key", () => {
  const shortcut = "Control+KeyA";
  const onChange = vi.fn();
  const message = "このショートカットはすでに割り当てられています。";
  const { rerender } = render(<ProjectShortcutField shortcut={shortcut} onChange={onChange} saveError={message} />);
  const field = screen.getByRole("group", { name: "グローバルショートカット", description: message });
  expect(within(field).getByRole("alert").textContent).toBe(message);
  expect(within(field).getByText("⌃ + A")).toBeTruthy();

  rerender(<ProjectShortcutField shortcut={shortcut} onChange={onChange} />);
  expect(within(field).queryByRole("alert")).toBeNull();
});

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

it("registers app and file targets with the project and keeps them for retry", async () => {
  const preview = { appPath: "/System/Applications/Preview.app", filePath: "/work/仕様書.pdf" };
  const slack = { appPath: "/Applications/Slack.app", filePath: null };
  const saved: Project = {
    id: "docs", name: "Docs", path: null, launchUrl: "https://example.com/",
    appLaunchTargets: [preview, slack], lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null },
  };
  vi.mocked(launch.supportsAppLaunchTargets).mockReturnValue(true);
  vi.mocked(launch.selectProjectLaunchItem)
    .mockResolvedValueOnce(preview.appPath)
    .mockResolvedValueOnce(preview.filePath)
    .mockResolvedValueOnce(slack.appPath);
  vi.mocked(api.addProject).mockRejectedValueOnce("起動先のファイルが見つかりません。").mockResolvedValueOnce(saved);

  const user = userEvent.setup();
  const onSaved = vi.fn();
  render(<ProjectForm onSaved={onSaved} onCancel={vi.fn()} />);
  await user.type(screen.getByLabelText("プロジェクト名"), saved.name);
  await user.type(screen.getByLabelText("起動URL（任意）"), saved.launchUrl!);
  await user.click(screen.getByText("再開時に開くアプリ（任意）"));
  const add = () => user.click(screen.getByRole("button", { name: "アプリを追加" }));
  const saveTarget = () => user.click(screen.getByRole("button", { name: "起動先を追加" }));
  const register = () => user.click(screen.getByRole("button", { name: "登録する" }));

  await add();
  await user.click(screen.getByRole("button", { name: "ファイルを選択（任意）" }));
  await register();
  expect(screen.getByRole("alert").textContent).toContain("編集中の起動先");
  expect(api.addProject).not.toHaveBeenCalled();
  await saveTarget();
  await add();
  await saveTarget();
  await user.click(screen.getByText("再開時に開くアプリ（任意） · 2件"));
  await register();

  expect(api.addProject).toHaveBeenNthCalledWith(1, saved.name, null, saved.launchUrl, { appLaunchTargets: [preview, slack] });
  expect(await screen.findByText("起動先のファイルが見つかりません。")).toBeTruthy();
  expect(onSaved).not.toHaveBeenCalled();
  await user.click(screen.getByText("再開時に開くアプリ（任意） · 2件"));
  expect(screen.getByRole("button", { name: "Preview（仕様書.pdf）を変更" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Slackを削除" })).toBeTruthy();
  expect((screen.getByLabelText("プロジェクト名") as HTMLInputElement).value).toBe(saved.name);
  await register();
  expect(api.addProject).toHaveBeenNthCalledWith(2, saved.name, null, saved.launchUrl, { appLaunchTargets: [preview, slack] });
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
});

it("opens the compact icon editor with the keyboard and selects a custom shape", async () => {
  const onCustomChange = vi.fn();
  const onShapeChange = vi.fn();
  const user = userEvent.setup();
  render(<ProjectIconField path={null} appearance={{ mode: "auto" }} compact
    onCustomChange={onCustomChange} onShapeChange={onShapeChange} onColorChange={vi.fn()} />);
  const change = screen.getByRole("button", { name: "アイコンを変更", expanded: false });
  expect(screen.queryByRole("group", { name: "形" })).toBeNull();
  await user.tab();
  expect(document.activeElement).toBe(change);
  await user.keyboard("{Enter}");
  const shape = within(screen.getByRole("group", { name: "形" }));
  expect(screen.getByRole("combobox", { name: "背景色" })).toBeTruthy();
  expect(onCustomChange).not.toHaveBeenCalled();
  await user.click(shape.getByRole("radio", { name: "コード" }));
  expect(onCustomChange).toHaveBeenCalledWith(true);
  expect(onShapeChange).toHaveBeenCalledWith("code");
  await user.click(screen.getByRole("button", { name: "アイコンの変更を閉じる", expanded: true }));
  expect(screen.queryByRole("group", { name: "形" })).toBeNull();
});

it("shows the compact shortcut guide while capturing and hides it on Escape", async () => {
  vi.mocked(shortcuts.onCapturedShortcut).mockResolvedValue(vi.fn());
  vi.mocked(shortcuts.setShortcutCapture).mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<ProjectShortcutField compact legend="再開ショートカット" shortcut={null} onChange={vi.fn()} />);
  const field = within(screen.getByRole("group", { name: "再開ショートカット" }));
  expect(field.queryByText(/Escで入力を終了/)).toBeNull();
  await user.tab();
  await user.keyboard("{Enter}");
  await field.findByRole("button", { name: "キーを入力してください", pressed: true });
  expect(field.getByText(/Escで入力を終了/)).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(field.getByRole("button", { name: "キーを入力", pressed: false })).toBeTruthy();
  expect(field.queryByText(/Escで入力を終了/)).toBeNull();
});

it("shows compact app actions before the saved targets and reuses their editor", async () => {
  const target = { appPath: "/System/Applications/Preview.app", filePath: "/work/仕様書.pdf" };
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ProjectAppLaunchTargets compact deferred targets={[target]} disabled={false} onBusyChange={vi.fn()} onChange={onChange} />);
  const field = within(screen.getByRole("group", { name: "再開時に開くアプリ" }));
  expect(field.getByText("1件")).toBeTruthy();
  await user.tab();
  expect(document.activeElement).toBe(field.getByRole("button", { name: "アプリを追加" }));
  await user.tab();
  expect(document.activeElement).toBe(field.getByRole("button", { name: "Preview（仕様書.pdf）を変更" }));
  await user.keyboard("{Enter}");
  await user.click(field.getByRole("button", { name: "ファイルを解除" }));
  await user.click(field.getByRole("button", { name: "変更を反映" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith([{ ...target, filePath: null }]);
});
