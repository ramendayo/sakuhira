import type { ReactNode } from "react";
import { SettingsContext, useSettingsState } from "../hooks/useSettings";

export default function SettingsProvider({ children }: { children: ReactNode }) {
  const settings = useSettingsState();
  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}
