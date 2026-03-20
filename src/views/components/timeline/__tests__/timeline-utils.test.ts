/** Tests for timeline utility functions — date math, filtering, and layout. */

import { describe, it, expect } from "vitest";
import {
  parseDate, formatDateStr, daysBetween, filterRecordsWithDates,
  getDateRange, getDataDrivenRange, dateToPosition, getBarDimensions,
  getHeaderColumns, getColumnWidth,
} from "../timeline-utils";
import type { DatabaseRecord } from "../../../../types/record";
import type { TFile } from "obsidian";

/** Helper to create a minimal DatabaseRecord for testing. */
function makeRecord(id: string, values: Record<string, unknown>): DatabaseRecord {
  return {
    id,
    name: id,
    file: { path: id } as TFile,
    values: values as Record<string, unknown>,
    mtime: Date.now(),
  };
}

describe("parseDate", () => {
  it("parses a valid YYYY-MM-DD string", () => {
    const result = parseDate("2025-06-15");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(5); // zero-indexed
    expect(result!.getDate()).toBe(15);
  });

  it("parses a date with time suffix", () => {
    const result = parseDate("2025-06-15T10:30:00");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getDate()).toBe(15);
  });

  it("returns null for non-string values", () => {
    expect(parseDate(42)).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate(true)).toBeNull();
  });

  it("returns null for invalid date strings", () => {
    expect(parseDate("not-a-date")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("formatDateStr", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(formatDateStr(new Date(2025, 0, 5))).toBe("2025-01-05");
    expect(formatDateStr(new Date(2025, 11, 31))).toBe("2025-12-31");
  });
});

describe("daysBetween", () => {
  it("returns positive number for later end date", () => {
    expect(daysBetween(new Date(2025, 0, 1), new Date(2025, 0, 11))).toBe(10);
  });

  it("returns zero for same date", () => {
    expect(daysBetween(new Date(2025, 5, 1), new Date(2025, 5, 1))).toBe(0);
  });

  it("returns negative for earlier end date", () => {
    expect(daysBetween(new Date(2025, 0, 11), new Date(2025, 0, 1))).toBe(-10);
  });
});

describe("filterRecordsWithDates", () => {
  it("keeps records with a start date", () => {
    const records = [
      makeRecord("a", { start: "2025-01-01", end: "2025-01-10" }),
      makeRecord("b", { start: "no-date", end: "" }),
      makeRecord("c", { start: "2025-03-01" }),
    ];
    const result = filterRecordsWithDates(records, "start", "end");
    expect(result.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("keeps records with only an end date", () => {
    const records = [makeRecord("a", { end: "2025-06-01" })];
    const result = filterRecordsWithDates(records, "start", "end");
    expect(result).toHaveLength(1);
  });

  it("returns empty array when no records have dates", () => {
    const records = [makeRecord("a", { start: "nope" })];
    const result = filterRecordsWithDates(records, "start", "end");
    expect(result).toHaveLength(0);
  });
});

describe("getDateRange", () => {
  it("returns min/max across records", () => {
    const records = [
      makeRecord("a", { start: "2025-01-15", end: "2025-02-10" }),
      makeRecord("b", { start: "2025-01-01", end: "2025-03-01" }),
    ];
    const range = getDateRange(records, "start", "end");
    expect(range).not.toBeNull();
    expect(formatDateStr(range!.min)).toBe("2025-01-01");
    expect(formatDateStr(range!.max)).toBe("2025-03-01");
  });

  it("returns null when no records have dates", () => {
    const records = [makeRecord("a", {})];
    expect(getDateRange(records, "start", "end")).toBeNull();
  });
});

describe("getDataDrivenRange", () => {
  it("extends beyond record dates with padding for week zoom", () => {
    const records = [
      makeRecord("a", { start: "2025-03-01", end: "2025-03-15" }),
    ];
    const { start, end } = getDataDrivenRange(records, "start", "end", "week");
    expect(start < new Date(2025, 2, 1)).toBe(true);  /* before Mar 1 */
    expect(end > new Date(2025, 2, 15)).toBe(true);    /* after Mar 15 */
  });

  it("adds 3-month padding for month zoom", () => {
    const records = [
      makeRecord("a", { start: "2025-06-01", end: "2025-06-30" }),
    ];
    const { start, end } = getDataDrivenRange(records, "start", "end", "month");
    expect(start.getMonth()).toBeLessThanOrEqual(2); /* Mar or earlier */
    expect(end.getMonth()).toBeGreaterThanOrEqual(8); /* Sep or later */
  });

  it("falls back to today range when no records have dates", () => {
    const records = [makeRecord("a", {})];
    const { start, end } = getDataDrivenRange(records, "start", "end", "month");
    expect(start < end).toBe(true);
  });
});

describe("dateToPosition", () => {
  it("maps start of range to 0", () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 0, 31);
    expect(dateToPosition(start, start, end, 1000)).toBe(0);
  });

  it("maps end of range to container width", () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 0, 31);
    expect(dateToPosition(end, start, end, 1000)).toBe(1000);
  });

  it("maps midpoint proportionally", () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 0, 11);
    const mid = new Date(2025, 0, 6);
    const pos = dateToPosition(mid, start, end, 1000);
    expect(pos).toBe(500);
  });
});

describe("getBarDimensions", () => {
  const rangeStart = new Date(2025, 0, 1);
  const rangeEnd = new Date(2025, 0, 31);
  const width = 900;

  it("returns bar with left and width for date range", () => {
    const record = makeRecord("a", { start: "2025-01-05", end: "2025-01-15" });
    const dims = getBarDimensions(record, "start", "end", rangeStart, rangeEnd, width);
    expect(dims).not.toBeNull();
    expect(dims!.isDot).toBe(false);
    expect(dims!.left).toBeGreaterThan(0);
    expect(dims!.width).toBeGreaterThan(0);
  });

  it("returns dot for single-date record", () => {
    const record = makeRecord("a", { start: "2025-01-10" });
    const dims = getBarDimensions(record, "start", "end", rangeStart, rangeEnd, width);
    expect(dims).not.toBeNull();
    expect(dims!.isDot).toBe(true);
  });

  it("returns dot when start equals end", () => {
    const record = makeRecord("a", { start: "2025-01-10", end: "2025-01-10" });
    const dims = getBarDimensions(record, "start", "end", rangeStart, rangeEnd, width);
    expect(dims!.isDot).toBe(true);
  });

  it("returns null when record has no dates", () => {
    const record = makeRecord("a", {});
    const dims = getBarDimensions(record, "start", "end", rangeStart, rangeEnd, width);
    expect(dims).toBeNull();
  });

  it("clamps bar to visible range when dates extend beyond", () => {
    const record = makeRecord("a", { start: "2024-12-01", end: "2025-02-15" });
    const dims = getBarDimensions(record, "start", "end", rangeStart, rangeEnd, width);
    expect(dims!.left).toBe(0); // clamped to range start
    expect(dims!.width).toBe(width); // spans full visible width
  });
});

describe("getHeaderColumns", () => {
  it("returns columns for week zoom (daily)", () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 0, 8);
    const cols = getHeaderColumns(start, end, "week");
    expect(cols.length).toBeGreaterThanOrEqual(7);
    expect(cols[0].label).toContain("Jan");
  });

  it("returns columns for quarter zoom with FY labels and month ranges", () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 11, 31);
    const cols = getHeaderColumns(start, end, "quarter");
    expect(cols.length).toBeGreaterThanOrEqual(3);
    expect(cols[0].label).toContain("FY25");
    expect(cols[0].label).toContain("Q1");
    expect(cols[0].label).toContain("Jan-Mar");
  });
});

describe("getColumnWidth", () => {
  it("returns expected widths for each zoom level", () => {
    expect(getColumnWidth("week")).toBe(80);
    expect(getColumnWidth("month")).toBe(140);
    expect(getColumnWidth("quarter")).toBe(300);
    expect(getColumnWidth("year")).toBe(100);
  });
});
