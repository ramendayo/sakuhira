import type { ReactNode } from "react";
import Icon from "./Icon";
import SakuraMark from "./SakuraMark";

type AppLayoutProps = {
  children: ReactNode;
  activePage: "projects" | "settings";
  onSettingsNavigate: () => void;
  onProjectsNavigate: () => void;
};

function AppLayout({ children, activePage, onProjectsNavigate, onSettingsNavigate }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <a href="#main-content" className="sr-only button-primary focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-10">
        メインコンテンツへ移動
      </a>
      <aside className="app-sidebar">
        <div className="brand"><SakuraMark className="brand-mark" /><span>sakuhira</span></div>
        <nav aria-label="メインナビゲーション">
          <a href="#projects" onClick={(event) => { event.preventDefault(); onProjectsNavigate(); }} aria-current={activePage === "projects" ? "page" : undefined} className="nav-link">
            <Icon name="projects" />プロジェクト
          </a>
        </nav>
        <div className="border-t border-line pt-4 md:mt-auto">
          <a href="#settings" onClick={(event) => { event.preventDefault(); onSettingsNavigate(); }} aria-current={activePage === "settings" ? "page" : undefined} className="nav-link">
            <Icon name="settings" />設定
          </a>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} className="min-w-0">{children}</main>
    </div>
  );
}

export default AppLayout;
