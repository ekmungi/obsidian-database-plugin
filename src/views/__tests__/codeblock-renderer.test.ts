/** Tests for codeblock config parsing and view resolution — pure functions only. */

import { describe, it, expect } from "vitest";

/* ── Inline the pure functions to avoid importing obsidian ── */

interface CodeblockConfig {
  readonly source: string;
  readonly view?: string;
  readonly maxHeight?: number;
}

/** Parse the YAML-like content of a database codeblock into a config object. */
function parseCodeblockConfig(source: string): CodeblockConfig | null {
  const lines = source.trim().split("\n");
  const config: Record<string, string> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.substring(0, colonIdx).trim();
    const val = line.substring(colonIdx + 1).trim();
    if (key && val) {
      config[key] = val;
    }
  }
  if (!config.source) return null;
  return {
    source: config.source,
    view: config.view || undefined,
    maxHeight: config.maxHeight ? parseInt(config.maxHeight, 10) || undefined : undefined,
  };
}

interface ViewConfig {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly isDefault?: boolean;
  readonly groupBy?: string;
}

interface SchemaLike {
  readonly views: readonly ViewConfig[];
}

/** Resolve a view specifier to a concrete view config. */
function resolveView(schema: SchemaLike, viewSpec?: string): ViewConfig | undefined {
  if (!schema.views.length) return undefined;
  if (viewSpec) {
    const byName = schema.views.find((v) => v.name === viewSpec);
    if (byName) return byName;
    const lowerSpec = viewSpec.toLowerCase();
    const byType = schema.views.find((v) => v.type === lowerSpec);
    if (byType) return byType;
  }
  return schema.views.find((v) => v.isDefault) ?? schema.views[0];
}

/* ── parseCodeblockConfig ────────────────────── */

describe("parseCodeblockConfig", () => {
  it("parses valid YAML with source only", () => {
    const result = parseCodeblockConfig("source: My Folder/Sub");
    expect(result).toEqual({ source: "My Folder/Sub", view: undefined, maxHeight: undefined });
  });

  it("parses all fields", () => {
    const result = parseCodeblockConfig("source: Projects\nview: Main\nmaxHeight: 400");
    expect(result).toEqual({ source: "Projects", view: "Main", maxHeight: 400 });
  });

  it("returns null when source is missing", () => {
    expect(parseCodeblockConfig("view: Main\nmaxHeight: 400")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseCodeblockConfig("")).toBeNull();
  });

  it("ignores extra/unknown fields", () => {
    const result = parseCodeblockConfig("source: Test\nfoo: bar\nbaz: 123");
    expect(result).toEqual({ source: "Test", view: undefined, maxHeight: undefined });
  });

  it("handles lines without colons gracefully", () => {
    const result = parseCodeblockConfig("source: Test\nno-colon-here");
    expect(result).toEqual({ source: "Test", view: undefined, maxHeight: undefined });
  });

  it("handles non-numeric maxHeight", () => {
    const result = parseCodeblockConfig("source: Test\nmaxHeight: abc");
    expect(result).toEqual({ source: "Test", view: undefined, maxHeight: undefined });
  });

  it("trims whitespace from keys and values", () => {
    const result = parseCodeblockConfig("  source :  My Folder  \n  view :  Table 1  ");
    expect(result).toEqual({ source: "My Folder", view: "Table 1", maxHeight: undefined });
  });
});

/* ── resolveView ─────────────────────────────── */

describe("resolveView", () => {
  const tableView: ViewConfig = { id: "t1", type: "table", name: "Main" };
  const kanbanView: ViewConfig = { id: "k1", type: "kanban", name: "Board", groupBy: "status" };
  const defaultView: ViewConfig = { id: "t2", type: "table", name: "Default", isDefault: true };

  it("resolves by exact name match", () => {
    expect(resolveView({ views: [tableView, kanbanView, defaultView] }, "Board")).toBe(kanbanView);
  });

  it("resolves by type when no name matches", () => {
    expect(resolveView({ views: [tableView, kanbanView, defaultView] }, "kanban")).toBe(kanbanView);
  });

  it("falls back to default view when spec doesn't match", () => {
    expect(resolveView({ views: [tableView, kanbanView, defaultView] }, "nonexistent")).toBe(defaultView);
  });

  it("falls back to default view when no spec provided", () => {
    expect(resolveView({ views: [tableView, kanbanView, defaultView] }, undefined)).toBe(defaultView);
  });

  it("falls back to first view when no default exists", () => {
    expect(resolveView({ views: [tableView, kanbanView] }, undefined)).toBe(tableView);
  });

  it("returns undefined when no views exist", () => {
    expect(resolveView({ views: [] }, "Main")).toBeUndefined();
  });

  it("name match takes priority over type match", () => {
    const confusingView: ViewConfig = { id: "x1", type: "kanban", name: "table", groupBy: "s" };
    expect(resolveView({ views: [tableView, confusingView] }, "table")).toBe(confusingView);
  });
});
