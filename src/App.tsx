import "./App.css";
import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import AppLayout from "./components/AppLayout";
import SettingsPage from "./pages/SettingsPage";
import ProjectsPage from "./pages/ProjectsPage";
import SettingsProvider from "./components/SettingsProvider";
import { useAppearance } from "./hooks/useAppearance";

function App() {
  return <SettingsProvider><Application /></SettingsProvider>;
}

function Application() {
  const appearance = useAppearance();
  const [page, setPage] = useState<"projects" | "settings">("projects");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const showProjects = useCallback(() => {
    setPage("projects");
    setSelectedId(null);
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const subscription = listen("show-project-list", () => {
      if (!cancelled) showProjects();
    }, { target: "main" });
    void subscription.catch(console.error);
    return () => {
      cancelled = true;
      void subscription.then((unlisten) => unlisten(), () => {});
    };
  }, [showProjects]);

  function openSettings() { setPage("settings"); setSelectedId(null); }
  return (
    <AppLayout activePage={page} onProjectsNavigate={showProjects} onSettingsNavigate={openSettings}>
      {appearance.loadError && page !== "settings" && <div className="page-shell pb-0"><div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-5"><p className="text-sm text-danger">表示設定を読み込めませんでした：{appearance.loadError}</p><button type="button" onClick={openSettings} className="button-secondary mt-3">設定を開く</button></div></div>}
      {appearance.error && <div className="page-shell pb-0"><div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-5"><p className="text-sm text-danger">{appearance.error}</p><button type="button" onClick={appearance.retry} className="button-secondary mt-3">表示テーマを再適用</button></div></div>}
      {page === "projects" ? <ProjectsPage selectedId={selectedId} onSelect={setSelectedId} /> : <SettingsPage />}
    </AppLayout>
  );
}

export default App;
