/**
 * Tests for rollup-calculator — all rollup functions with edge cases
 * including empty records, non-numeric values, and null handling.
 */

import { describe, it, expect } from "vitest";
import type { TFile } from "obsidian";
import type { DatabaseRecord } from "../../types";
import { calculateRollup } from "../rollup-calculator";

const stubFile = { path: "test.md" } as unknown as TFile;

/** Helper to create a DatabaseRecord for testing. */
function makeRecord(
  id: string,
  values: Record<string, unknown>
): DatabaseRecord {
  return {
    id,
    name: id,
    file: stubFile,
    values: values as DatabaseRecord["values"],
    mtime: Date.now(),
  };
}

const records: readonly DatabaseRecord[] = [
  makeRecord("1", { score: 10, tag: "a", notes: "hello" }),
  makeRecord("2", { score: 20, tag: "b", notes: "" }),
  makeRecord("3", { score: 30, tag: null, notes: "world" }),
  makeRecord("4", { score: null, tag: "a", notes: null }),
];

describe("calculateRollup", () => {
  describe("count", () => {
    it("returns total number of records", () => {
      expect(calculateRollup(records, "score", "count")).toBe(4);
    });

    it("returns 0 for empty records", () => {
      expect(calculateRollup([], "score", "count")).toBe(0);
    });
  });

  describe("count_values", () => {
    it("counts non-empty values", () => {
      expect(calculateRollup(records, "score", "count_values")).toBe(3);
    });

    it("excludes empty strings", () => {
      expect(calculateRollup(records, "notes", "count_values")).toBe(2);
    });

    it("returns 0 for empty records", () => {
      expect(calculateRollup([], "score", "count_values")).toBe(0);
    });
  });

  describe("sum", () => {
    it("sums numeric values", () => {
      expect(calculateRollup(records, "score", "sum")).toBe(60);
    });

    it("returns 0 for empty records", () => {
      expect(calculateRollup([], "score", "sum")).toBe(0);
    });

    it("skips non-numeric values", () => {
      expect(calculateRollup(records, "tag", "sum")).toBe(0);
    });
  });

  describe("avg", () => {
    it("averages numeric values", () => {
      expect(calculateRollup(records, "score", "avg")).toBe(20);
    });

    it("returns null for empty records", () => {
      expect(calculateRollup([], "score", "avg")).toBeNull();
    });

    it("returns null when no numeric values exist", () => {
      expect(calculateRollup(records, "tag", "avg")).toBeNull();
    });
  });

  describe("min", () => {
    it("returns minimum numeric value", () => {
      expect(calculateRollup(records, "score", "min")).toBe(10);
    });

    it("returns null for empty records", () => {
      expect(calculateRollup([], "score", "min")).toBeNull();
    });
  });

  describe("max", () => {
    it("returns maximum numeric value", () => {
      expect(calculateRollup(records, "score", "max")).toBe(30);
    });

    it("returns null for empty records", () => {
      expect(calculateRollup([], "score", "max")).toBeNull();
    });
  });

  describe("percent_empty", () => {
    it("calculates percentage of empty values", () => {
      expect(calculateRollup(records, "score", "percent_empty")).toBe(25);
    });

    it("returns 0 for empty records", () => {
      expect(calculateRollup([], "score", "percent_empty")).toBe(0);
    });

    it("returns 100 when all are empty", () => {
      const allNull = [
        makeRecord("a", { x: null }),
        makeRecord("b", { x: null }),
      ];
      expect(calculateRollup(allNull, "x", "percent_empty")).toBe(100);
    });
  });

  describe("percent_not_empty", () => {
    it("calculates percentage of non-empty values", () => {
      expect(calculateRollup(records, "score", "percent_not_empty")).toBe(75);
    });

    it("returns 0 for empty records", () => {
      expect(calculateRollup([], "score", "percent_not_empty")).toBe(0);
    });
  });

  describe("show_original", () => {
    it("joins all non-null values as comma-separated string", () => {
      const result = calculateRollup(records, "score", "show_original");
      expect(result).toBe("10, 20, 30");
    });

    it("returns null for empty records", () => {
      expect(calculateRollup([], "score", "show_original")).toBeNull();
    });

    it("handles string values", () => {
      const result = calculateRollup(records, "tag", "show_original");
      expect(result).toBe("a, b, a");
    });
  });

  describe("edge cases", () => {
    it("handles string numbers in numeric aggregations", () => {
      const stringNums = [
        makeRecord("a", { val: "5" }),
        makeRecord("b", { val: "15" }),
      ];
      expect(calculateRollup(stringNums, "val", "sum")).toBe(20);
      expect(calculateRollup(stringNums, "val", "avg")).toBe(10);
    });

    it("handles single record", () => {
      const single = [makeRecord("a", { val: 42 })];
      expect(calculateRollup(single, "val", "sum")).toBe(42);
      expect(calculateRollup(single, "val", "avg")).toBe(42);
      expect(calculateRollup(single, "val", "min")).toBe(42);
      expect(calculateRollup(single, "val", "max")).toBe(42);
    });

    it("handles missing column gracefully", () => {
      expect(calculateRollup(records, "nonexistent", "count_values")).toBe(0);
      expect(calculateRollup(records, "nonexistent", "sum")).toBe(0);
      expect(calculateRollup(records, "nonexistent", "avg")).toBeNull();
    });
  });
});
