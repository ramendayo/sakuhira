import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsContext } from "./useSettings";
import { useAppearance } from "./useAppearance";
import { applyTheme } from "../services/settings";
import type { ThemePreference } from "../types/settings";

vi.mock("../services/settings", () => ({ applyTheme: vi.fn(async () => {}), getSettings: vi.fn() }));

let dark: boolean;
let media: MediaQueryList;
beforeEach(() => {
  vi.resetAllMocks();
  dark = false;
  media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { get: () => dark });
  vi.stubGlobal("matchMedia", vi.fn(() => media));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Probe() {
  const { error, retry } = useAppearance();
  return <>{error && <p role="alert">{error}</p>}<button onClick={retry}>Retry</button></>;
}

function Harness({ theme }: { theme: ThemePreference | null }) {
  return <SettingsContext.Provider value={{ result: theme === null ? { status: "loading" } : { status: "ready", settings: { defaultEditor: "vsCode", theme, projectOrder: { sort: "recent", manualIds: [] }, projectView: { layout: "cards", cardSize: "standard" } } }, reload: () => {}, replace: () => {} }}><Probe /></SettingsContext.Provider>;
}

function changeOsTheme(value: boolean) {
  act(() => { dark = value; media.dispatchEvent(new Event("change")); });
}

it("follows OS changes while system mode is active and removes its listener on unmount", async () => {
  const remove = vi.spyOn(media, "removeEventListener");
  const { unmount } = render(<Harness theme="system" />);
  expect(document.documentElement.dataset.theme).toBe("light");
  changeOsTheme(true);
  expect(document.documentElement.dataset.theme).toBe("dark");
  changeOsTheme(false);
  expect(document.documentElement.dataset.theme).toBe("light");
  await waitFor(() => expect(applyTheme).toHaveBeenCalledTimes(1));
  unmount();
  expect(remove).toHaveBeenCalled();
  changeOsTheme(true);
  expect(document.documentElement.dataset.theme).toBeUndefined();
});

it("keeps manual themes independent of OS changes and resumes following when switched to system", () => {
  const { rerender } = render(<Harness theme="dark" />);
  changeOsTheme(false);
  expect(document.documentElement.dataset.theme).toBe("dark");
  changeOsTheme(true);
  rerender(<Harness theme="light" />);
  expect(document.documentElement.dataset.theme).toBe("light");
  rerender(<Harness theme="system" />);
  expect(document.documentElement.dataset.theme).toBe("dark");
  changeOsTheme(false);
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("keeps the last applied theme while settings are being reloaded", () => {
  const { rerender } = render(<Harness theme="dark" />);
  rerender(<Harness theme={null} />);
  changeOsTheme(false);
  expect(document.documentElement.dataset.theme).toBe("dark");
  rerender(<Harness theme="light" />);
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("reports native theme failures and allows reapplying the saved theme", async () => {
  vi.mocked(applyTheme).mockRejectedValueOnce("Window theme failed");
  const user = userEvent.setup();
  render(<Harness theme="dark" />);
  expect((await screen.findByRole("alert")).textContent).toBe("Window theme failed");
  expect(document.documentElement.dataset.theme).toBe("dark");
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(applyTheme).toHaveBeenCalledTimes(2);
});

it("ignores a failed native request from a previous theme", async () => {
  let fail!: (error: string) => void;
  vi.mocked(applyTheme).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  const { rerender } = render(<Harness theme="dark" />);
  rerender(<Harness theme="light" />);
  await act(async () => { fail("Old failure"); });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(document.documentElement.dataset.theme).toBe("light");
});
