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
