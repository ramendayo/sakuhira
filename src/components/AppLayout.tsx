import type { ReactNode } from "react";
import Icon from "./Icon";
import ProjectIcon from "../features/projects/components/ProjectIcon";
import type { Project } from "../features/projects/types/project";
import appIcon from "../../src-tauri/app-icon.svg?no-inline";

type AppLayoutProps = {
  children: ReactNode;
  activePage: "projects" | "settings";
  selectedProjectId: string | null;
  pinnedProjects: Project[];
  onProjectNavigate: (id: string) => void;
  onSettingsNavigate: () => void;
  onProjectsNavigate: () => void;
};

function AppLayout({
  children, activePage, selectedProjectId, pinnedProjects, onProjectNavigate, onProjectsNavigate, onSettingsNavigate,
}: AppLayoutProps) {
  return (
    <div className="app-shell">
      <a href="#main-content" className="sr-only button-primary focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-10">
        メインコンテンツへ移動
      </a>
      <aside className="app-sidebar">
        <div className="brand">
          <img className="brand-mark" src={appIcon} alt="" />
          <span>sakuhira</span>
        </div>
        <nav aria-label="メインナビゲーション" className="sidebar-navigation">
          <a href="#projects" onClick={(event) => { event.preventDefault(); onProjectsNavigate(); }} aria-current={activePage === "projects" && !selectedProjectId ? "page" : undefined} className="nav-link">
            <Icon name="projects" />プロジェクト
          </a>
          {pinnedProjects.length > 0 && (
            <section aria-labelledby="sidebar-pinned-heading" className="sidebar-pinned">
              <h2 id="sidebar-pinned-heading" className="sidebar-pinned-heading">ピン留め</h2>
              <ul aria-labelledby="sidebar-pinned-heading" className="sidebar-pinned-list">
                {pinnedProjects.map((project) => (
                  <li key={project.id}>
                    <a
                      href={`#project-${encodeURIComponent(project.id)}`}
                      onClick={(event) => { event.preventDefault(); onProjectNavigate(project.id); }}
                      aria-current={activePage === "projects" && selectedProjectId === project.id ? "page" : undefined}
                      className="nav-link sidebar-project-link"
                    >
                      <ProjectIcon path={project.path} appearance={project.icon} compact />
                      <span className="min-w-0 truncate" title={project.name}>{project.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="sidebar-settings">
            <a href="#settings" onClick={(event) => { event.preventDefault(); onSettingsNavigate(); }} aria-current={activePage === "settings" ? "page" : undefined} className="nav-link">
              <Icon name="settings" />設定
            </a>
          </div>
        </nav>
      </aside>
      <main id="main-content" tabIndex={-1} className="min-w-0">{children}</main>
    </div>
  );
}

export default AppLayout;
