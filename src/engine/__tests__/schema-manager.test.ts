/**
 * Tests for schema-manager — parse, serialize, add/remove/update columns,
 * add/remove views, reorder, validation, and default schema creation.
 */

import { describe, it, expect } from "vitest";
import type { TFile } from "obsidian";
import type {
  DatabaseSchema,
  ColumnDefinition,
  TableViewConfig,
  KanbanViewConfig,
} from "../../types";
import {
  parseSchema,
  serializeSchema,
  addColumn,
  removeColumn,
  updateColumn,
  reorderColumns,
  addView,
  removeView,
  createDefaultSchema,
  SchemaValidationError,
} from "../schema-manager";

/** Helper to build a minimal valid schema for testing. */
function makeSchema(overrides?: Partial<DatabaseSchema>): DatabaseSchema {
  return {
    name: "Test DB",
    source: "./notes",
    columns: [
      { id: "file", type: "file", label: "Name" },
      { id: "status", type: "select", label: "Status" },
    ],
    views: [{ id: "v1", type: "table", name: "Table" } as TableViewConfig],
    ...overrides,
  };
}

describe("parseSchema", () => {
  it("parses valid JSON into a DatabaseSchema", () => {
    const schema = makeSchema();
    const result = parseSchema(JSON.stringify(schema));
    expect(result.name).toBe("Test DB");
    expect(result.columns).toHaveLength(2);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseSchema("{bad json")).toThrow(SchemaValidationError);
  });

  it("throws when name is missing", () => {
    const bad = { source: ".", columns: [], views: [] };
    expect(() => parseSchema(JSON.stringify(bad))).toThrow("non-empty name");
  });

  it("throws when source is missing", () => {
    const bad = { name: "X", columns: [], views: [] };
    expect(() => parseSchema(JSON.stringify(bad))).toThrow("non-empty source");
  });

  it("throws on duplicate column IDs", () => {
    const schema = makeSchema({
      columns: [
        { id: "a", type: "text", label: "A" },
        { id: "a", type: "number", label: "B" },
      ],
    });
    expect(() => parseSchema(JSON.stringify(schema))).toThrow("Duplicate column id");
  });

  it("throws when column is missing id", () => {
    const schema = makeSchema({
      columns: [{ id: "", type: "text", label: "A" } as ColumnDefinition],
    });
    expect(() => parseSchema(JSON.stringify(schema))).toThrow("must have an id");
  });

  it("throws when relation column has no target", () => {
    const schema = makeSchema({
      columns: [{ id: "rel", type: "relation", label: "Rel" }],
    });
    expect(() => parseSchema(JSON.stringify(schema))).toThrow("must have a target");
  });

  it("throws when rollup column is missing required fields", () => {
    const schema = makeSchema({
      columns: [{ id: "r", type: "rollup", label: "R" }],
    });
    expect(() => parseSchema(JSON.stringify(schema))).toThrow("relationColumn");
  });

  it("throws on duplicate view IDs", () => {
    const schema = makeSchema({
      views: [
        { id: "v1", type: "table" } as TableViewConfig,
        { id: "v1", type: "table" } as TableViewConfig,
      ],
    });
    expect(() => parseSchema(JSON.stringify(schema))).toThrow("Duplicate view id");
  });
});

describe("serializeSchema", () => {
  it("produces pretty-printed JSON", () => {
    const schema = makeSchema();
    const json = serializeSchema(schema);
    expect(json).toContain("\n");
    expect(JSON.parse(json)).toEqual(schema);
  });
});

describe("addColumn", () => {
  it("returns a new schema with the column appended", () => {
    const schema = makeSchema();
    const newCol: ColumnDefinition = { id: "desc", type: "text", label: "Description" };
    const result = addColumn(schema, newCol);
    expect(result.columns).toHaveLength(3);
    expect(result.columns[2].id).toBe("desc");
    // Original is not mutated
    expect(schema.columns).toHaveLength(2);
  });

  it("throws on duplicate column ID", () => {
    const schema = makeSchema();
    const dup: ColumnDefinition = { id: "file", type: "text", label: "Dup" };
    expect(() => addColumn(schema, dup)).toThrow("already exists");
  });
});

describe("removeColumn", () => {
  it("returns a new schema without the column", () => {
    const schema = makeSchema();
    const result = removeColumn(schema, "status");
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].id).toBe("file");
  });

  it("throws when column not found", () => {
    expect(() => removeColumn(makeSchema(), "nope")).toThrow("not found");
  });
});

describe("updateColumn", () => {
  it("returns a new schema with the column updated", () => {
    const schema = makeSchema();
    const result = updateColumn(schema, "status", { label: "State" });
    expect(result.columns[1].label).toBe("State");
    expect(result.columns[1].type).toBe("select");
    // Original not mutated
    expect(schema.columns[1].label).toBe("Status");
  });

  it("throws when column not found", () => {
    expect(() => updateColumn(makeSchema(), "nope", { label: "X" })).toThrow("not found");
  });
});

describe("reorderColumns", () => {
  it("reorders columns according to provided IDs", () => {
    const schema = makeSchema();
    const result = reorderColumns(schema, ["status", "file"]);
    expect(result.columns[0].id).toBe("status");
    expect(result.columns[1].id).toBe("file");
  });

  it("throws when length does not match", () => {
    expect(() => reorderColumns(makeSchema(), ["file"])).toThrow("length must match");
  });

  it("throws when ID not found", () => {
    expect(() => reorderColumns(makeSchema(), ["file", "nope"])).toThrow("not found");
  });
});

describe("addView", () => {
  it("returns a new schema with the view appended", () => {
    const schema = makeSchema();
    const kanban: KanbanViewConfig = {
      id: "k1",
      type: "kanban",
      groupBy: "status",
    };
    const result = addView(schema, kanban);
    expect(result.views).toHaveLength(2);
    expect(result.views[1].id).toBe("k1");
  });

  it("throws on duplicate view ID", () => {
    const schema = makeSchema();
    const dup: TableViewConfig = { id: "v1", type: "table" };
    expect(() => addView(schema, dup)).toThrow("already exists");
  });
});

describe("removeView", () => {
  it("returns a new schema without the view", () => {
    const schema = makeSchema();
    const result = removeView(schema, "v1");
    expect(result.views).toHaveLength(0);
  });

  it("throws when view not found", () => {
    expect(() => removeView(makeSchema(), "nope")).toThrow("not found");
  });
});

describe("createDefaultSchema", () => {
  it("creates a schema with file, text columns and a table view", () => {
    const schema = createDefaultSchema("My DB");
    expect(schema.name).toBe("My DB");
    expect(schema.source).toBe(".");
    expect(schema.columns).toHaveLength(2);
    expect(schema.columns[0].type).toBe("file");
    expect(schema.columns[1].type).toBe("text");
    expect(schema.views).toHaveLength(1);
    expect(schema.views[0].type).toBe("table");
  });
});
