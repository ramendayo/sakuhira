import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectCollection from "./ProjectCollection";
import { getGitStatus } from "../services/git";
import { resumeProject } from "../services/launch";
import type { Project } from "../types/project";
import type { ProjectView } from "../types/settings";
import type { ResumeReport } from "../types/launch";

vi.mock("../services/git", () => ({ getGitStatus: vi.fn(async () => ({ kind: "notRepository" })) }));
vi.mock("../services/launch", () => ({ resumeProject: vi.fn() }));
const project: Project = { id: "id", name: "長いプロジェクト名".repeat(10), path: "/projects/" + "long-path/".repeat(20), launchUrl: null, lastResumedAt: 3000, notes: { lastWork: "前回の作業メモ", nextTask: "次の作業メモ", updatedAt: null } };
const views: ProjectView[] = [{ layout: "cards", cardSize: "small" }, { layout: "cards", cardSize: "standard" }, { layout: "cards", cardSize: "large" }, { layout: "list", cardSize: "standard" }];
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it.each(views)("keeps details accessible with the intended information in $layout / $cardSize", async (view) => {
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(<ProjectCollection projects={[project]} view={view} onSelect={onSelect} onResumed={vi.fn()} />);
  expect(screen.getByRole("heading", { name: project.name })).toBeTruthy();
  const name = screen.getByRole("button", { name: `${project.name}の詳細を開く` });
  expect(name.getAttribute("title")).toBe(project.name);
  name.focus();
  await user.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledWith(project.id);
  expect(screen.getByRole("button", { name: `${project.name}を再開` })).toBeTruthy();
  expect(document.querySelector("time")?.dateTime).toBe(new Date(3000).toISOString());
  const small = view.layout === "cards" && view.cardSize === "small";
  expect(Boolean(screen.queryByText(project.path!))).toBe(!small);
  if (small) expect(getGitStatus).not.toHaveBeenCalled();
  else expect(await screen.findByText("Git管理外")).toBeTruthy();
  expect(Boolean(screen.queryByText(project.notes.nextTask))).toBe(view.layout === "cards" && !small);
  expect(Boolean(screen.queryByText(project.notes.lastWork))).toBe(view.layout === "cards" && view.cardSize === "large");
});

it("keeps an in-flight resume across presentation changes and reports its result once", async () => {
  let finish!: (value: ResumeReport) => void;
  vi.mocked(resumeProject).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const onResumed = vi.fn();
  const props = { projects: [project], onSelect: vi.fn(), onResumed };
  const user = userEvent.setup();
  const { rerender } = render(<ProjectCollection {...props} view={views[0]} />);
  await user.click(screen.getByRole("button", { name: `${project.name}を再開` }));
  rerender(<ProjectCollection {...props} view={views[3]} />);
  const button = screen.getByRole("button", { name: `${project.name}を再開` });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await user.click(button);
  expect(resumeProject).toHaveBeenCalledTimes(1);
  await act(async () => finish({ editorName: "VS Code", editor: { status: "success" }, browser: null, history: { status: "saved", timestamp: 4000 } }));
  expect(await screen.findByText("VS Code：起動要求を送信しました。")).toBeTruthy();
  expect(onResumed).toHaveBeenCalledOnce();
});

it("handles missing notes and URL-only projects without requesting Git", () => {
  render(<ProjectCollection projects={[{ ...project, path: null, launchUrl: "https://example.com/", notes: { lastWork: "", nextTask: "", updatedAt: null } }]} view={views[1]} onSelect={vi.fn()} onResumed={vi.fn()} />);
  expect(screen.getByText("作業メモはまだありません。")).toBeTruthy();
  expect(screen.getByText("https://example.com/")).toBeTruthy();
  expect(screen.getByText("Git対象外（URLのみ）")).toBeTruthy();
  expect(getGitStatus).not.toHaveBeenCalled();
});

it("shows plain Markdown excerpts with the appropriate fields for each card size", async () => {
  const longText = "進".repeat(194) + "😀" + "進".repeat(12);
  const notes = {
    lastWork: `# 作業記録\n\n${longText}\n\n` + "`省略されるコード`",
    nextTask: "- [x] **仕様**を[確認](https://example.com/spec)\n- `npm test`\n\n| 状態 |\n| --- |\n| 完了 |",
    updatedAt: null,
  };
  const props = { projects: [{ ...project, notes }], onSelect: vi.fn(), onResumed: vi.fn() };
  const { rerender } = render(<ProjectCollection {...props} view={views[1]} />);
  const nextExcerpt = "仕様を確認 npm test 状態 完了";
  expect(screen.getByText(nextExcerpt).getAttribute("title")).toBe(nextExcerpt);
  expect(screen.queryByText(/^作業記録/)).toBeNull();
  expect(screen.queryByRole("link", { name: "確認" })).toBeNull();

  rerender(<ProjectCollection {...props} view={views[2]} />);
  expect(screen.getByText(nextExcerpt)).toBeTruthy();
  expect(screen.getByText(`作業記録 ${"進".repeat(194)}😀…`)).toBeTruthy();
  expect(screen.queryByText(/省略されるコード/)).toBeNull();

  const fallbackNotes = { ...notes, lastWork: "**前回の作業**", nextTask: "---" };
  rerender(<ProjectCollection {...props} projects={[{ ...project, notes: fallbackNotes }]} view={views[1]} />);
  expect(screen.getByText("前回の作業")).toBeTruthy();
  await screen.findByText("Git管理外");
});
