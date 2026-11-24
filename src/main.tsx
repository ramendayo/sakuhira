import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./App.css";

const quickResume = isTauri() && getCurrentWebviewWindow().label === "quick-resume";

// クイック再開はメイン画面のMarkdown描画などを使わないため、読み込むJSをウィンドウごとに分ける。
const { default: Root } = quickResume
  ? await import("./pages/QuickResumeWindow")
  : await import("./App");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
