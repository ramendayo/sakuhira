import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectLaunchSettings from "./ProjectLaunchSettings";
import ResumeProject from "./ResumeProject";
import { resumeProject, setProjectLaunchUrl } from "../services/launch";
import type { Project } from "../types/project";
import type { ResumeReport } from "../types/launch";

vi.mock("../services/launch", () => ({ resumeProject: vi.fn(), setProjectLaunchUrl: vi.fn() }));
vi.mock("../services/settings", () => ({ getSettings: vi.fn(async () => ({ defaultEditor: "vsCode" })) }));

const project: Project = { id: "id", name: "Reentry", path: "/projects/Reentry", launchUrl: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };
const success: ResumeReport = { editorName: "VS Code", editor: { status: "success" }, browser: null };
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function Harness() {
  const [current, setCurrent] = useState(project);
  return <><ProjectLaunchSettings project={current} onSaved={setCurrent} /><ResumeProject project={current} /></>;
}

it("saves a URL, uses the saved project when resuming, and clears the URL", async () => {
  const configured = { ...project, launchUrl: "http://localhost:3000/" };
  vi.mocked(setProjectLaunchUrl).mockResolvedValueOnce(configured).mockResolvedValueOnce(project);
  vi.mocked(resumeProject).mockResolvedValue({ editorName: "VS Code", editor: { status: "success" }, browser: { status: "success" } });
  const user = userEvent.setup();
  render(<Harness />);
  await user.type(screen.getByLabelText("起動URL（任意）"), "http://localhost:3000");
  await user.click(screen.getByRole("button", { name: "起動設定を保存" }));
  expect(await screen.findByText("起動設定を保存しました。")).toBeTruthy();
  expect(setProjectLaunchUrl).toHaveBeenNthCalledWith(1, project, "http://localhost:3000");
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  expect(await screen.findByText("ブラウザ：起動要求を送信しました。")).toBeTruthy();
  expect(resumeProject).toHaveBeenCalledWith(configured);
  await user.clear(screen.getByLabelText("起動URL（任意）"));
  await user.click(screen.getByRole("button", { name: "起動設定を保存" }));
  expect(setProjectLaunchUrl).toHaveBeenNthCalledWith(2, configured, "");
  expect(screen.queryByText("ブラウザ：起動要求を送信しました。")).toBeNull();
});

it("retains a failed settings draft for retry and blocks duplicate saves", async () => {
  let finish!: (value: Project) => void;
  vi.mocked(setProjectLaunchUrl).mockRejectedValueOnce("URLを保存できません").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const user = userEvent.setup();
  const saved = vi.fn();
  render(<ProjectLaunchSettings project={project} onSaved={saved} />);
  await user.type(screen.getByLabelText("起動URL（任意）"), "https://example.com/");
  await user.click(screen.getByRole("button", { name: "起動設定を保存" }));
  expect((await screen.findByRole("alert")).textContent).toBe("URLを保存できません");
  expect((screen.getByLabelText("起動URL（任意）") as HTMLInputElement).value).toBe("https://example.com/");
  await user.click(screen.getByRole("button", { name: "起動設定を保存" }));
  await user.click(screen.getByRole("button", { name: "保存中…" }));
  expect(setProjectLaunchUrl).toHaveBeenCalledTimes(2);
  finish({ ...project, launchUrl: "https://example.com/" });
  await screen.findByText("起動設定を保存しました。");
  expect(saved).toHaveBeenCalledTimes(1);
});

it("shows editor-only results and blocks repeated resume clicks while pending", async () => {
  let finish!: (value: ResumeReport) => void;
  vi.mocked(resumeProject).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const user = userEvent.setup();
  render(<ResumeProject project={project} />);
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  expect(resumeProject).toHaveBeenCalledTimes(1);
  finish(success);
  expect(await screen.findByText("VS Code：起動要求を送信しました。")).toBeTruthy();
  expect(screen.getByText("URL未設定のため、ブラウザは開きませんでした。")).toBeTruthy();
});

it("shows each target's outcome independently when only one launch succeeds", async () => {
  vi.mocked(resumeProject).mockResolvedValue({ editorName: "VS Code", editor: { status: "error", message: "VS Codeが見つかりません" }, browser: { status: "success" } });
  const user = userEvent.setup();
  render(<ResumeProject project={project} />);
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  expect((await screen.findByRole("alert")).textContent).toContain("VS Codeが見つかりません");
  expect(screen.getByText("ブラウザ：起動要求を送信しました。")).toBeTruthy();
});

it("displays preflight failures and permits retry", async () => {
  vi.mocked(resumeProject).mockRejectedValueOnce("フォルダがありません").mockResolvedValueOnce(success);
  const user = userEvent.setup();
  render(<ResumeProject project={project} />);
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  expect((await screen.findByRole("alert")).textContent).toBe("フォルダがありません");
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  expect(await screen.findByText("VS Code：起動要求を送信しました。")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does not show an old launch result after the saved settings change", async () => {
  let finish!: (value: ResumeReport) => void;
  vi.mocked(resumeProject).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const user = userEvent.setup();
  const { rerender } = render(<ResumeProject project={project} />);
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  rerender(<ResumeProject project={{ ...project, launchUrl: "https://new.example/" }} />);
  finish(success);
  expect(screen.queryByText("VS Code：起動要求を送信しました。")).toBeNull();
  expect((screen.getByRole("button", { name: "Reentryを再開" }) as HTMLButtonElement).disabled).toBe(false);
});
