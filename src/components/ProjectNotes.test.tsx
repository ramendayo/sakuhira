import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectNotes from "./ProjectNotes";
import { setProjectNotes } from "../services/notes";
import type { Project } from "../types/project";

vi.mock("../services/notes", () => ({ setProjectNotes: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const project: Project = { id: "id", name: "Project", path: "/project", launchUrl: null, notes: { lastWork: "", nextTask: "", updatedAt: null } };

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

it("renders saved notes as literal text and provides a machine-readable update time", () => {
  const text = '<img src="x" onerror="alert(1)">';
  const saved = { ...project, notes: { lastWork: text, nextTask: "Next", updatedAt: 1792904400000 } };
  render(<ProjectNotes project={saved} editing={false} onEdit={vi.fn()} onCancel={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.getByText(text)).toBeTruthy();
  expect(document.querySelector("img")).toBeNull();
  expect(document.querySelector("time")?.getAttribute("datetime")).toBe(new Date(saved.notes.updatedAt).toISOString());
});
