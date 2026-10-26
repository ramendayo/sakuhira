import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectGitStatus from "./ProjectGitStatus";
import { getGitStatus } from "../services/git";
import type { GitStatus } from "../types/git";

vi.mock("../services/git", () => ({ getGitStatus: vi.fn() }));
const project = { id: "project-id", name: "Reentry", path: "/projects/Reentry", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };
const clean: GitStatus = {
  kind: "repository", head: { kind: "branch", name: "main", unborn: false },
  changedFiles: 0, rootPath: "/projects/Reentry",
};
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it("shows loading and then the branch, clean state, and file count", async () => {
  let finish!: (status: GitStatus) => void;
  vi.mocked(getGitStatus).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<ProjectGitStatus project={project} />);
  expect(screen.getByRole("status").textContent).toBe("Gitを確認中…");
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  finish(clean);
  expect(await screen.findByText("ブランチ: main")).toBeTruthy();
  expect(screen.getByText("未コミットの変更なし")).toBeTruthy();
  expect(screen.getByText("変更ファイル: 0 件")).toBeTruthy();
  expect(getGitStatus).toHaveBeenCalledWith(project.id);
});

it("refreshes the file count without modifying the project", async () => {
  vi.mocked(getGitStatus).mockResolvedValueOnce(clean).mockResolvedValueOnce({ ...clean, changedFiles: 3 });
  const user = userEvent.setup();
  render(<ProjectGitStatus project={project} />);
  await screen.findByText("ブランチ: main");
  await user.click(screen.getByRole("button", { name: "Gitを更新" }));
  expect(await screen.findByText("未コミットの変更あり")).toBeTruthy();
  expect(screen.getByText("変更ファイル: 3 件")).toBeTruthy();
});

it("distinguishes a non-repository from a failed status query and supports retry", async () => {
  vi.mocked(getGitStatus).mockRejectedValueOnce("フォルダを確認できません").mockResolvedValueOnce({ kind: "notRepository" });
  const user = userEvent.setup();
  render(<ProjectGitStatus project={project} />);
  expect((await screen.findByRole("alert")).textContent).toContain("確認できません");
  expect(screen.queryByText("未コミットの変更なし")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Gitを更新" }));
  expect(await screen.findByText("Git管理されていないフォルダです。")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("labels unborn branches and detached HEAD explicitly", async () => {
  vi.mocked(getGitStatus).mockResolvedValueOnce({ ...clean, head: { kind: "branch", name: "main", unborn: true } })
    .mockResolvedValueOnce({ ...clean, head: { kind: "detached", commit: "123456789abcdef" } });
  const user = userEvent.setup();
  render(<ProjectGitStatus project={project} />);
  expect(await screen.findByText("ブランチ: main（初回コミット前）")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Gitを更新" }));
  expect(await screen.findByText("HEAD分離中: 1234567")).toBeTruthy();
});

it("refetches after path changes and ignores a late result from the old path", async () => {
  let finishOld!: (status: GitStatus) => void;
  vi.mocked(getGitStatus).mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
    .mockResolvedValueOnce({ ...clean, head: { kind: "branch", name: "new-path", unborn: false } });
  const { rerender } = render(<ProjectGitStatus project={project} />);
  rerender(<ProjectGitStatus project={{ ...project, path: "/new/path", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } }} />);
  await screen.findByText("ブランチ: new-path");
  finishOld(clean);
  await waitFor(() => expect(screen.queryByText("ブランチ: main")).toBeNull());
  expect(screen.getByText("ブランチ: new-path")).toBeTruthy();
  expect(getGitStatus).toHaveBeenCalledTimes(2);
});
