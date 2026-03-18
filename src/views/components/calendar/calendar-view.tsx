/** Main calendar component — monthly grid view over database records. */

import { h } from "preact";
import { useState, useCallback, useMemo } from "preact/hooks";
import type { DatabaseSchema, ColumnDefinition } from "../../../types/schema";
import type { DatabaseRecord, CellValue } from "../../../types/record";
import { CalendarNav } from "./calendar-nav";
import { CalendarDay } from "./calendar-day";

/** Day-of-week header labels starting from Monday. */
const DAY_HEADERS: readonly string[] = [
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
];

/** Props for the CalendarView component. */
export interface CalendarViewProps {
  /** The database schema (columns, views, etc.). */
  readonly schema: DatabaseSchema;
  /** All records in the database. */
  readonly records: readonly DatabaseRecord[];
  /** Column ID of the date field used to place records on the calendar. */
  readonly dateField: string;
  /** Optional column ID whose select options determine event pill colors. */
  readonly colorBy?: string;
  /** Callback when a cell value changes (e.g., after drag-and-drop reschedule). */
  readonly onCellChange: (recordId: string, field: string, value: CellValue) => void;
  /** Callback to open a record's source note. */
  readonly onOpenNote: (record: DatabaseRecord) => void;
}

/**
 * Get the first day of a given month.
 * @param date - Any date within the target month.
 * @returns A new Date set to the 1st of that month.
 */
function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Build the array of dates to display in the calendar grid.
 * Pads the start to Monday and the end to fill the last week (Sunday).
 * @param month - The first day of the target month.
 * @returns Array of Date objects covering the full grid.
 */
function buildCalendarDays(month: Date): readonly Date[] {
  const year = month.getFullYear();
  const m = month.getMonth();

  /* Day-of-week for the 1st: convert Sunday=0 to Monday-based index. */
  const firstDow = month.getDay();
  const padStart = (firstDow === 0 ? 6 : firstDow - 1);

  /* Last day of the month. */
  const lastDay = new Date(year, m + 1, 0).getDate();

  /* Total cells: pad start + month days, rounded up to full weeks. */
  const totalDays = padStart + lastDay;
  const rows = Math.ceil(totalDays / 7);
  const totalCells = rows * 7;

  const days: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    days.push(new Date(year, m, 1 - padStart + i));
  }
  return days;
}

/**
 * Format a Date as YYYY-MM-DD string.
 * @param date - The date to format.
 * @returns ISO date string (date portion only).
 */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/**
 * Parse a cell value into a YYYY-MM-DD key, or return null if invalid.
 * @param value - The raw cell value from frontmatter.
 * @returns Date key string or null.
 */
function parseDateKey(value: CellValue): string | null {
  if (typeof value !== "string") return null;
  /* Accept YYYY-MM-DD (possibly with time suffix). */
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Group records by their date field value into a Map keyed by YYYY-MM-DD.
 * @param records - All database records.
 * @param dateField - The column ID of the date field.
 * @returns Map from date key to array of records on that day.
 */
function groupByDate(
  records: readonly DatabaseRecord[],
  dateField: string,
): ReadonlyMap<string, readonly DatabaseRecord[]> {
  const map = new Map<string, DatabaseRecord[]>();
  for (const record of records) {
    const key = parseDateKey(record.values[dateField]);
    if (key) {
      const existing = map.get(key);
      if (existing) {
        existing.push(record);
      } else {
        map.set(key, [record]);
      }
    }
  }
  return map;
}

/**
 * Check whether two dates represent the same calendar day.
 * @param a - First date.
 * @param b - Second date.
 * @returns True if year, month, and day match.
 */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * CalendarView renders a full monthly grid with navigation, day headers, and day cells.
 * Supports drag-and-drop rescheduling of events between days.
 * @param props - Schema, records, field config, and interaction callbacks.
 * @returns Preact VNode for the calendar view.
 */
export function CalendarView(props: CalendarViewProps) {
  const { schema, records, dateField, colorBy, onCellChange, onOpenNote } = props;

  const [currentMonth, setCurrentMonth] = useState<Date>(() => firstOfMonth(new Date()));

  const today = useMemo(() => new Date(), []);

  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);

  const eventsByDate = useMemo(() => groupByDate(records, dateField), [records, dateField]);

  const colorByColumn: ColumnDefinition | undefined = useMemo(
    () => (colorBy ? schema.columns.find((c) => c.id === colorBy) : undefined),
    [colorBy, schema.columns],
  );

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const handleToday = useCallback(() => {
    setCurrentMonth(firstOfMonth(new Date()));
  }, []);

  /** When a record is dropped on a new day, update its date field. */
  const handleDrop = useCallback(
    (recordId: string, newDate: string) => {
      onCellChange(recordId, dateField, newDate);
    },
    [onCellChange, dateField],
  );

  const displayMonth = currentMonth.getMonth();

  return (
    <div class="calendar-view">
      <CalendarNav
        currentMonth={currentMonth}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
      />

      <div class="calendar-grid">
        {DAY_HEADERS.map((label) => (
          <div key={label} class="calendar-day-header">
            {label}
          </div>
        ))}

        {calendarDays.map((day) => {
          const key = toDateKey(day);
          return (
            <CalendarDay
              key={key}
              date={day}
              isCurrentMonth={day.getMonth() === displayMonth}
              isToday={isSameDay(day, today)}
              events={eventsByDate.get(key) ?? []}
              colorByColumn={colorByColumn}
              onOpenNote={onOpenNote}
              onDrop={handleDrop}
            />
          );
        })}
      </div>
    </div>
  );
}
