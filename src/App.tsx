import "./App.css";
import { useState } from "react";
import AppLayout from "./components/AppLayout";
import ProjectsPage from "./pages/ProjectsPage";

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <AppLayout onProjectsNavigate={() => setSelectedId(null)}>
      <ProjectsPage selectedId={selectedId} onSelect={setSelectedId} />
    </AppLayout>
  );
}

export default App;
