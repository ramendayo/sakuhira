import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";
import QuickResumeWindow from "./pages/QuickResumeWindow";

const quickResume = isTauri() && getCurrentWebviewWindow().label === "quick-resume";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {quickResume ? <QuickResumeWindow /> : <App />}
  </React.StrictMode>,
);
