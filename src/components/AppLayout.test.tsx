import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AppLayout from "./AppLayout";
import type { Project } from "../features/projects/types/project";

afterEach(cleanup);

it("handles in-app navigation without the browser moving focus to a hash target", () => {
  const projects = vi.fn();
  const settings = vi.fn();
  render(<AppLayout activePage="settings" selectedProjectId={null} pinnedProjects={[]} onProjectNavigate={vi.fn()} onProjectsNavigate={projects} onSettingsNavigate={settings}><h1>Content</h1></AppLayout>);

  expect(fireEvent.click(screen.getByRole("link", { name: "プロジェクト" }))).toBe(false);
  expect(projects).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("region", { name: "ピン留め" })).toBeNull();
  expect(fireEvent.click(screen.getByRole("link", { name: "設定" }))).toBe(false);
  expect(settings).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "設定" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "プロジェクト" }).hasAttribute("aria-current")).toBe(false);
});

it("preserves native navigation for the skip link", () => {
  render(<AppLayout activePage="projects" selectedProjectId={null} pinnedProjects={[]} onProjectNavigate={vi.fn()} onProjectsNavigate={() => {}} onSettingsNavigate={() => {}}>Content</AppLayout>);
  const skip = screen.getByRole("link", { name: "メインコンテンツへ移動" });
  expect(skip.getAttribute("href")).toBe("#main-content");
  expect(fireEvent.click(skip)).toBe(true);
  expect(screen.getByRole("main").tabIndex).toBe(-1);
});

it("collapses and expands the pinned list from its heading button", () => {
  const pinnedProjects: Project[] = [{
    id: "1", name: "sakuhira", path: null, launchUrl: "https://example.com/", lastResumedAt: null,
    notes: { lastWork: "", nextTask: "", updatedAt: null },
  }];
  render(
    <AppLayout activePage="projects" selectedProjectId={null} pinnedProjects={pinnedProjects}
      onProjectNavigate={vi.fn()} onProjectsNavigate={vi.fn()} onSettingsNavigate={vi.fn()}>
      Content
    </AppLayout>,
  );
  const toggle = screen.getByRole("button", { name: "ピン留め" });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link", { name: "sakuhira" })).toBeTruthy();

  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("link", { name: "sakuhira" })).toBeNull();

  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link", { name: "sakuhira" })).toBeTruthy();
});

it("keeps one current link and settings after a long pinned list", () => {
  const pinnedProjects: Project[] = Array.from({ length: 24 }, (_, index) => ({
    id: String(index), name: `Project with a long name ${index + 1}`, path: null,
    launchUrl: "https://example.com/", lastResumedAt: null,
    notes: { lastWork: "", nextTask: "", updatedAt: null },
  }));
  const onProjectNavigate = vi.fn();
  render(
    <AppLayout activePage="projects" selectedProjectId="23"
      pinnedProjects={pinnedProjects} onProjectNavigate={onProjectNavigate}
      onProjectsNavigate={vi.fn()} onSettingsNavigate={vi.fn()}>
      Content
    </AppLayout>,
  );
  const links = screen.getAllByRole("link");
  const active = screen.getByRole("link", { name: "Project with a long name 24", current: "page" });
  expect(screen.getByRole("list", { name: "ピン留め" }).children).toHaveLength(24);
  expect(screen.getAllByRole("link", { current: "page" })).toEqual([active]);
  expect(links[links.length - 1]).toBe(screen.getByRole("link", { name: "設定" }));
  expect(fireEvent.click(active)).toBe(false);
  expect(onProjectNavigate).toHaveBeenCalledWith("23");
});
