/** Tests for the TimelineView component — rendering, filtering, grouping. */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { h } from "preact";
import { render, screen } from "@testing-library/preact";
import { TimelineView } from "../timeline-view";

/** Stub ResizeObserver for jsdom test environment. */
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
import type { DatabaseSchema } from "../../../../types/schema";
import type { DatabaseRecord } from "../../../../types/record";
import type { TFile } from "obsidian";

/** Minimal schema with date columns for timeline testing. */
const testSchema: DatabaseSchema = {
  name: "Test DB",
  source: "test/",
  columns: [
    { id: "name", type: "text", label: "Name" },
    { id: "start", type: "date", label: "Start" },
    { id: "end", type: "date", label: "End" },
    { id: "status", type: "select", label: "Status", options: [
      { value: "Active", color: "green" },
      { value: "Done", color: "gray" },
    ]},
  ],
  views: [],
};

/** Helper to create a test record. */
function makeRecord(id: string, name: string, values: Record<string, unknown>): DatabaseRecord {
  return {
    id,
    name,
    file: { path: id } as TFile,
    values: { name, ...values } as Record<string, unknown>,
    mtime: Date.now(),
  };
}

const baseProps = {
  schema: testSchema,
  startDateField: "start",
  endDateField: "end",
  onCellChange: vi.fn(),
  onOpenNote: vi.fn(),
};

describe("TimelineView", () => {
  it("renders the timeline container and navigation", () => {
    const records = [
      makeRecord("a", "Task A", { start: "2025-06-01", end: "2025-06-10" }),
    ];
    const { container } = render(h(TimelineView, { ...baseProps, records }));
    expect(container.querySelector(".timeline-view")).toBeTruthy();
    expect(container.querySelector(".timeline-nav")).toBeTruthy();
  });

  it("shows empty state when no records have dates", () => {
    const records = [
      makeRecord("a", "No Dates", {}),
    ];
    const { container } = render(h(TimelineView, { ...baseProps, records }));
    expect(container.querySelector(".database-empty-state")).toBeTruthy();
  });

  it("renders rows for records with dates", () => {
    const records = [
      makeRecord("a", "Task A", { start: "2025-06-01", end: "2025-06-10" }),
      makeRecord("b", "Task B", { start: "2025-06-05", end: "2025-06-15" }),
    ];
    const { container } = render(h(TimelineView, { ...baseProps, records }));
    const rows = container.querySelectorAll(".timeline-row");
    expect(rows.length).toBe(2);
  });

  it("hides records without dates", () => {
    const records = [
      makeRecord("a", "Has Dates", { start: "2025-06-01", end: "2025-06-10" }),
      makeRecord("b", "No Dates", {}),
    ];
    const { container } = render(h(TimelineView, { ...baseProps, records }));
    const rows = container.querySelectorAll(".timeline-row");
    expect(rows.length).toBe(1);
  });

  it("renders group headers when groupBy is set", () => {
    const records = [
      makeRecord("a", "Task A", { start: "2025-06-01", end: "2025-06-10", status: "Active" }),
      makeRecord("b", "Task B", { start: "2025-06-05", end: "2025-06-15", status: "Done" }),
    ];
    const { container } = render(
      h(TimelineView, { ...baseProps, records, groupBy: "status" }),
    );
    const groupHeaders = container.querySelectorAll(".timeline-group-header");
    expect(groupHeaders.length).toBe(2);
  });

  it("renders dot bars for single-date records", () => {
    const records = [
      makeRecord("a", "Milestone", { start: "2025-06-15" }),
    ];
    const { container } = render(h(TimelineView, { ...baseProps, records }));
    /* The bar should be present — it will be a dot variant. */
    const bars = container.querySelectorAll(".timeline-bar");
    expect(bars.length).toBe(1);
  });

  it("renders zoom selector with all options", () => {
    const records = [
      makeRecord("a", "Task", { start: "2025-06-01", end: "2025-06-10" }),
    ];
    const { container } = render(h(TimelineView, { ...baseProps, records }));
    const select = container.querySelector(".timeline-nav__zoom") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.options.length).toBe(4);
  });
});
