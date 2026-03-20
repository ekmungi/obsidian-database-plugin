/** Pure utility functions for timeline date math and layout calculations. */

import type { DatabaseRecord } from "../../../types/record";
import type { CellValue } from "../../../types/record";

/** Zoom level determines column granularity and label format. */
export type ZoomLevel = "week" | "month" | "quarter" | "year";

/** Bar layout dimensions returned by getBarDimensions. */
export interface BarDimensions {
  /** Left offset in pixels from the timeline start. */
  readonly left: number;
  /** Width in pixels (0 for dot markers). */
  readonly width: number;
  /** True when the record has only a start date (rendered as a dot). */
  readonly isDot: boolean;
}

/** Month abbreviations for label formatting. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Quarter month ranges for label display. */
const QUARTER_MONTHS: readonly string[] = ["Jan-Mar", "Apr-Jun", "Jul-Sep", "Oct-Dec"];

/**
 * Parse a cell value into a Date, or return null if invalid.
 * Accepts YYYY-MM-DD strings (with optional time suffix).
 */
export function parseDate(value: CellValue): Date | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a Date as YYYY-MM-DD for display and comparison.
 */
export function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Calculate the number of days between two dates (end - start).
 */
export function daysBetween(start: Date, end: Date): number {
  const msPerDay = 86_400_000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

/**
 * Filter records to only those with at least one valid date field.
 */
export function filterRecordsWithDates(
  records: readonly DatabaseRecord[],
  startField: string,
  endField: string,
): readonly DatabaseRecord[] {
  return records.filter((r) => {
    const start = parseDate(r.values[startField]);
    if (start) return true;
    const end = parseDate(r.values[endField]);
    return end !== null;
  });
}

/**
 * Find the min/max date range across all records.
 * Returns null if no records have valid dates.
 */
export function getDateRange(
  records: readonly DatabaseRecord[],
  startField: string,
  endField: string,
): { min: Date; max: Date } | null {
  let min: Date | null = null;
  let max: Date | null = null;

  for (const r of records) {
    const s = parseDate(r.values[startField]);
    const e = parseDate(r.values[endField]);
    const earliest = s ?? e;
    const latest = e ?? s;
    if (earliest && (!min || earliest < min)) min = earliest;
    if (latest && (!max || latest > max)) max = latest;
  }

  return min && max ? { min, max } : null;
}

/**
 * Compute the full scrollable date range from actual record data + padding.
 * Padding varies by zoom level to give comfortable scrolling room.
 * - Week: +4 weeks before/after
 * - Month: +3 months before/after
 * - Quarter: +1 quarter (3 months) before/after
 * - Year: +3 months before/after
 * Falls back to a default range around today if no records have dates.
 */
export function getDataDrivenRange(
  records: readonly DatabaseRecord[],
  startField: string,
  endField: string,
  zoom: ZoomLevel,
): { start: Date; end: Date } {
  const dataRange = getDateRange(records, startField, endField);
  const today = new Date();
  const baseMin = dataRange ? dataRange.min : today;
  const baseMax = dataRange ? dataRange.max : today;

  const start = new Date(baseMin);
  const end = new Date(baseMax);

  switch (zoom) {
    case "week":
      start.setDate(start.getDate() - 28);   /* 4 weeks before */
      end.setDate(end.getDate() + 28);       /* 4 weeks after */
      break;
    case "month":
      start.setMonth(start.getMonth() - 3);  /* 3 months before */
      end.setMonth(end.getMonth() + 3);      /* 3 months after */
      break;
    case "quarter":
      /* Snap to quarter boundaries then add 1 quarter padding. */
      start.setMonth(Math.floor(start.getMonth() / 3) * 3);
      start.setDate(1);
      start.setMonth(start.getMonth() - 3);  /* 1 quarter before */
      end.setMonth(Math.floor(end.getMonth() / 3) * 3 + 3);
      end.setDate(0); /* last day of the quarter */
      end.setMonth(end.getMonth() + 4);      /* 1 quarter after */
      end.setDate(0);
      break;
    case "year":
      start.setMonth(start.getMonth() - 3);  /* 3 months before */
      end.setMonth(end.getMonth() + 3);      /* 3 months after */
      break;
  }

  return { start, end };
}

/**
 * Convert a date to a pixel X position within the container.
 */
export function dateToPosition(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date,
  containerWidth: number,
): number {
  const totalDays = daysBetween(rangeStart, rangeEnd);
  if (totalDays <= 0) return 0;
  const dayOffset = daysBetween(rangeStart, date);
  return (dayOffset / totalDays) * containerWidth;
}

/**
 * Calculate bar dimensions for a single record.
 * Returns left/width for range bars, or left + isDot for single-date records.
 */
export function getBarDimensions(
  record: DatabaseRecord,
  startField: string,
  endField: string,
  rangeStart: Date,
  rangeEnd: Date,
  containerWidth: number,
): BarDimensions | null {
  const startDate = parseDate(record.values[startField]);
  const endDate = parseDate(record.values[endField]);
  const effectiveStart = startDate ?? endDate;

  if (!effectiveStart) return null;

  if (!startDate || !endDate || formatDateStr(startDate) === formatDateStr(endDate)) {
    const left = dateToPosition(effectiveStart, rangeStart, rangeEnd, containerWidth);
    return { left, width: 0, isDot: true };
  }

  const barStart = startDate < rangeStart ? rangeStart : startDate;
  const barEnd = endDate > rangeEnd ? rangeEnd : endDate;
  const left = dateToPosition(barStart, rangeStart, rangeEnd, containerWidth);
  const right = dateToPosition(barEnd, rangeStart, rangeEnd, containerWidth);
  const width = Math.max(right - left, 6);
  return { left, width, isDot: false };
}

/**
 * Generate column header dates for the visible range at the given zoom level.
 */
export function getHeaderColumns(
  rangeStart: Date,
  rangeEnd: Date,
  zoom: ZoomLevel,
): readonly { date: Date; label: string }[] {
  const columns: { date: Date; label: string }[] = [];
  const current = alignToColumnBoundary(new Date(rangeStart), zoom);

  while (current <= rangeEnd) {
    columns.push({ date: new Date(current), label: formatColumnLabel(current, zoom) });
    advanceByZoom(current, zoom);
  }

  return columns;
}

/**
 * Align a date to the nearest column boundary for the zoom level.
 * Ensures columns start at clean boundaries (e.g., start of quarter, start of month).
 */
function alignToColumnBoundary(date: Date, zoom: ZoomLevel): Date {
  switch (zoom) {
    case "week":
      return date; /* daily — no alignment needed */
    case "month": {
      /* Align to Sunday. */
      const d = new Date(date);
      d.setDate(d.getDate() - d.getDay());
      return d;
    }
    case "quarter": {
      /* Align to start of quarter. */
      const d = new Date(date);
      d.setMonth(Math.floor(d.getMonth() / 3) * 3);
      d.setDate(1);
      return d;
    }
    case "year": {
      /* Align to start of month. */
      const d = new Date(date);
      d.setDate(1);
      return d;
    }
  }
}

/**
 * Get the fiscal quarter (1-4) for a given month (0-11).
 */
function getFiscalQuarter(month: number): number {
  return Math.floor(month / 3) + 1;
}

/**
 * Get the fiscal year label (e.g. FY26 for 2026).
 */
function getFiscalYearLabel(year: number): string {
  return `FY${String(year).slice(2)}`;
}

/**
 * Find the Sunday that starts the week containing the given date.
 */
function weekStartSunday(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/**
 * Find the Saturday that ends the week containing the given date.
 */
function weekEndSaturday(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + (6 - d.getDay()));
  return d;
}

/**
 * Format a date label appropriate for the zoom level.
 * - Week: "Mar 15"
 * - Month: "Mar 15 - 21" (Sun-Sat week range)
 * - Quarter: "FY26 Q1 (Jan-Mar)"
 * - Year: "Jan 2026"
 */
function formatColumnLabel(date: Date, zoom: ZoomLevel): string {
  switch (zoom) {
    case "week":
      return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
    case "month": {
      const sun = weekStartSunday(date);
      const sat = weekEndSaturday(date);
      const startLabel = `${MONTHS[sun.getMonth()]} ${sun.getDate()}`;
      const endLabel = sun.getMonth() === sat.getMonth()
        ? `${sat.getDate()}`
        : `${MONTHS[sat.getMonth()]} ${sat.getDate()}`;
      return `${startLabel} - ${endLabel}`;
    }
    case "quarter": {
      const q = getFiscalQuarter(date.getMonth());
      return `${getFiscalYearLabel(date.getFullYear())} Q${q} (${QUARTER_MONTHS[q - 1]})`;
    }
    case "year":
      return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }
}

/**
 * Advance a date by one column unit for the given zoom level (mutates).
 */
function advanceByZoom(date: Date, zoom: ZoomLevel): void {
  switch (zoom) {
    case "week":
      date.setDate(date.getDate() + 1);
      break;
    case "month":
      date.setDate(date.getDate() + 7);
      break;
    case "quarter":
      date.setMonth(date.getMonth() + 3);
      break;
    case "year":
      date.setMonth(date.getMonth() + 1);
      break;
  }
}

/**
 * Convert a pixel X position back to a Date within the range.
 * Inverse of dateToPosition — used for drag-to-resize.
 */
export function positionToDate(
  px: number,
  rangeStart: Date,
  rangeEnd: Date,
  containerWidth: number,
): Date {
  const totalDays = daysBetween(rangeStart, rangeEnd);
  if (containerWidth <= 0 || totalDays <= 0) return new Date(rangeStart);
  const dayOffset = Math.round((px / containerWidth) * totalDays);
  const result = new Date(rangeStart);
  result.setDate(result.getDate() + dayOffset);
  return result;
}

/**
 * Get the pixel width per column unit for a given zoom level.
 */
export function getColumnWidth(zoom: ZoomLevel): number {
  switch (zoom) {
    case "week": return 80;
    case "month": return 140;
    case "quarter": return 300;
    case "year": return 100;
  }
}
