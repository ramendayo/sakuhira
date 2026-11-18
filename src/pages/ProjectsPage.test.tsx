import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import * as api from "../services/projects";
import * as shortcuts from "../services/shortcuts";
import { setProjectNotes } from "../services/notes";
import { resumeProject } from "../services/launch";
import type { Project } from "../types/project";

vi.mock("../services/projects", async (importOriginal) => ({
  ...await importOriginal<typeof api>(),
  listProjects: vi.fn(),
  addProject: vi.fn(),
  updateProject: vi.fn(),
  removeProject: vi.fn(),
  selectProjectDirectory: vi.fn(),
}));

vi.mock("../services/git", () => ({
  getGitStatus: vi.fn(async () => ({ kind: "notRepository" })),
}));

vi.mock("../services/notes", () => ({ setProjectNotes: vi.fn() }));
vi.mock("../services/launch", async (importOriginal) => ({ ...await importOriginal<typeof import("../services/launch")>(), resumeProject: vi.fn(), setProjectLaunchUrl: vi.fn() }));
vi.mock("../services/shortcuts", () => ({
  supportsShortcuts: vi.fn(() => false),
  onShortcutsRestored: vi.fn(),
  onShortcutResume: vi.fn(),
  onCapturedShortcut: vi.fn(),
  setShortcutCapture: vi.fn(),
  readShortcutIssues: vi.fn(),
}));

vi.mock("../services/settings", () => ({ applyTheme: vi.fn(async () => {}), saveSettings: vi.fn(async (_expected, settings) => settings), getSettings: vi.fn(async () => ({ projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" }, theme: "light", defaultEditor: "vsCode" })) }));

const project = { id: "project-id", name: "Reentry", path: "/projects/Reentry", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } } satisfies Project;

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

it("reports restore failures and refreshes the last resume time from native events", async () => {
  vi.mocked(api.listProjects).mockResolvedValue([{ ...project, shortcut: "Command+Control+KeyJ" }]);
  vi.mocked(shortcuts.supportsShortcuts).mockReturnValue(true);
  let restored = () => {};
  let resumed: Parameters<typeof shortcuts.onShortcutResume>[0] = () => {};
  vi.mocked(shortcuts.onShortcutsRestored).mockImplementation(async (handler) => {
    restored = handler;
    return () => {};
  });
  vi.mocked(shortcuts.onShortcutResume).mockImplementation(async (handler) => {
    resumed = handler;
    return () => {};
  });
  vi.mocked(shortcuts.readShortcutIssues).mockResolvedValueOnce([]).mockResolvedValue([
    { projectId: project.id, reason: "OSにショートカットを登録できません。" },
  ]);
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("button", { name: "Reentryの詳細を開く" });
  await waitFor(() => expect(shortcuts.readShortcutIssues).toHaveBeenCalledTimes(1));
  act(() => restored());
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("「Reentry」"));

  await user.click(screen.getByRole("button", { name: "Reentryの詳細を開く" }));
  expect(within(screen.getByRole("region", { name: "プロジェクト情報" })).getByText("⌘ + ⌃ + J")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reentryを再開" }).closest("header")?.textContent).toContain("⌘ + ⌃ + J");
  expect(screen.getByRole("alert")).toHaveProperty("textContent", "OSにショートカットを登録できません。");
  act(() => resumed({ projectId: project.id, timestamp: 3000 }));
  expect(screen.getByText("最終再開：", { exact: false }).querySelector("time")?.dateTime).toBe(new Date(3000).toISOString());
});

it("sorts by resume history, updates it after launch without losing the report, and shows it in details", async () => {
  const recent = { ...project, id: "recent", name: "Recent", path: "/recent", lastResumedAt: 2000 };
  const older = { ...project, id: "older", name: "Older", path: "/older", lastResumedAt: 1000 };
  const never = { ...project, id: "never", name: "Never", path: "/never" };
  vi.mocked(api.listProjects).mockResolvedValue([project, older, recent, never]);
  vi.mocked(resumeProject).mockResolvedValue({ editorName: "VS Code", editor: { status: "success" }, browser: null, history: { status: "saved", timestamp: 3000 } });
  const user = userEvent.setup();
  render(<App />);
  const list = await screen.findByRole("list", { name: "登録済みプロジェクト" });
  const names = () => within(list).getAllByRole("heading").map((heading) => heading.textContent);
  expect(names()).toEqual(["Recent", "Older", "Reentry", "Never"]);
  expect(within(list).getAllByText("最終再開：記録なし")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  expect(await screen.findByText("VS Code：起動要求を送信しました。")).toBeTruthy();
  expect(names()).toEqual(["Reentry", "Recent", "Older", "Never"]);
  const card = within(list).getAllByRole("listitem")[0];
  expect(card.querySelector("time")?.dateTime).toBe(new Date(3000).toISOString());
  expect(resumeProject).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Reentryの詳細を開く" }));
  expect(within(screen.getByRole("region", { name: "プロジェクト情報" })).getByText("未設定")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reentryを再開" }).closest("header")?.querySelector("kbd")).toBeNull();
  expect(screen.getByText("最終再開：", { exact: false }).querySelector("time")?.dateTime).toBe(new Date(3000).toISOString());
  await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
  await screen.findByText("VS Code：起動要求を送信しました。");
  expect(resumeProject).toHaveBeenLastCalledWith({ ...project, lastResumedAt: 3000 });
});

describe("project search", () => {
  const recent: Project = { ...project, id: "recent", name: "Reentry Docs", path: "/work/日本語/[draft]", lastResumedAt: 2000 };
  const other: Project = { ...project, id: "other", name: "Website", path: "/work/website", notes: { ...project.notes, nextTask: "Reentry" } };

  beforeEach(() => vi.mocked(api.listProjects).mockResolvedValue([project, other, recent]));

  it("matches names and paths literally without case sensitivity and restores resume order for blank searches", async () => {
    const user = userEvent.setup();
    render(<App />);
    const search = await screen.findByRole("searchbox", { name: "プロジェクトを検索" });
    const names = () => within(screen.getByRole("list", { name: "登録済みプロジェクト" })).getAllByRole("heading").map((heading) => heading.textContent);
    await user.type(search, "  REENTRY  ");
    expect(names()).toEqual(["Reentry Docs", "Reentry"]);
    expect(screen.getByText("2 / 3 件")).toBeTruthy();
    await user.clear(search);
    await user.paste("/WORK/日本語/[draft]");
    expect(names()).toEqual(["Reentry Docs"]);
    await user.clear(search);
    await user.type(search, "   ");
    expect(names()).toEqual(["Reentry Docs", "Reentry", "Website"]);
    expect(screen.getByText("3 件")).toBeTruthy();
    expect(api.listProjects).toHaveBeenCalledTimes(1);
    expect(api.updateProject).not.toHaveBeenCalled();
  });

  it("applies the selected resume order to name and path search matches", async () => {
    const fixture = (id: string, name: string, lastResumedAt: number, path = `/work/${name}`): Project => ({ ...project, id, name, path, lastResumedAt });
    vi.mocked(api.listProjects).mockResolvedValue([
      fixture("numa", "numa-project", 10),
      fixture("rentry", "Rentry", 30),
      fixture("exact", "N", 1),
      fixture("prefix", "Next", 20),
      fixture("path", "Website", 40, "/work/notes"),
      fixture("excluded", "App", 0),
    ]);
    const user = userEvent.setup();
    render(<App />);
    const search = await screen.findByRole("searchbox", { name: "プロジェクトを検索" });
    const names = () => within(screen.getByRole("list", { name: "登録済みプロジェクト" })).getAllByRole("heading").map((heading) => heading.textContent);
    await user.type(search, " N ");
    expect(names()).toEqual(["Website", "Rentry", "Next", "numa-project", "N"]);
    expect(screen.getByText("5 / 6 件")).toBeTruthy();
    expect(screen.getByText("最近再開した順", { selector: "span" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "検索をクリア" }));
    expect(names()).toEqual(["Website", "Rentry", "Next", "numa-project", "N", "App"]);
    expect(screen.getByText("最近再開した順", { selector: "span" })).toBeTruthy();
  });

  it("distinguishes no matches from an empty registry and restores all projects on clear", async () => {
    const user = userEvent.setup();
    render(<App />);
    const search = await screen.findByRole("searchbox", { name: "プロジェクトを検索" });
    await user.type(search, "missing");
    expect(screen.getByText("0 / 3 件")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "一致するプロジェクトがありません" })).toBeTruthy();
    expect(screen.queryByText("まだプロジェクトがありません")).toBeNull();
    expect(screen.queryByRole("list", { name: "登録済みプロジェクト" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "検索をクリア" }));
    expect((search as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(search);
    expect(screen.getByText("3 件")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /の詳細を開く/ })).toHaveLength(3);
  });

  it("keeps the search after viewing details and launches the selected saved project", async () => {
    vi.mocked(resumeProject).mockResolvedValue({ editorName: "VS Code", editor: { status: "success" }, browser: null, history: { status: "saved", timestamp: 3000 } });
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole("searchbox", { name: "プロジェクトを検索" }), "reentry");
    await user.click(screen.getByRole("button", { name: "Reentryの詳細を開く" }));
    await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
    await screen.findByText("VS Code：起動要求を送信しました。");
    expect(resumeProject).toHaveBeenCalledWith(project);
    await user.click(screen.getByRole("button", { name: "← プロジェクト一覧に戻る" }));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("reentry");
    expect(screen.getByText("2 / 3 件")).toBeTruthy();
    const list = screen.getByRole("list", { name: "登録済みプロジェクト" });
    expect(within(list).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Reentry", "Reentry Docs"]);
  });

  it("clears the filter after registration so the newly added project is visible", async () => {
    const added = { ...other, id: "added", name: "New app", path: "/new-app" };
    vi.mocked(api.addProject).mockResolvedValue(added);
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole("searchbox"), "missing");
    await user.click(screen.getByRole("button", { name: "プロジェクトを追加" }));
    await user.type(screen.getByLabelText("プロジェクト名"), added.name);
    await user.type(screen.getByLabelText("フォルダ"), added.path);
    await user.click(screen.getByRole("button", { name: "登録する" }));
    await screen.findByRole("heading", { name: added.name });
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("4 件")).toBeTruthy();
  });
});

describe("project registration", () => {
  it("registers a named URL-only project and supports browser-only resume and editing", async () => {
    const web: Project = { ...project, path: null, launchUrl: "https://example.com/" };
    vi.mocked(api.addProject).mockResolvedValue(web);
    vi.mocked(api.updateProject).mockResolvedValue({ ...web, name: "Web Docs", lastResumedAt: 3000 });
    vi.mocked(resumeProject).mockResolvedValue({ editorName: "VS Code", editor: null, browser: { status: "success" }, history: { status: "saved", timestamp: 3000 } });
    const user = await openForm();
    await user.type(screen.getByLabelText("プロジェクト名"), web.name);
    await user.type(screen.getByLabelText("起動URL（任意）"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "登録する" }));
    await screen.findByRole("heading", { name: web.name });
    expect(api.addProject).toHaveBeenCalledWith(web.name, null, "https://example.com");
    expect(screen.getByText(web.launchUrl!)).toBeTruthy();
    await user.type(screen.getByRole("searchbox"), "REENTRY");
    await user.click(screen.getByRole("button", { name: "Reentryの詳細を開く" }));
    expect(screen.getByText("未設定（URLのみ・ブラウザで再開）")).toBeTruthy();
    expect(screen.getByText("URLのみのプロジェクトにはGit情報がありません。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
    await screen.findByText("ブラウザ：起動要求を送信しました。");
    expect(resumeProject).toHaveBeenCalledWith(web);
    await user.click(screen.getByRole("button", { name: "プロジェクト情報を編集" }));
    expect((screen.getByLabelText("フォルダ") as HTMLInputElement).value).toBe("");
    await user.clear(screen.getByLabelText("プロジェクト名"));
    await user.type(screen.getByLabelText("プロジェクト名"), "Web Docs");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    await screen.findByText("変更を保存しました。");
    expect(api.updateProject).toHaveBeenCalledWith({ ...web, lastResumedAt: 3000 }, "Web Docs", null, { mode: "auto" });
  });

  it("requires a name and at least one launch target before registration", async () => {
    const user = await openForm();
    await user.type(screen.getByLabelText("起動URL（任意）"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "登録する" }));
    expect(api.addProject).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("プロジェクト名"), "Example");
    await user.clear(screen.getByLabelText("起動URL（任意）"));
    await user.click(screen.getByRole("button", { name: "登録する" }));
    expect((await screen.findByRole("alert")).textContent).toContain("フォルダ・URL・アプリのいずれか");
    expect(api.addProject).not.toHaveBeenCalled();
  });

  it("registers an optional URL and uses the saved URL when resuming", async () => {
    const configured = { ...project, launchUrl: "http://localhost:3000/" };
    vi.mocked(api.addProject).mockResolvedValue(configured);
    vi.mocked(resumeProject).mockResolvedValue({ editorName: "VS Code", editor: { status: "success" }, browser: { status: "success" }, history: { status: "skipped" } });
    const user = await openForm();
    await user.type(screen.getByLabelText("プロジェクト名"), project.name);
    await user.type(screen.getByLabelText("フォルダ"), project.path);
    await user.type(screen.getByLabelText("起動URL（任意）"), "http://localhost:3000");
    await user.click(screen.getByRole("button", { name: "登録する" }));
    await screen.findByRole("heading", { name: project.name });
    expect(api.addProject).toHaveBeenCalledWith(project.name, project.path, "http://localhost:3000");
    await user.click(screen.getByRole("button", { name: "Reentryの詳細を開く" }));
    expect((screen.getByLabelText("起動URL（任意）") as HTMLInputElement).value).toBe(configured.launchUrl);
    await user.click(screen.getByRole("button", { name: "Reentryを再開" }));
    await screen.findByText("ブラウザ：起動要求を送信しました。");
    expect(resumeProject).toHaveBeenCalledWith(configured);
  });

  it("retains registration input after an invalid URL error and allows retrying without a URL", async () => {
    vi.mocked(api.addProject).mockRejectedValueOnce("起動URLはHTTP/HTTPSにしてください。").mockResolvedValueOnce(project);
    const user = await openForm();
    await user.type(screen.getByLabelText("プロジェクト名"), project.name);
    await user.type(screen.getByLabelText("フォルダ"), project.path);
    const url = screen.getByLabelText("起動URL（任意）");
    await user.type(url, "ftp://example.com");
    await user.click(screen.getByRole("button", { name: "登録する" }));
    expect((await screen.findByRole("alert")).textContent).toContain("HTTP/HTTPS");
    expect((url as HTMLInputElement).value).toBe("ftp://example.com");
    expect((screen.getByLabelText("プロジェクト名") as HTMLInputElement).value).toBe(project.name);
    expect((screen.getByLabelText("フォルダ") as HTMLInputElement).value).toBe(project.path);
    expect(screen.getByText("0 件")).toBeTruthy();
    await user.clear(url);
    await user.click(screen.getByRole("button", { name: "登録する" }));
    await screen.findByRole("heading", { name: project.name });
    expect(api.addProject).toHaveBeenLastCalledWith(project.name, project.path, "");
  });

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
    expect(screen.getByRole("button", { name: "オプション設定（任意）", expanded: false })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "アイコン" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "フォルダを選択" }));
    expect((screen.getByLabelText("フォルダ") as HTMLInputElement).value).toBe(project.path);
    expect((screen.getByLabelText("プロジェクト名") as HTMLInputElement).value).toBe(project.name);
    await user.click(screen.getByRole("button", { name: "登録する" }));
    await user.click(screen.getByRole("button", { name: "保存中…" }));
    expect(api.addProject).toHaveBeenCalledTimes(1);
    expect(api.addProject).toHaveBeenCalledWith(project.name, project.path, "");
    const cancel = screen.getByRole("button", { name: "キャンセル" });
    expect(cancel.matches(":disabled")).toBe(true);
    await user.click(cancel);
    expect(screen.getByRole("form")).toBeTruthy();
    finishSave(project);
    expect(await screen.findByRole("heading", { name: project.name })).toBeTruthy();
    expect(screen.queryByRole("form", { name: /プロジェクトを/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "プロジェクトを追加" }));
  });

  it("preserves optional registration settings across collapse and shortcut conflicts", async () => {
    const url = "https://example.com/docs";
    const icon = { mode: "custom", shape: "code", color: "blue" } as const;
    const saved = { ...project, launchUrl: url, icon, shortcut: "Control+KeyK" };
    const conflict = "このショートカットは「Other」に割り当てられています。";
    const osError = "OSにショートカットを登録できません。";
    vi.mocked(api.addProject)
      .mockRejectedValueOnce({ field: "shortcut", message: conflict })
      .mockRejectedValueOnce({ field: "shortcut", message: osError })
      .mockResolvedValueOnce(saved);
    vi.mocked(shortcuts.supportsShortcuts).mockReturnValue(true);
    vi.mocked(shortcuts.onShortcutsRestored).mockResolvedValue(() => {});
    vi.mocked(shortcuts.onShortcutResume).mockResolvedValue(() => {});
    vi.mocked(shortcuts.onCapturedShortcut).mockResolvedValue(() => {});
    vi.mocked(shortcuts.setShortcutCapture).mockResolvedValue(undefined);
    vi.mocked(shortcuts.readShortcutIssues).mockResolvedValue([]);
    const user = await openForm();
    const name = screen.getByRole<HTMLInputElement>("textbox", { name: "プロジェクト名" });
    const folder = screen.getByRole<HTMLInputElement>("textbox", { name: "フォルダ" });
    const urlField = screen.getByRole<HTMLInputElement>("textbox", { name: "起動URL（任意）" });
    await user.type(name, project.name);
    await user.type(folder, project.path);
    await user.type(urlField, url);

    const disclosure = screen.getByRole("button", { name: "オプション設定（任意）", expanded: false });
    disclosure.focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "アイコンを変更" }));
    await user.click(screen.getByRole("radio", { name: "カスタム" }));
    expect(screen.getByRole("radio", { name: "フォルダ", checked: true })).toBeTruthy();
    await user.click(within(screen.getByRole("group", { name: "形" })).getByText("コード"));
    await user.selectOptions(screen.getByRole("combobox", { name: "背景色" }), "blue");

    async function capture(key: string) {
      await user.click(screen.getByRole("button", { name: "キーを入力" }));
      await screen.findByRole("button", { name: "キーを入力してください" });
      await user.keyboard(`{Control>}${key}{/Control}`);
    }
    await capture("j");
    disclosure.focus();
    await user.keyboard(" ");
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(disclosure.querySelector('[data-icon-color="blue"] svg')).toBeTruthy();
    expect(within(disclosure).getByText("⌃ + J")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "アイコン" })).toBeNull();

    const submit = screen.getByRole("button", { name: "登録する" });
    await user.click(submit);
    expect(api.addProject).toHaveBeenNthCalledWith(1, project.name, project.path, url, { icon, shortcut: "Control+KeyJ" });
    const shortcutField = within(screen.getByRole("group", { name: "再開ショートカット" }));
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(shortcutField.getByRole("alert").textContent).toBe(conflict);
    expect(document.activeElement).toBe(shortcutField.getByRole("button", { name: "キーを入力" }));
    expect(name.value).toBe(project.name);
    expect(folder.value).toBe(project.path);
    expect(urlField.value).toBe(url);
    expect(screen.getByRole("radio", { name: "コード", checked: true })).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "背景色" }).value).toBe("blue");
    expect(screen.getByText("0 件")).toBeTruthy();

    await user.click(shortcutField.getByRole("button", { name: "ショートカットを解除" }));
    expect(shortcutField.queryByRole("alert")).toBeNull();
    await capture("k");
    await user.click(submit);
    expect(screen.getByRole("group", { name: "再開ショートカット" }).textContent).toContain(osError);
    expect(screen.getByText("0 件")).toBeTruthy();
    await user.click(submit);
    expect(api.addProject).toHaveBeenLastCalledWith(project.name, project.path, url, { icon, shortcut: saved.shortcut });
    await user.click(await screen.findByRole("button", { name: "Reentryの詳細を開く" }));
    const information = within(screen.getByRole("region", { name: "プロジェクト情報" }));
    expect(information.getByText("コード・青")).toBeTruthy();
    expect(information.getByText("⌃ + K")).toBeTruthy();
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
    expect(screen.queryByRole("form", { name: /プロジェクトを/ })).toBeNull();
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
    const information = screen.getByRole("region", { name: "プロジェクト情報" });
    expect(within(information).getByText("自動").querySelector("svg")).toBeTruthy();
    expect(screen.getByText(project.path)).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "プロジェクト" }));
    expect(screen.getByRole("button", { name: `${project.name}の詳細を開く` })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "プロジェクト" }));
  });

  it("prepopulates editing, persists changes, and updates the list", async () => {
    const updated = {
      ...project, name: "Renamed", path: "/new/path",
      icon: { mode: "custom", shape: "code", color: "blue" },
      shortcut: "Control+KeyJ",
    } satisfies Project;
    vi.mocked(shortcuts.supportsShortcuts).mockReturnValue(true);
    vi.mocked(shortcuts.onShortcutsRestored).mockResolvedValue(() => {});
    vi.mocked(shortcuts.onShortcutResume).mockResolvedValue(() => {});
    vi.mocked(shortcuts.onCapturedShortcut).mockResolvedValue(() => {});
    vi.mocked(shortcuts.setShortcutCapture).mockResolvedValue(undefined);
    vi.mocked(shortcuts.readShortcutIssues).mockResolvedValue([]);
    vi.mocked(api.updateProject).mockResolvedValue(updated);
    const user = await openDetails();
    await user.click(screen.getByRole("button", { name: "プロジェクト情報を編集" }));
    expect((screen.getByLabelText("プロジェクト名") as HTMLInputElement).value).toBe(project.name);
    expect((screen.getByLabelText("フォルダ") as HTMLInputElement).value).toBe(project.path);
    await user.clear(screen.getByLabelText("プロジェクト名"));
    await user.type(screen.getByLabelText("プロジェクト名"), updated.name);
    await user.clear(screen.getByLabelText("フォルダ"));
    await user.type(screen.getByLabelText("フォルダ"), updated.path);
    await user.click(screen.getByRole("radio", { name: "カスタム" }));
    await user.click(within(screen.getByRole("group", { name: "形" })).getByText("コード"));
    await user.selectOptions(screen.getByRole("combobox", { name: "背景色" }), "blue");
    await user.click(screen.getByRole("button", { name: "キーを入力" }));
    await screen.findByRole("button", { name: "キーを入力してください" });
    await user.keyboard("{Control>}j{/Control}");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    await screen.findByText("変更を保存しました。");
    expect(api.updateProject).toHaveBeenCalledWith(project, updated.name, updated.path, updated.icon, { shortcut: updated.shortcut });
    const information = within(screen.getByRole("region", { name: "プロジェクト情報" }));
    expect(information.getByText("コード・青").querySelector('[data-icon-color="blue"] svg')).toBeTruthy();
    expect(information.getByText("⌃ + J")).toBeTruthy();
    const header = screen.getByRole("button", { name: "Renamedを再開" }).closest("header");
    expect(header?.querySelector('[data-icon-color="blue"] svg')).toBeTruthy();
    expect(header?.querySelector("kbd")?.textContent).toBe("⌃ + J");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "プロジェクト情報を編集" }));
    await user.click(screen.getByRole("button", { name: /プロジェクト一覧に戻る/ }));
    expect(screen.getByRole("button", { name: "Renamedの詳細を開く" })).toBeTruthy();
    expect(screen.getByText(updated.path)).toBeTruthy();
  });

  it("keeps failed edits for retry and discards cancelled edits", async () => {
    vi.mocked(api.updateProject).mockRejectedValue("このフォルダはすでに登録されています。");
    const user = await openDetails();
    await user.click(screen.getByRole("button", { name: "プロジェクト情報を編集" }));
    await user.type(screen.getByLabelText("プロジェクト名"), " edited");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect((await screen.findByRole("alert")).textContent).toContain("すでに登録");
    expect((screen.getByLabelText("プロジェクト名") as HTMLInputElement).value).toBe("Reentry edited");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.getByRole("heading", { name: project.name })).toBeTruthy();
    expect(screen.queryByRole("form", { name: /プロジェクトを/ })).toBeNull();
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
  const other = { id: "other", name: "Other", path: "/other", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };
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

describe("project notes", () => {
  it("previews and saves Markdown drafts, restores focus, and shows a list preview", async () => {
    const notes = { lastWork: "# 保存処理を実装\n\nテストを追加", nextTask: "**次は設定画面**", updatedAt: 1792904400000 };
    vi.mocked(setProjectNotes).mockResolvedValue({ ...project, notes });
    const user = await openDetails();
    expect(screen.getByText("メモはまだ保存されていません。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "メモを編集" }));
    expect(document.activeElement).toBe(screen.getByLabelText("前回の作業内容"));
    await user.type(screen.getByLabelText("前回の作業内容"), notes.lastWork);
    await user.type(screen.getByLabelText("次にやること"), notes.nextTask);
    const toggle = within(screen.getByRole("group", { name: "作業メモの表示" }));
    await user.click(toggle.getByRole("button", { name: "プレビュー" }));
    expect(toggle.getByRole("button", { name: "プレビュー", pressed: true })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "前回の作業内容" })).toBeNull();
    expect(screen.getByRole("heading", { name: "保存処理を実装" })).toBeTruthy();
    expect(screen.getByText("次は設定画面").tagName).toBe("STRONG");
    expect(setProjectNotes).not.toHaveBeenCalled();
    await user.click(toggle.getByRole("button", { name: "編集" }));
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "前回の作業内容" }).value).toBe(notes.lastWork);
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "次にやること" }).value).toBe(notes.nextTask);
    await user.click(toggle.getByRole("button", { name: "プレビュー" }));
    await user.click(screen.getByRole("button", { name: "メモを保存" }));
    expect(await screen.findByText("作業メモを保存しました。")).toBeTruthy();
    expect(setProjectNotes).toHaveBeenCalledWith(project, notes.lastWork, notes.nextTask);
    expect(screen.getByRole("heading", { name: "保存処理を実装" })).toBeTruthy();
    expect(screen.getByText("次は設定画面").tagName).toBe("STRONG");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "メモを編集" }));
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe(new Date(notes.updatedAt).toISOString());
    await user.click(screen.getByRole("button", { name: /プロジェクト一覧に戻る/ }));
    expect(screen.getByText("次は設定画面")).toBeTruthy();
    expect(screen.queryByText(/保存処理を実装/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "大" }));
    expect(await screen.findByText(/保存処理を実装/)).toBeTruthy();
  });

  it("prefills saved notes and discards cancelled edits without saving", async () => {
    const saved = { ...project, notes: { lastWork: "Existing work", nextTask: "Existing next", updatedAt: 1792904400000 } };
    const user = await openDetails([saved]);
    await user.click(screen.getByRole("button", { name: "メモを編集" }));
    expect((screen.getByLabelText("前回の作業内容") as HTMLTextAreaElement).value).toBe("Existing work");
    await user.type(screen.getByLabelText("前回の作業内容"), " unsaved");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.getByText("Existing work")).toBeTruthy();
    expect(screen.queryByText("Existing work unsaved")).toBeNull();
    expect(setProjectNotes).not.toHaveBeenCalled();
  });

  it("keeps failed drafts for retry and blocks duplicate saves and cancellation while saving", async () => {
    let finish!: (value: Project) => void;
    vi.mocked(setProjectNotes).mockRejectedValueOnce("保存に失敗しました").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const user = await openDetails();
    await user.click(screen.getByRole("button", { name: "メモを編集" }));
    await user.type(screen.getByLabelText("前回の作業内容"), "Draft work");
    await user.click(screen.getByRole("button", { name: "メモを保存" }));
    expect((await screen.findByRole("alert")).textContent).toBe("保存に失敗しました");
    expect((screen.getByLabelText("前回の作業内容") as HTMLTextAreaElement).value).toBe("Draft work");
    await user.click(screen.getByRole("button", { name: "メモを保存" }));
    await user.click(screen.getByRole("button", { name: "保存中…" }));
    expect(setProjectNotes).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "キャンセル" }).matches(":disabled")).toBe(true);
    finish({ ...project, notes: { lastWork: "Draft work", nextTask: "", updatedAt: 1792904400000 } });
    expect(await screen.findByText("作業メモを保存しました。")).toBeTruthy();
  });

  it("allows clearing both notes and keeps the saved update time visible", async () => {
    const saved = { ...project, notes: { lastWork: "Old", nextTask: "Next", updatedAt: 1792904400000 } };
    vi.mocked(setProjectNotes).mockResolvedValue({ ...saved, notes: { lastWork: "", nextTask: "", updatedAt: 1792904401000 } });
    const user = await openDetails([saved]);
    await user.click(screen.getByRole("button", { name: "メモを編集" }));
    await user.clear(screen.getByLabelText("前回の作業内容"));
    await user.clear(screen.getByLabelText("次にやること"));
    await user.click(screen.getByRole("button", { name: "メモを保存" }));
    await screen.findByText("作業メモを保存しました。");
    expect(setProjectNotes).toHaveBeenCalledWith(saved, "", "");
    expect(screen.getAllByText("未記入")).toHaveLength(2);
    expect(document.querySelector("time")).not.toBeNull();
  });
});
