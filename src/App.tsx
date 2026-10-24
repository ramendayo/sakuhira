import "./App.css";
import { useState } from "react";
import AppLayout from "./components/AppLayout";
import SettingsPage from "./pages/SettingsPage";
import ProjectsPage from "./pages/ProjectsPage";

function App() {
  const [page, setPage] = useState<"projects" | "settings">("projects");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <AppLayout activePage={page} onProjectsNavigate={() => { setPage("projects"); setSelectedId(null); }} onSettingsNavigate={() => { setPage("settings"); setSelectedId(null); }}>
      {page === "projects" ? <ProjectsPage selectedId={selectedId} onSelect={setSelectedId} /> : <SettingsPage />}
    </AppLayout>
  );
}

export default App;
