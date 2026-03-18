/**
 * Tests for the cross-folder engine — merging records, resolving column
 * conflicts, and parsing/serializing CrossFolderConfig.
 */

import { describe, it, expect } from "vitest";
import type { TFile } from "obsidian";
import type { DatabaseRecord, DatabaseSchema, ColumnDefinition } from "../../types";
import {
  mergeRecords,
  resolveColumnConflicts,
  parseCrossFolderConfig,
  serializeCrossFolderConfig,
} from "../cross-folder-engine";

/** Create a minimal TFile stub for testing. */
function stubFile(path: string): TFile {
  return { path, basename: path.split("/").pop()!, stat: { mtime: 0 } } as unknown as TFile;
}

/** Create a minimal DatabaseRecord for testing. */
function makeRecord(id: string, values: Record<string, unknown> = {}): DatabaseRecord {
  return {
    id,
    name: id.split("/").pop()!,
    file: stubFile(id),
    values: values as DatabaseRecord["values"],
    mtime: Date.now(),
  };
}

describe("mergeRecords", () => {
  it("merges records from multiple sources with prefixed IDs", () => {
    const sets = new Map<string, readonly DatabaseRecord[]>([
      ["projects", [makeRecord("task-1.md"), makeRecord("task-2.md")]],
      ["archive", [makeRecord("old-task.md")]],
    ]);

    const merged = mergeRecords(sets);

    expect(merged).toHaveLength(3);
    expect(merged[0].id).toBe("projects/task-1.md");
    expect(merged[1].id).toBe("projects/task-2.md");
    expect(merged[2].id).toBe("archive/old-task.md");
  });

  it("does not double-prefix IDs that already start with the source path", () => {
    const sets = new Map<string, readonly DatabaseRecord[]>([
      ["projects", [makeRecord("projects/task-1.md")]],
    ]);

    const merged = mergeRecords(sets);

    expect(merged[0].id).toBe("projects/task-1.md");
  });

  it("returns empty array for empty input", () => {
    const sets = new Map<string, readonly DatabaseRecord[]>();
    const merged = mergeRecords(sets);
    expect(merged).toHaveLength(0);
  });

  it("preserves record values through merge", () => {
    const sets = new Map<string, readonly DatabaseRecord[]>([
      ["src", [makeRecord("note.md", { status: "active", priority: 1 })]],
    ]);

    const merged = mergeRecords(sets);

    expect(merged[0].values).toEqual({ status: "active", priority: 1 });
  });
});

describe("resolveColumnConflicts", () => {
  it("unions unique columns from multiple schemas", () => {
    const schemas: DatabaseSchema[] = [
      {
        name: "Projects",
        source: "projects",
        columns: [
          { id: "col-1", type: "text", label: "Name" },
          { id: "col-2", type: "number", label: "Priority" },
        ],
        views: [],
      },
      {
        name: "Tasks",
        source: "tasks",
        columns: [
          { id: "col-3", type: "text", label: "Name" },
          { id: "col-4", type: "date", label: "Due Date" },
        ],
        views: [],
      },
    ];

    const resolved = resolveColumnConflicts(schemas);

    // "Name" (text) appears in both — should be merged into one
    // "Priority" (number) and "Due Date" (date) are unique
    expect(resolved).toHaveLength(3);
    expect(resolved.map((c) => c.label)).toEqual(["Name", "Priority", "Due Date"]);
  });

  it("merges select options for matching columns", () => {
    const schemas: DatabaseSchema[] = [
      {
        name: "A",
        source: "a",
        columns: [
          {
            id: "status-1",
            type: "select",
            label: "Status",
            options: [
              { value: "active", color: "green" },
              { value: "done", color: "gray" },
            ],
          },
        ],
        views: [],
      },
      {
        name: "B",
        source: "b",
        columns: [
          {
            id: "status-2",
            type: "select",
            label: "Status",
            options: [
              { value: "active", color: "green" },
              { value: "archived", color: "blue" },
            ],
          },
        ],
        views: [],
      },
    ];

    const resolved = resolveColumnConflicts(schemas);

    expect(resolved).toHaveLength(1);
    const options = resolved[0].options!;
    // "active" should be deduplicated
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.value)).toEqual(["active", "done", "archived"]);
  });

  it("treats columns with same label but different types as distinct", () => {
    const schemas: DatabaseSchema[] = [
      {
        name: "A",
        source: "a",
        columns: [{ id: "col-1", type: "text", label: "Value" }],
        views: [],
      },
      {
        name: "B",
        source: "b",
        columns: [{ id: "col-2", type: "number", label: "Value" }],
        views: [],
      },
    ];

    const resolved = resolveColumnConflicts(schemas);

    expect(resolved).toHaveLength(2);
    expect(resolved[0].type).toBe("text");
    expect(resolved[1].type).toBe("number");
  });

  it("returns empty array for empty schemas", () => {
    const resolved = resolveColumnConflicts([]);
    expect(resolved).toHaveLength(0);
  });
});

describe("parseCrossFolderConfig", () => {
  const validConfig = {
    id: "cross-1",
    name: "All Tasks",
    sources: ["projects", "personal"],
    columns: [{ id: "col-1", type: "text", label: "Name" }],
    views: [{ id: "view-1", type: "table", name: "Default" }],
  };

  it("parses valid JSON into a frozen config", () => {
    const config = parseCrossFolderConfig(JSON.stringify(validConfig));

    expect(config.id).toBe("cross-1");
    expect(config.name).toBe("All Tasks");
    expect(config.sources).toEqual(["projects", "personal"]);
    expect(config.columns).toHaveLength(1);
    expect(config.views).toHaveLength(1);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("throws on missing id", () => {
    const bad = { ...validConfig, id: undefined };
    expect(() => parseCrossFolderConfig(JSON.stringify(bad))).toThrow("'id'");
  });

  it("throws on missing name", () => {
    const bad = { ...validConfig, name: undefined };
    expect(() => parseCrossFolderConfig(JSON.stringify(bad))).toThrow("'name'");
  });

  it("throws on empty sources array", () => {
    const bad = { ...validConfig, sources: [] };
    expect(() => parseCrossFolderConfig(JSON.stringify(bad))).toThrow("'sources'");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseCrossFolderConfig("not json")).toThrow();
  });
});

describe("serializeCrossFolderConfig", () => {
  it("round-trips through parse and serialize", () => {
    const original = {
      id: "cross-1",
      name: "All Tasks",
      sources: ["projects", "personal"],
      columns: [{ id: "col-1", type: "text" as const, label: "Name" }],
      views: [
        { id: "view-1", type: "table" as const, name: "Default" },
      ],
    };

    const serialized = serializeCrossFolderConfig(original);
    const parsed = parseCrossFolderConfig(serialized);

    expect(parsed.id).toBe(original.id);
    expect(parsed.name).toBe(original.name);
    expect(parsed.sources).toEqual(original.sources);
    expect(parsed.columns).toHaveLength(1);
  });

  it("produces formatted JSON", () => {
    const config = {
      id: "x",
      name: "X",
      sources: ["a"],
      columns: [] as readonly ColumnDefinition[],
      views: [],
    };

    const json = serializeCrossFolderConfig(config);

    // Should be indented (multi-line)
    expect(json).toContain("\n");
    expect(json).toContain("  ");
  });
});
