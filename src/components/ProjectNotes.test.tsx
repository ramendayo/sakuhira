import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectNotes from "./ProjectNotes";
import { openNoteLink, setProjectNotes } from "../services/notes";
import type { Project } from "../types/project";

vi.mock("../services/notes", () => ({ setProjectNotes: vi.fn(), openNoteLink: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const project: Project = { id: "id", name: "Project", path: "/project", launchUrl: null, lastResumedAt: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };

it("does not replace an editing baseline or draft when newer project data arrives", async () => {
  vi.mocked(setProjectNotes).mockRejectedValue("別の操作で更新されています");
  const user = userEvent.setup();
  const onSaved = vi.fn();
  const props = { editing: true, onEdit: vi.fn(), onCancel: vi.fn(), onSaved };
  const { rerender } = render(<ProjectNotes {...props} project={project} />);
  await user.type(screen.getByLabelText("前回の作業内容"), "My draft");
  const newer = { ...project, notes: { lastWork: "Other work", nextTask: "Other", updatedAt: 1792904400000 } };
  rerender(<ProjectNotes {...props} project={newer} />);
  await user.click(screen.getByRole("button", { name: "メモを保存" }));
  expect(setProjectNotes).toHaveBeenCalledWith(project, "My draft", "");
  expect((await screen.findByRole("alert")).textContent).toContain("別の操作");
  expect(onSaved).not.toHaveBeenCalled();
});

it("keeps raw HTML inert and preserves plain notes and their update time", () => {
  const text = '<img src="x" onerror="alert(1)">';
  const saved = { ...project, notes: { lastWork: text, nextTask: "次の作業\n改行を含むメモ", updatedAt: 1792904400000 } };
  render(<ProjectNotes project={saved} editing={false} onEdit={vi.fn()} onCancel={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getByText("次の作業 改行を含むメモ").textContent).toBe(saved.notes.nextTask);
  expect(document.querySelector("img")).toBeNull();
  expect(document.querySelector("time")?.getAttribute("datetime")).toBe(new Date(saved.notes.updatedAt).toISOString());
});

it("renders Markdown and opens only HTTP or HTTPS links through the desktop service", async () => {
  const saved = {
    ...project,
    notes: {
      ...project.notes,
      lastWork: [
        "# 実装メモ",
        "**完了**と`npm test`",
        "- [x] ビルド",
        "| 名前 |\n| --- |\n| Reentry |",
        "```sh\nnpm run build\n```",
        "[仕様](https://example.com/spec) [ローカル](http://localhost:3000) [危険](javascript:alert%281%29) [相対](/path)",
        "![画像](https://example.com/screenshot.png)",
      ].join("\n\n"),
    },
  };
  const user = userEvent.setup();
  vi.mocked(openNoteLink).mockResolvedValueOnce(undefined).mockRejectedValueOnce("ブラウザを開けませんでした。");
  render(<ProjectNotes project={saved} editing={false} onEdit={vi.fn()} onCancel={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "実装メモ", level: 3 })).toBeTruthy();
  expect(screen.getByText("完了").tagName).toBe("STRONG");
  expect(screen.getByText("npm test").tagName).toBe("CODE");
  expect(screen.getByText("npm run build").closest("pre")).toBeTruthy();
  expect(screen.getByRole<HTMLInputElement>("checkbox", { checked: true }).disabled).toBe(true);
  expect(within(screen.getByRole("table")).getByRole("cell", { name: "Reentry" })).toBeTruthy();
  expect(screen.getByText("未記入")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByRole("link", { name: "仕様" }).getAttribute("href")).toBe("https://example.com/spec");
  expect(screen.getAllByRole("link")).toHaveLength(2);
  expect(openNoteLink).not.toHaveBeenCalled();
  await user.click(screen.getByRole("link", { name: "仕様" }));
  expect(openNoteLink).toHaveBeenNthCalledWith(1, "https://example.com/spec");
  await user.click(screen.getByRole("link", { name: "ローカル" }));
  expect(openNoteLink).toHaveBeenNthCalledWith(2, "http://localhost:3000");
  expect((await screen.findByRole("alert")).textContent).toBe("ブラウザを開けませんでした。");
});
