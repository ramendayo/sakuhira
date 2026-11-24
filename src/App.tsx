import "./App.css";
import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import AppLayout from "./components/AppLayout";
import SettingsPage from "./pages/SettingsPage";
import ProjectsPage from "./pages/ProjectsPage";
import SettingsProvider from "./components/SettingsProvider";
import { useAppearance } from "./hooks/useAppearance";
import { resumeErrorMessages } from "./features/projects/services/launch";
import { useProjectPresentation } from "./features/projects/hooks/useProjectPresentation";
import { useProjects } from "./features/projects/hooks/useProjects";
import { onShortcutLaunchFailure } from "./services/shortcuts";

type AppPage =
  | { kind: "projects"; selectedId: string | null }
  | { kind: "settings" };

function App() {
  return <SettingsProvider><Application /></SettingsProvider>;
}

function Application() {
  const appearance = useAppearance();
  const projectPresentation = useProjectPresentation();
  const projectState = useProjects(projectPresentation.clearInvalidChange);
  const [page, setPage] = useState<AppPage>({ kind: "projects", selectedId: null });
  const [shortcutFailure, setShortcutFailure] = useState<{ projectName: string; messages: string[] } | null>(null);
  const showProjects = useCallback(() => {
    setPage({ kind: "projects", selectedId: null });
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const subscription = listen("show-project-list", () => {
      if (!cancelled) showProjects();
    }, { target: "main" });
    const launchSubscription = onShortcutLaunchFailure(({ projectName, result }) => {
      if (cancelled) return;
      const messages = "Ok" in result ? resumeErrorMessages(result.Ok) : [result.Err];
      setShortcutFailure({ projectName, messages });
    });
    for (const listener of [subscription, launchSubscription]) void listener.catch(console.error);
    return () => {
      cancelled = true;
      for (const listener of [subscription, launchSubscription]) {
        void listener.then((unlisten) => unlisten(), () => {});
      }
    };
  }, [showProjects]);

  function showProject(id: string) {
    setPage({ kind: "projects", selectedId: id });
  }

  function closeRemovedProject(id: string) {
    setPage((current) => current.kind === "projects" && current.selectedId === id
      ? { kind: "projects", selectedId: null } : current);
  }

  function openSettings() { setPage({ kind: "settings" }); }
  return (
    <AppLayout activePage={page.kind} onProjectsNavigate={showProjects} onSettingsNavigate={openSettings}>
      {appearance.loadError && page.kind !== "settings" && <div className="page-shell pb-0"><div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-5"><p className="text-sm text-danger">表示設定を読み込めませんでした：{appearance.loadError}</p><button type="button" onClick={openSettings} className="button-secondary mt-3">設定を開く</button></div></div>}
      {appearance.error && <div className="page-shell pb-0"><div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-5"><p className="text-sm text-danger">{appearance.error}</p><button type="button" onClick={appearance.retry} className="button-secondary mt-3">表示テーマを再適用</button></div></div>}
      {shortcutFailure && (
        <div className="page-shell pb-0">
          <div className="rounded-xl border border-danger-line bg-danger-soft p-5">
            <div role="alert" className="space-y-1 break-words text-sm text-danger">
              <p>「{shortcutFailure.projectName}」をショートカットで再開した際にエラーが発生しました。</p>
              {shortcutFailure.messages.map((message, index) => <p key={index}>{message}</p>)}
            </div>
            <button type="button" onClick={() => setShortcutFailure(null)} className="button-secondary mt-3">通知を閉じる</button>
          </div>
        </div>
      )}
      {page.kind === "projects" ? (
        <ProjectsPage
          projectState={projectState}
          selectedId={page.selectedId}
          onOpenProject={showProject}
          onBack={showProjects}
          onProjectRemoved={closeRemovedProject}
          presentation={projectPresentation}
        />
      ) : <SettingsPage />}
    </AppLayout>
  );
}

export default App;
