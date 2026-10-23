import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectsPage from "./ProjectsPage";
import * as api from "../services/projects";
import type { Project } from "../types/project";

vi.mock("../services/projects", async (importOriginal) => ({
  ...await importOriginal<typeof api>(),
  listProjects: vi.fn(),
  addProject: vi.fn(),
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
  render(<ProjectsPage />);
  const add = screen.getByRole("button", { name: "プロジェクトを追加" });
  await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
  await user.click(add);
  return user;
}

describe("project registration", () => {
  it("loads saved projects and displays their names, paths, and count", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([project]);
    render(<ProjectsPage />);
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
    render(<ProjectsPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("不正");
    expect(screen.queryByText("まだプロジェクトがありません")).toBeNull();
    expect((screen.getByRole("button", { name: "プロジェクトを追加" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(await screen.findByRole("heading", { name: project.name })).toBeTruthy();
  });
});
