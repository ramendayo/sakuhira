import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Project } from "../types/project";
import { QuickResumeSearch } from "./QuickResumeWindow";

const pinned: Project = {
  id: "pinned", name: "ガイド", path: null, launchUrl: "https://example.com/guide",
  notes: { lastWork: "", nextTask: "", updatedAt: null }, lastResumedAt: null,
};
const latest: Project = {
  ...pinned, id: "latest", name: "開発ツール", path: "/work/tool", launchUrl: null, lastResumedAt: 100,
};

afterEach(cleanup);

it("focuses an empty search and starts on the most recently resumed project each time it opens", async () => {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  const onResume = vi.fn();
  const props = { projects: [pinned, latest], pinnedIds: [pinned.id], onDismiss, onResume };
  const { rerender } = render(<QuickResumeSearch key="first" {...props} />);
  const input = screen.getByRole<HTMLInputElement>("combobox", { name: "プロジェクトを検索" });
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("");
  expect(screen.getByRole("option", { name: /開発ツール/, selected: true })).toBeTruthy();
  expect(screen.getByText("/work/tool")).toBeTruthy();
  expect(screen.getByText("https://example.com/guide")).toBeTruthy();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onResume).toHaveBeenCalledWith(pinned);
  await user.keyboard("{ArrowUp}{Enter}");
  expect(onResume).toHaveBeenLastCalledWith(latest);
  await user.type(input, "ガイド");
  expect(screen.getByRole("option", { selected: true }).textContent).toContain("ガイド");
  await user.keyboard("{Escape}");
  expect(onDismiss).toHaveBeenCalledOnce();

  rerender(<QuickResumeSearch key="reopened" {...props} />);
  const reopened = screen.getByRole<HTMLInputElement>("combobox");
  expect(document.activeElement).toBe(reopened);
  expect(reopened.value).toBe("");
  expect(screen.getByRole("option", { name: /開発ツール/, selected: true })).toBeTruthy();
});

it("leaves IME confirmation and an empty result alone", async () => {
  const user = userEvent.setup();
  const onResume = vi.fn();
  const onDismiss = vi.fn();
  render(<QuickResumeSearch projects={[latest]} onResume={onResume} onDismiss={onDismiss} />);
  const input = screen.getByRole("combobox");
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(onResume).not.toHaveBeenCalled();
  expect(onDismiss).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  expect(onResume).toHaveBeenCalledOnce();

  await user.type(input, "該当なし");
  expect(screen.getByRole("status").textContent).toContain("一致するプロジェクトがありません");
  expect(input.getAttribute("aria-activedescendant")).toBeNull();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onResume).toHaveBeenCalledOnce();
});
