/**
 * Tests for query-engine — filter, sort, group, and search operations
 * with comprehensive coverage of all operators and edge cases.
 */

import { describe, it, expect } from "vitest";
import type { TFile } from "obsidian";
import type { DatabaseRecord, FilterRule, SortRule } from "../../types";
import {
  filterByDbViewType,
  filterRecords,
  sortRecords,
  groupRecords,
  searchRecords,
} from "../query-engine";

/** Stub TFile for testing (only id/name/values matter for the engine). */
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

const records: readonly DatabaseRecord[] = [
  makeRecord("1", "Alice", { age: 30, status: "active", city: "NYC" }),
  makeRecord("2", "Bob", { age: 25, status: "inactive", city: "LA" }),
  makeRecord("3", "Charlie", { age: 35, status: "active", city: "NYC" }),
  makeRecord("4", "Diana", { age: null, status: null, city: "" }),
];

describe("filterByDbViewType", () => {
  const viewTypeRecords: readonly DatabaseRecord[] = [
    makeRecord("1", "Project A", { "db-view-type": "projects", title: "A" }),
    makeRecord("2", "Meeting 1", { "db-view-type": "meetings", title: "M1" }),
    makeRecord("3", "Project B", { "db-view-type": "projects", title: "B" }),
    makeRecord("4", "No Type", { title: "NT" }),
    makeRecord("5", "Empty Type", { "db-view-type": "", title: "ET" }),
    makeRecord("6", "Null Type", { "db-view-type": null, title: "NullT" }),
  ];

  it("returns all records when dbViewType is undefined", () => {
    expect(filterByDbViewType(viewTypeRecords, undefined)).toBe(viewTypeRecords);
  });

  it("returns all records when dbViewType is empty string", () => {
    expect(filterByDbViewType(viewTypeRecords, "")).toBe(viewTypeRecords);
  });

  it("filters to matching records when dbViewType is set", () => {
    const result = filterByDbViewType(viewTypeRecords, "projects");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Project A");
    expect(result[1].name).toBe("Project B");
  });

  it("excludes records without db-view-type property", () => {
    const result = filterByDbViewType(viewTypeRecords, "projects");
    expect(result.every((r) => r.values["db-view-type"] === "projects")).toBe(true);
  });

  it("excludes records with empty db-view-type", () => {
    const result = filterByDbViewType(viewTypeRecords, "projects");
    expect(result.find((r) => r.name === "Empty Type")).toBeUndefined();
  });

  it("excludes records with null db-view-type", () => {
    const result = filterByDbViewType(viewTypeRecords, "projects");
    expect(result.find((r) => r.name === "Null Type")).toBeUndefined();
  });

  it("is case-sensitive", () => {
    const result = filterByDbViewType(viewTypeRecords, "Projects");
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no records match", () => {
    const result = filterByDbViewType(viewTypeRecords, "nonexistent");
    expect(result).toHaveLength(0);
  });

  it("does not mutate the input array", () => {
    const copy = [...viewTypeRecords];
    filterByDbViewType(viewTypeRecords, "projects");
    expect(viewTypeRecords).toEqual(copy);
  });
});

describe("filterRecords", () => {
  it("returns all records when no filters", () => {
    expect(filterRecords(records, [])).toEqual(records);
  });

  it("filters with eq operator", () => {
    const filters: FilterRule[] = [{ column: "status", operator: "eq", value: "active" }];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alice");
    expect(result[1].name).toBe("Charlie");
  });

  it("filters with neq operator", () => {
    const filters: FilterRule[] = [{ column: "status", operator: "neq", value: "active" }];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(2);
  });

  it("filters with contains operator", () => {
    const filters: FilterRule[] = [{ column: "city", operator: "contains", value: "ny" }];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(2);
  });

  it("filters with not_contains operator", () => {
    const filters: FilterRule[] = [{ column: "city", operator: "not_contains", value: "ny" }];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(2);
  });

  it("filters with gt operator", () => {
    const filters: FilterRule[] = [{ column: "age", operator: "gt", value: 28 }];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(2);
  });

  it("filters with gte operator", () => {
    const filters: FilterRule[] = [{ column: "age", operator: "gte", value: 30 }];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(2);
  });

  it("filters with lt operator", () => {
    const filters: FilterRule[] = [{ column: "age", operator: "lt", value: 30 }];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Bob");
  });

  it("filters with lte operator", () => {
    const filters: FilterRule[] = [{ column: "age", operator: "lte", value: 30 }];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(2);
  });

  it("filters with is_empty operator", () => {
    const filters: FilterRule[] = [{ column: "status", operator: "is_empty" }];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Diana");
  });

  it("filters with is_not_empty operator", () => {
    const filters: FilterRule[] = [{ column: "status", operator: "is_not_empty" }];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(3);
  });

  it("applies multiple filters with AND logic", () => {
    const filters: FilterRule[] = [
      { column: "status", operator: "eq", value: "active" },
      { column: "age", operator: "gt", value: 30 },
    ];
    const result = filterRecords(records, filters);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Charlie");
  });

  it("does not mutate the input array", () => {
    const copy = [...records];
    filterRecords(records, [{ column: "status", operator: "eq", value: "active" }]);
    expect(records).toEqual(copy);
  });
});

describe("sortRecords", () => {
  it("returns records unchanged when no sort rules", () => {
    expect(sortRecords(records, [])).toEqual(records);
  });

  it("sorts strings case-insensitively ascending", () => {
    const sort: SortRule[] = [{ column: "city", dir: "asc" }];
    const result = sortRecords(records, sort);
    // Empty string sorts before "LA" and "NYC"
    expect(result[0].name).toBe("Diana");
  });

  it("sorts numbers ascending", () => {
    const sort: SortRule[] = [{ column: "age", dir: "asc" }];
    const result = sortRecords(records, sort);
    expect(result[0].name).toBe("Bob");
    expect(result[1].name).toBe("Alice");
    expect(result[2].name).toBe("Charlie");
    // Null sorts last
    expect(result[3].name).toBe("Diana");
  });

  it("sorts numbers descending with nulls last", () => {
    const sort: SortRule[] = [{ column: "age", dir: "desc" }];
    const result = sortRecords(records, sort);
    // Nulls stay last even in descending order because compareValues
    // returns 1 for null-vs-value before direction is applied
    expect(result[result.length - 1].name).toBe("Diana");
    // First three are 35, 30, 25
    const nonNullNames = result.slice(0, 3).map((r) => r.name);
    expect(nonNullNames).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("sorts by multiple rules", () => {
    const sort: SortRule[] = [
      { column: "city", dir: "asc" },
      { column: "age", dir: "desc" },
    ];
    const result = sortRecords(records, sort);
    // LA group (Bob), NYC group (Charlie 35, Alice 30), empty (Diana last)
    // Empty string "" sorts first lexicographically
    expect(result[0].name).toBe("Diana");
    expect(result[1].name).toBe("Bob");
    expect(result[2].name).toBe("Charlie");
    expect(result[3].name).toBe("Alice");
  });

  it("handles boolean sorting", () => {
    const boolRecords = [
      makeRecord("a", "A", { done: true }),
      makeRecord("b", "B", { done: false }),
      makeRecord("c", "C", { done: true }),
    ];
    const sort: SortRule[] = [{ column: "done", dir: "asc" }];
    const result = sortRecords(boolRecords, sort);
    expect(result[0].name).toBe("B");
  });

  it("does not mutate the input array", () => {
    const copy = [...records];
    sortRecords(records, [{ column: "age", dir: "asc" }]);
    expect(records).toEqual(copy);
  });
});

describe("groupRecords", () => {
  it("groups by a column value", () => {
    const groups = groupRecords(records, "city");
    expect(groups.get("NYC")).toHaveLength(2);
    expect(groups.get("LA")).toHaveLength(1);
  });

  it("puts null/empty values in 'No value' group", () => {
    const groups = groupRecords(records, "status");
    expect(groups.get("No value")).toHaveLength(1);
    expect(groups.get("No value")![0].name).toBe("Diana");
  });

  it("returns an empty map for empty records", () => {
    const groups = groupRecords([], "city");
    expect(groups.size).toBe(0);
  });
});

describe("searchRecords", () => {
  it("returns all records for empty query", () => {
    expect(searchRecords(records, "")).toEqual(records);
    expect(searchRecords(records, "  ")).toEqual(records);
  });

  it("searches record names", () => {
    const result = searchRecords(records, "alice");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });

  it("searches values case-insensitively", () => {
    // "active" appears in both "active" and "inactive", so 3 matches
    const result = searchRecords(records, "ACTIVE");
    expect(result).toHaveLength(3);
  });

  it("searches across all fields", () => {
    const result = searchRecords(records, "nyc");
    expect(result).toHaveLength(2);
  });

  it("returns empty array when nothing matches", () => {
    const result = searchRecords(records, "zzzzz");
    expect(result).toHaveLength(0);
  });
});
