import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import * as api from "../services/projects";
import type { Project } from "../types/project";

vi.mock("../services/projects", async (importOriginal) => ({
  ...await importOriginal<typeof api>(),
  listProjects: vi.fn(),
  addProject: vi.fn(),
  updateProject: vi.fn(),
  removeProject: vi.fn(),
  selectProjectDirectory: vi.fn(),
}));

const project: Project = { id: "project-id", name: "Reentry", path: "/projects/Reentry" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listProjects).mockResolvedValue([]);
});
afterEach(cleanup);

async function openForm() {
  const user = userEvent.setup();
  render(<App />);
  const add = screen.getByRole("button", { name: "プロジェクトを追加" });
  await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
  await user.click(add);
  return user;
}

describe("project registration", () => {
  it("loads saved projects and displays their names, paths, and count", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([project]);
    render(<App />);
    expect(await screen.findByRole("heading", { name: project.name })).toBeTruthy();
    expect(screen.getByText(project.path)).toBeTruthy();
    expect(screen.getByText("1 件")).toBeTruthy();
    expect(screen.queryByText("まだプロジェクトがありません")).toBeNull();
  });

  it("selects a folder, saves once, and adds the saved project to the list", async () => {
    vi.mocked(api.selectProjectDirectory).mockResolvedValue({ path: project.path, suggestedName: project.name });
    let finishSave!: (value: Project) => void;
    vi.mocked(api.addProject).mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    const user = await openForm();
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));
    expect((screen.getByLabelText("フォルダ") as HTMLInputElement).value).toBe(project.path);
    expect((screen.getByLabelText("プロジェクト名") as HTMLInputElement).value).toBe(project.name);
    await user.click(screen.getByRole("button", { name: "登録する" }));
    await user.click(screen.getByRole("button", { name: "保存中…" }));
    expect(api.addProject).toHaveBeenCalledTimes(1);
    expect(api.addProject).toHaveBeenCalledWith(project.name, project.path);
    const cancel = screen.getByRole("button", { name: "キャンセル" });
    expect(cancel.matches(":disabled")).toBe(true);
    await user.click(cancel);
    expect(screen.getByRole("form")).toBeTruthy();
    finishSave(project);
    expect(await screen.findByRole("heading", { name: project.name })).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "プロジェクトを追加" }));
  });

  it("keeps typed input when folder selection is cancelled and preserves custom names", async () => {
    vi.mocked(api.selectProjectDirectory)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ path: project.path, suggestedName: project.name });
    const user = await openForm();
    await user.type(screen.getByLabelText("プロジェクト名"), "Custom");
    await user.type(screen.getByLabelText("フォルダ"), "/original");
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));
    expect((screen.getByLabelText("フォルダ") as HTMLInputElement).value).toBe("/original");
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));
    expect((screen.getByLabelText("プロジェクト名") as HTMLInputElement).value).toBe("Custom");
    expect(api.addProject).not.toHaveBeenCalled();
  });

  it("keeps the form and entered values when saving fails, then allows retry", async () => {
    vi.mocked(api.addProject).mockRejectedValueOnce("このフォルダはすでに登録されています。").mockResolvedValueOnce(project);
    const user = await openForm();
    await user.type(screen.getByLabelText("フォルダ"), project.path);
    await user.type(screen.getByLabelText("プロジェクト名"), project.name);
    await user.click(screen.getByRole("button", { name: "登録する" }));
    expect((await screen.findByRole("alert")).textContent).toContain("すでに登録");
    expect((screen.getByLabelText("フォルダ") as HTMLInputElement).value).toBe(project.path);
    expect(screen.getByText("0 件")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "登録する" }));
    expect(await screen.findByRole("heading", { name: project.name })).toBeTruthy();
  });

  it("shows folder selection errors and allows cancelling without saving", async () => {
    vi.mocked(api.selectProjectDirectory).mockRejectedValue(new Error("選択に失敗しました"));
    const user = await openForm();
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));
    expect((await screen.findByRole("alert")).textContent).toBe("選択に失敗しました");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect(api.addProject).not.toHaveBeenCalled();
  });

  it("reports load failures without showing an empty list and supports retry", async () => {
    vi.mocked(api.listProjects).mockRejectedValueOnce("保存データの形式が不正です。").mockResolvedValueOnce([project]);
    const user = userEvent.setup();
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain("不正");
    expect(screen.queryByText("まだプロジェクトがありません")).toBeNull();
    expect((screen.getByRole("button", { name: "プロジェクトを追加" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(await screen.findByRole("heading", { name: project.name })).toBeTruthy();
  });
});

async function openDetails(savedProjects: Project[] = [project]) {
  const user = userEvent.setup();
  vi.mocked(api.listProjects).mockResolvedValue(savedProjects);
  render(<App />);
  await user.click(await screen.findByRole("button", { name: `${project.name}の詳細を開く` }));
  return user;
}

describe("project details", () => {
  it("opens details and returns to the list through the sidebar", async () => {
    const user = await openDetails();
    expect(screen.getByRole("heading", { name: "基本情報" })).toBeTruthy();
    expect(screen.getByText(project.path)).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "プロジェクト" }));
    expect(screen.getByRole("button", { name: `${project.name}の詳細を開く` })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "プロジェクト" }));
  });

  it("prepopulates editing, persists changes, and updates the list", async () => {
    const updated = { ...project, name: "Renamed", path: "/new/path" };
    vi.mocked(api.updateProject).mockResolvedValue(updated);
    const user = await openDetails();
    await user.click(screen.getByRole("button", { name: "編集する" }));
    expect((screen.getByLabelText("プロジェクト名") as HTMLInputElement).value).toBe(project.name);
    expect((screen.getByLabelText("フォルダ") as HTMLInputElement).value).toBe(project.path);
    await user.clear(screen.getByLabelText("プロジェクト名"));
    await user.type(screen.getByLabelText("プロジェクト名"), updated.name);
    await user.clear(screen.getByLabelText("フォルダ"));
    await user.type(screen.getByLabelText("フォルダ"), updated.path);
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    await screen.findByText("変更を保存しました。");
    expect(api.updateProject).toHaveBeenCalledWith(project, updated.name, updated.path);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "編集する" }));
    await user.click(screen.getByRole("button", { name: /プロジェクト一覧に戻る/ }));
    expect(screen.getByRole("button", { name: "Renamedの詳細を開く" })).toBeTruthy();
    expect(screen.getByText(updated.path)).toBeTruthy();
  });

  it("keeps failed edits for retry and discards cancelled edits", async () => {
    vi.mocked(api.updateProject).mockRejectedValue("このフォルダはすでに登録されています。");
    const user = await openDetails();
    await user.click(screen.getByRole("button", { name: "編集する" }));
    await user.type(screen.getByLabelText("プロジェクト名"), " edited");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect((await screen.findByRole("alert")).textContent).toContain("すでに登録");
    expect((screen.getByLabelText("プロジェクト名") as HTMLInputElement).value).toBe("Reentry edited");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.getByRole("heading", { name: project.name })).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("requires confirmation, permits cancellation, and sends removal once", async () => {
    let finishRemoval!: () => void;
    vi.mocked(api.removeProject).mockImplementation(() => new Promise<void>((resolve) => { finishRemoval = resolve; }));
    const user = await openDetails();
    await user.click(screen.getByRole("button", { name: "登録を解除" }));
    expect(api.removeProject).not.toHaveBeenCalled();
    expect(screen.getByText(/フォルダとその中のファイルは削除されません/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "登録を解除" }));
    await user.click(screen.getByRole("button", { name: "登録を解除" }));
    await user.click(screen.getByRole("button", { name: "登録解除を確定" }));
    await user.click(screen.getByRole("button", { name: "解除中…" }));
    expect(api.removeProject).toHaveBeenCalledTimes(1);
    expect(api.removeProject).toHaveBeenCalledWith(project);
    expect(screen.getByRole("button", { name: "キャンセル" }).matches(":disabled")).toBe(true);
    finishRemoval();
    expect(await screen.findByText("まだプロジェクトがありません")).toBeTruthy();
    expect(screen.getByText("0 件")).toBeTruthy();
  });

  it("shows removal errors and keeps the project until a successful retry", async () => {
    vi.mocked(api.removeProject).mockRejectedValueOnce("保存できません").mockResolvedValueOnce(undefined);
    const user = await openDetails();
    await user.click(screen.getByRole("button", { name: "登録を解除" }));
    await user.click(screen.getByRole("button", { name: "登録解除を確定" }));
    expect((await screen.findByRole("alert")).textContent).toBe("保存できません");
    expect(screen.getByRole("heading", { name: project.name })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "登録解除を確定" }));
    expect(await screen.findByText("まだプロジェクトがありません")).toBeTruthy();
  });

  it("can reload the list after returning from stale details", async () => {
    const user = await openDetails();
    vi.mocked(api.listProjects).mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: /プロジェクト一覧に戻る/ }));
    await user.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(await screen.findByText("まだプロジェクトがありません")).toBeTruthy();
  });
});

it("does not close another project's details when an earlier removal finishes", async () => {
  const other = { id: "other", name: "Other", path: "/other" };
  let finishRemoval!: () => void;
  vi.mocked(api.removeProject).mockImplementation(() => new Promise<void>((resolve) => { finishRemoval = resolve; }));
  const user = await openDetails([project, other]);
  await user.click(screen.getByRole("button", { name: "登録を解除" }));
  await user.click(screen.getByRole("button", { name: "登録解除を確定" }));
  await user.click(screen.getByRole("link", { name: "プロジェクト" }));
  await user.click(screen.getByRole("button", { name: "Otherの詳細を開く" }));
  finishRemoval();
  await waitFor(() => expect(screen.getByRole("heading", { name: "Other" })).toBeTruthy());
  await user.click(screen.getByRole("button", { name: /プロジェクト一覧に戻る/ }));
  expect(screen.getByText("1 件")).toBeTruthy();
  expect(screen.queryByRole("button", { name: `${project.name}の詳細を開く` })).toBeNull();
});
