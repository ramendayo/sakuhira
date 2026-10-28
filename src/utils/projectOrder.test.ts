import { describe, expect, it } from "vitest";
import { moveProject, normalizeManualIds, orderedProjects } from "./projectOrder";
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
