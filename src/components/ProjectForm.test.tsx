import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectForm from "./ProjectForm";
import * as api from "../services/projects";

vi.mock("../services/projects", async (importOriginal) => ({
  ...await importOriginal<typeof api>(),
  updateProject: vi.fn(),
}));
afterEach(cleanup);

it("keeps the editing baseline when newer data arrives during editing", async () => {
  const original = { id: "id", name: "Original", path: "/original" };
  const newer = { ...original, name: "Updated elsewhere" };
  vi.mocked(api.updateProject).mockRejectedValue("別の操作で更新されています");
  const user = userEvent.setup();
  const onSaved = vi.fn();
  const { rerender } = render(<ProjectForm project={original} onSaved={onSaved} onCancel={vi.fn()} />);
  await user.clear(screen.getByLabelText("プロジェクト名"));
  await user.type(screen.getByLabelText("プロジェクト名"), "My draft");
  rerender(<ProjectForm project={newer} onSaved={onSaved} onCancel={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "変更を保存" }));
  expect(api.updateProject).toHaveBeenCalledWith(original, "My draft", original.path);
  expect((await screen.findByRole("alert")).textContent).toContain("別の操作");
  expect(onSaved).not.toHaveBeenCalled();
});
