import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectLaunchSettings from "./ProjectLaunchSettings";
import ResumeProject from "./ResumeProject";
import { lastLaunchTargetMessage, resumeProject, selectProjectLaunchItem, setProjectAppLaunchTargets, setProjectLaunchUrl, supportsAppLaunchTargets } from "../services/launch";
import { getSettings } from "../../../services/settings";
import type { Project } from "../types/project";
import type { ResumeReport } from "../types/launch";

vi.mock("../services/launch", async (importOriginal) => ({ ...await importOriginal<typeof import("../services/launch")>(), resumeProject: vi.fn(), setProjectLaunchUrl: vi.fn(), selectProjectLaunchItem: vi.fn(), setProjectAppLaunchTargets: vi.fn(), supportsAppLaunchTargets: vi.fn(() => false) }));
vi.mock("../../../services/settings", () => ({ getSettings: vi.fn(async () => ({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" })) }));

const project: Project = { id: "id", name: "Reentry", path: "/projects/Reentry", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };
const success: ResumeReport = { history: { status: "skipped" }, editorName: "VS Code", editor: { status: "success" }, browser: null };
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function Harness({ initialProject = project }: { initialProject?: Project }) {
  const [current, setCurrent] = useState(initialProject);
  return <><ProjectLaunchSettings project={current} onSaved={setCurrent} /><ResumeProject project={current} /></>;
}

it("shows browser-only results and does not load editor settings for URL-only projects", async () => {
  const web = { ...project, path: null, launchUrl: "https://example.com/" };
  const onResumed = vi.fn();
  vi.mocked(getSettings).mockRejectedValue("settings unavailable");
  vi.mocked(resumeProject).mockResolvedValue({ editorName: "VS Code", editor: null, browser: { status: "success" }, history: { status: "saved", timestamp: 3000 } });
  const user = userEvent.setup();
  render(<><ProjectLaunchSettings project={web} onSaved={vi.fn()} /><ResumeProject project={web} onResumed={onResumed} /></>);
  expect(getSettings).not.toHaveBeenCalled();
  const url = screen.getByLabelText("起動URL（任意）") as HTMLInputElement;
  expect(url.required).toBe(false);
  await user.clear(url);
  await user.click(screen.getByRole("button", { name: "起動設定を保存" }));
  expect(setProjectLaunchUrl).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  expect(await screen.findByText("ブラウザ：起動要求を送信しました。")).toBeTruthy();
  expect(screen.getByText("フォルダ未設定のため、エディタは開きませんでした。")).toBeTruthy();
  expect(onResumed).toHaveBeenCalledWith(project.id, 3000);
  expect(screen.getByRole("alert").textContent).toBe(lastLaunchTargetMessage);
});

it("shows launch success alongside a history storage error without reporting a saved timestamp", async () => {
  vi.mocked(resumeProject).mockResolvedValue({ ...success, history: { status: "error", message: "保存先に書き込めません" } });
  const onResumed = vi.fn();
  const user = userEvent.setup();
  render(<ResumeProject project={project} onResumed={onResumed} />);
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  expect(await screen.findByText("VS Code：起動要求を送信しました。")).toBeTruthy();
  expect((await screen.findByRole("alert")).textContent).toContain("最終再開日時を保存できませんでした");
  expect(onResumed).not.toHaveBeenCalled();
});

it("saves a URL, uses the saved project when resuming, and clears the URL", async () => {
  const configured = { ...project, launchUrl: "http://localhost:3000/" };
  vi.mocked(setProjectLaunchUrl).mockResolvedValueOnce(configured).mockResolvedValueOnce(project);
  vi.mocked(resumeProject).mockResolvedValue({ history: { status: "skipped" }, editorName: "VS Code", editor: { status: "success" }, browser: { status: "success" } });
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
  vi.mocked(resumeProject).mockResolvedValue({ history: { status: "skipped" }, editorName: "VS Code", editor: { status: "error", message: "VS Codeが見つかりません" }, browser: { status: "success" } });
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

it("adds apps with optional files, keeps a failed draft, and lets saved targets be edited or removed", async () => {
  const preview = { appPath: "/System/Applications/Preview.app", filePath: "/work/仕様書.pdf" };
  const slack = { appPath: "/Applications/Slack.app", filePath: null };
  vi.mocked(supportsAppLaunchTargets).mockReturnValue(true);
  vi.mocked(selectProjectLaunchItem)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(preview.appPath)
    .mockResolvedValueOnce(preview.filePath)
    .mockResolvedValueOnce(slack.appPath)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);
  vi.mocked(setProjectAppLaunchTargets)
    .mockRejectedValueOnce("保存できませんでした。")
    .mockImplementation(async (project, targets) => ({ ...project, appLaunchTargets: targets }));

  const user = userEvent.setup();
  render(<Harness />);
  const add = () => user.click(screen.getByRole("button", { name: "アプリを追加" }));
  const save = () => user.click(screen.getByRole("button", { name: "起動先を追加" }));
  await add();
  expect(setProjectAppLaunchTargets).not.toHaveBeenCalled();
  await add();
  await user.click(screen.getByRole("button", { name: "ファイルを選択（任意）" }));
  await save();
  expect(await screen.findByText("保存できませんでした。")).toBeTruthy();
  expect(screen.getByText("Preview（仕様書.pdf）")).toBeTruthy();
  await save();
  await screen.findByRole("button", { name: "Preview（仕様書.pdf）を変更" });
  expect(setProjectAppLaunchTargets).toHaveBeenNthCalledWith(2, project, [preview]);

  await add();
  await save();
  await screen.findByRole("button", { name: "Slackを削除" });
  expect(setProjectAppLaunchTargets).toHaveBeenNthCalledWith(3, { ...project, appLaunchTargets: [preview] }, [preview, slack]);
  await user.click(screen.getByRole("button", { name: "Preview（仕様書.pdf）を変更" }));
  await user.click(screen.getByRole("button", { name: "アプリを選び直す" }));
  await user.click(screen.getByRole("button", { name: "ファイルを選び直す" }));
  expect(screen.getAllByText("Preview（仕様書.pdf）")).toHaveLength(2);
  expect(setProjectAppLaunchTargets).toHaveBeenCalledTimes(3);
  await user.click(screen.getByRole("button", { name: "ファイルを解除" }));
  await user.click(screen.getByRole("button", { name: "変更を保存" }));
  await screen.findByRole("button", { name: "Previewを変更" });
  expect(setProjectAppLaunchTargets).toHaveBeenNthCalledWith(4, { ...project, appLaunchTargets: [preview, slack] }, [{ ...preview, filePath: null }, slack]);

  await user.click(screen.getByRole("button", { name: "Slackを削除" }));
  expect(screen.queryByRole("button", { name: "Slackを削除" })).toBeNull();
  expect(vi.mocked(setProjectAppLaunchTargets).mock.lastCall?.[1]).toEqual([{ ...preview, filePath: null }]);
  expect(vi.mocked(selectProjectLaunchItem).mock.calls.flat()).toEqual(["app", "app", "file", "app", "app", "file"]);
});

it("keeps the last app on deletion and allows retry after another launch target is saved", async () => {
  const app = { appPath: "/Applications/Codex.app", filePath: null };
  const appOnly = { ...project, path: null, appLaunchTargets: [app] };
  const withUrl = { ...appOnly, launchUrl: "https://example.com/" };
  const urlOnly = { ...withUrl, appLaunchTargets: [] };
  vi.mocked(supportsAppLaunchTargets).mockReturnValue(true);
  vi.mocked(setProjectLaunchUrl).mockResolvedValueOnce(withUrl).mockResolvedValueOnce(appOnly).mockResolvedValueOnce(withUrl);
  vi.mocked(setProjectAppLaunchTargets).mockResolvedValueOnce(urlOnly);
  const user = userEvent.setup();
  render(<Harness initialProject={appOnly} />);
  const deleteApp = () => user.click(screen.getByRole("button", { name: "Codexを削除" }));
  const saveUrl = () => user.click(screen.getByRole("button", { name: "起動設定を保存" }));

  await deleteApp();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", lastLaunchTargetMessage);
  expect(setProjectAppLaunchTargets).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Codexを削除" })).toBeTruthy();

  const url = screen.getByLabelText("起動URL（任意）");
  await user.type(url, withUrl.launchUrl);
  await saveUrl();
  expect(setProjectLaunchUrl).toHaveBeenLastCalledWith(appOnly, withUrl.launchUrl);
  await user.clear(url);
  await saveUrl();
  expect(setProjectLaunchUrl).toHaveBeenLastCalledWith(withUrl, "");
  await user.type(url, withUrl.launchUrl);
  await saveUrl();
  expect(setProjectLaunchUrl).toHaveBeenLastCalledWith(appOnly, withUrl.launchUrl);
  await deleteApp();
  expect(setProjectAppLaunchTargets).toHaveBeenCalledExactlyOnceWith(withUrl, []);
  expect(screen.queryByRole("button", { name: "Codexを削除" })).toBeNull();
});
