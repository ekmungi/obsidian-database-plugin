/**
 * Tests for relation-resolver — wikilink parsing, relation resolution,
 * and bidirectional update computation.
 */

import { describe, it, expect } from "vitest";
import type { TFile } from "obsidian";
import type { DatabaseRecord } from "../../types";
import {
  parseWikilink,
  parseWikilinks,
  formatWikilink,
  resolveRelations,
  computeBidirectionalUpdates,
} from "../relation-resolver";

const stubFile = { path: "test.md" } as unknown as TFile;

/** Helper to create a DatabaseRecord for testing. */
function makeRecord(
  id: string,
  name: string,
  values: Record<string, unknown>
): DatabaseRecord {
  return {
    id,
    name,
    file: stubFile,
    values: values as DatabaseRecord["values"],
    mtime: Date.now(),
  };
}

describe("parseWikilink", () => {
  it("extracts note name from a valid wikilink", () => {
    expect(parseWikilink("[[My Note]]")).toBe("My Note");
  });

  it("trims whitespace around the wikilink", () => {
    expect(parseWikilink("  [[Trimmed]]  ")).toBe("Trimmed");
  });

  it("returns null for non-wikilink strings", () => {
    expect(parseWikilink("plain text")).toBeNull();
    expect(parseWikilink("")).toBeNull();
    expect(parseWikilink("[[")).toBeNull();
    expect(parseWikilink("]]")).toBeNull();
  });

  it("returns null for strings with extra text around wikilink", () => {
    expect(parseWikilink("before [[Note]] after")).toBeNull();
  });
});

describe("parseWikilinks", () => {
  it("extracts all wikilinks from a string", () => {
    const result = parseWikilinks("[[A]], [[B]], and [[C]]");
    expect(result).toEqual(["A", "B", "C"]);
  });

  it("handles a single wikilink string", () => {
    expect(parseWikilinks("[[Single]]")).toEqual(["Single"]);
  });

  it("handles an array of wikilink strings", () => {
    const result = parseWikilinks(["[[X]]", "[[Y]]"]);
    expect(result).toEqual(["X", "Y"]);
  });

  it("returns empty for null/undefined", () => {
    expect(parseWikilinks(null)).toEqual([]);
  });

  it("returns empty for numbers and booleans", () => {
    expect(parseWikilinks(42)).toEqual([]);
    expect(parseWikilinks(true)).toEqual([]);
  });

  it("returns empty for strings without wikilinks", () => {
    expect(parseWikilinks("just text")).toEqual([]);
  });

  it("handles mixed arrays with non-string items", () => {
    const result = parseWikilinks([42, 99] as unknown as readonly number[]);
    expect(result).toEqual([]);
  });
});

describe("formatWikilink", () => {
  it("wraps a note name in wikilink syntax", () => {
    expect(formatWikilink("My Note")).toBe("[[My Note]]");
  });

  it("handles empty string", () => {
    expect(formatWikilink("")).toBe("[[]]");
  });
});

describe("resolveRelations", () => {
  const targets = [
    makeRecord("projects/alpha", "Alpha", { status: "active" }),
    makeRecord("projects/beta", "Beta", { status: "done" }),
    makeRecord("projects/gamma", "Gamma", { status: "active" }),
  ];

  it("resolves wikilinks to matching target records", () => {
    const source = makeRecord("tasks/1", "Task 1", {
      project: "[[Alpha]]",
    });
    const result = resolveRelations(source, "project", targets);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alpha");
  });

  it("resolves multiple wikilinks", () => {
    const source = makeRecord("tasks/2", "Task 2", {
      project: "[[Alpha]], [[Gamma]]",
    });
    const result = resolveRelations(source, "project", targets);
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no matches", () => {
    const source = makeRecord("tasks/3", "Task 3", {
      project: "[[NonExistent]]",
    });
    const result = resolveRelations(source, "project", targets);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when column is null", () => {
    const source = makeRecord("tasks/4", "Task 4", { project: null });
    const result = resolveRelations(source, "project", targets);
    expect(result).toHaveLength(0);
  });

  it("matches case-insensitively", () => {
    const source = makeRecord("tasks/5", "Task 5", {
      project: "[[alpha]]",
    });
    const result = resolveRelations(source, "project", targets);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alpha");
  });
});

describe("computeBidirectionalUpdates", () => {
  it("computes updates for targets missing back-links", () => {
    const source = makeRecord("tasks/1", "Task 1", {
      project: "[[Alpha]]",
    });
    const targets = [
      makeRecord("projects/alpha", "Alpha", { tasks: null }),
    ];

    const updates = computeBidirectionalUpdates(
      source,
      "project",
      "tasks",
      targets
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].recordId).toBe("projects/alpha");
    expect(updates[0].field).toBe("tasks");
    expect(updates[0].value).toBe("[[Task 1]]");
  });

  it("skips targets that already have back-links", () => {
    const source = makeRecord("tasks/1", "Task 1", {
      project: "[[Alpha]]",
    });
    const targets = [
      makeRecord("projects/alpha", "Alpha", { tasks: "[[Task 1]]" }),
    ];

    const updates = computeBidirectionalUpdates(
      source,
      "project",
      "tasks",
      targets
    );
    expect(updates).toHaveLength(0);
  });

  it("appends to existing string values", () => {
    const source = makeRecord("tasks/2", "Task 2", {
      project: "[[Alpha]]",
    });
    const targets = [
      makeRecord("projects/alpha", "Alpha", { tasks: "[[Task 1]]" }),
    ];

    const updates = computeBidirectionalUpdates(
      source,
      "project",
      "tasks",
      targets
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].value).toBe("[[Task 1]], [[Task 2]]");
  });

  it("appends to existing array values", () => {
    const source = makeRecord("tasks/2", "Task 2", {
      project: "[[Alpha]]",
    });
    const targets = [
      makeRecord("projects/alpha", "Alpha", { tasks: ["[[Task 1]]"] }),
    ];

    const updates = computeBidirectionalUpdates(
      source,
      "project",
      "tasks",
      targets
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].value).toEqual(["[[Task 1]]", "[[Task 2]]"]);
  });

  it("handles multiple target records", () => {
    const source = makeRecord("tasks/1", "Task 1", {
      project: "[[Alpha]], [[Beta]]",
    });
    const targets = [
      makeRecord("projects/alpha", "Alpha", { tasks: null }),
      makeRecord("projects/beta", "Beta", { tasks: null }),
    ];

    const updates = computeBidirectionalUpdates(
      source,
      "project",
      "tasks",
      targets
    );
    expect(updates).toHaveLength(2);
  });
});
