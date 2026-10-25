import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AppLayout from "./AppLayout";

afterEach(cleanup);

it("handles in-app navigation without the browser moving focus to a hash target", () => {
  const projects = vi.fn();
  const settings = vi.fn();
  render(<AppLayout activePage="settings" onProjectsNavigate={projects} onSettingsNavigate={settings}><h1>Content</h1></AppLayout>);

  expect(fireEvent.click(screen.getByRole("link", { name: "プロジェクト" }))).toBe(false);
  expect(projects).toHaveBeenCalledTimes(1);
  expect(fireEvent.click(screen.getByRole("link", { name: "設定" }))).toBe(false);
  expect(settings).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "設定" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "プロジェクト" }).hasAttribute("aria-current")).toBe(false);
});

it("preserves native navigation for the skip link", () => {
  render(<AppLayout activePage="projects" onProjectsNavigate={() => {}} onSettingsNavigate={() => {}}>Content</AppLayout>);
  const skip = screen.getByRole("link", { name: "メインコンテンツへ移動" });
  expect(skip.getAttribute("href")).toBe("#main-content");
  expect(fireEvent.click(skip)).toBe(true);
  expect(screen.getByRole("main").tabIndex).toBe(-1);
});
