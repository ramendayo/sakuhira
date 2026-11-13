import { describe, expect, it } from "vitest";
import { moveProject, normalizeManualIds, orderedProjects, quickResumeCandidates } from "./projectOrder";
import type { Project } from "../types/project";
import type { ProjectSort } from "../types/settings";

const project = (id: string, name: string, lastResumedAt: number | null = null): Project => ({ id, name, path: `/work/${name}`, launchUrl: null, lastResumedAt, notes: { lastWork: "", nextTask: "", updatedAt: null } });
const projects = [project("a", "アプリ10", 20), project("b", "アプリ2", 30), project("c", "あいう", 20), project("d", "未再開")];
const ids = (sort: ProjectSort, query = "", manualIds: string[] = []) => orderedProjects(projects, { sort, manualIds }, query).map(({ id }) => id);

describe("project order", () => {
  it("sorts recent first with never-resumed last and stable registration ties", () => {
    expect(ids("recent")).toEqual(["b", "a", "c", "d"]);
    expect(ids("recent", " アプリ ")).toEqual(["b", "a"]);
    expect(ids("recent", "/WORK/")).toEqual(["b", "a", "c", "d"]);
  });
  it("compares Japanese names and numbers naturally, keeping equivalent names stable", () => {
    expect(ids("name")).toEqual(["c", "b", "a", "d"]);
    const equal = [project("first", "APP2"), project("second", "app2")];
    expect(orderedProjects(equal, { sort: "name", manualIds: [] }, "").map(({ id }) => id)).toEqual(["first", "second"]);
  });
  it("uses durable registration order for newest first, including search results", () => {
    expect(ids("newest")).toEqual(["d", "c", "b", "a"]);
    expect(ids("newest", "アプリ")).toEqual(["b", "a"]);
  });
  it("removes stale and duplicate IDs, prepends missing registrations, and filters without reordering", () => {
    expect(normalizeManualIds(projects, ["gone", "b", "b", "a"])).toEqual(["d", "c", "b", "a"]);
    expect(ids("manual", "アプリ", ["a", "b"])).toEqual(["a", "b"]);
    expect(normalizeManualIds([], ["a", "a"])).toEqual([]);
    expect(normalizeManualIds(projects, [])).toEqual(["d", "c", "b", "a"]);
  });
  it("moves before and after without mutating input or dropping IDs, including boundaries", () => {
    const original = ["a", "b", "c"];
    expect(moveProject(original, "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveProject(original, "c", 0)).toEqual(["c", "a", "b"]);
    for (const [id, target] of [["gone", 1], ["a", -1], ["a", 3], ["a", 0]] as const) expect(moveProject(original, id, target)).toBe(original);
    expect(original).toEqual(["a", "b", "c"]);
  });
});

describe("quick resume candidates", () => {
  it("puts the most recently resumed project first, then pinned and recent projects without duplicates", () => {
    const pinnedRecent = project("pinned-recent", "Pinned recent", 20);
    const latest = project("latest", "Latest", 30);
    const pinnedNever = project("pinned-never", "Pinned never");
    const older = project("older", "Older", 10);
    const entries = [pinnedNever, older, pinnedRecent, latest];
    const pins = ["missing", pinnedNever.id, pinnedRecent.id, pinnedRecent.id];
    expect(quickResumeCandidates(entries, "  ", pins)).toEqual([latest, pinnedRecent, pinnedNever, older]);
    expect(quickResumeCandidates(entries, "", [...pins, latest.id])).toEqual([latest, pinnedRecent, pinnedNever, older]);
  });

  it("uses stable registration order for equal timestamps and the first pinned item when there is no history", () => {
    const first = project("first", "First", 20);
    const pinned = project("pinned", "Pinned", 20);
    expect(quickResumeCandidates([first, pinned], "", [pinned.id])).toEqual([first, pinned]);
    const never = { ...first, lastResumedAt: null };
    const pinnedNever = { ...pinned, lastResumedAt: null };
    expect(quickResumeCandidates([never, pinnedNever], "", [pinned.id])).toEqual([pinnedNever, never]);
    expect(quickResumeCandidates([], "")).toEqual([]);
  });

  it("ranks exact names, prefixes, substrings, and paths before using pin and recency to break ties", () => {
    const pathMatch = { ...project("path", "Docs", 60), path: "/WORK/開発APP/docs" };
    const substring = project("substring", "個人用 開発App", 50);
    const prefix = project("prefix", "開発App 手順", 40);
    const pinnedPrefix = project("pinned-prefix", "開発App メモ", 20);
    const exact = { ...project("exact", "開発App"), path: null, launchUrl: "https://example.com" };
    const urlOnly = { ...project("web", "Web"), path: null, launchUrl: "https://example.com/開発app" };
    const entries = [pathMatch, substring, prefix, pinnedPrefix, exact, urlOnly];
    expect(quickResumeCandidates(entries, "  開発APP  ", [pathMatch.id, pinnedPrefix.id])).toEqual([
      exact, pinnedPrefix, prefix, substring, pathMatch,
    ]);
    expect(quickResumeCandidates(entries, "example.com")).toEqual([]);
  });
});
