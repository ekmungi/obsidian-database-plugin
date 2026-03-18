/** Single day cell in the calendar grid with drag-and-drop support. */

import { h } from "preact";
import { useCallback } from "preact/hooks";
import type { ColumnDefinition } from "../../../types/schema";
import type { DatabaseRecord } from "../../../types/record";

/** Maximum number of event pills to display before showing "+N more". */
const MAX_VISIBLE_EVENTS = 3;

/** Props for the CalendarDay component. */
export interface CalendarDayProps {
  /** The date this cell represents. */
  readonly date: Date;
  /** Whether this date belongs to the currently displayed month. */
  readonly isCurrentMonth: boolean;
  /** Whether this date is today. */
  readonly isToday: boolean;
  /** Records that fall on this date. */
  readonly events: readonly DatabaseRecord[];
  /** Column definition used to derive event pill colors. */
  readonly colorByColumn?: ColumnDefinition;
  /** Callback when a user clicks an event pill to open the note. */
  readonly onOpenNote: (record: DatabaseRecord) => void;
  /** Callback when a record is dropped on this day (reschedule). */
  readonly onDrop: (recordId: string, newDate: string) => void;
}

/**
 * Format a Date as YYYY-MM-DD for frontmatter compatibility.
 * @param date - The date to format.
 * @returns ISO date string (date portion only).
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Resolve the background color CSS class for an event pill based on the colorBy column.
 * Falls back to the "blue" select-tag style if no match is found.
 * @param record - The database record for this event.
 * @param colorByColumn - The column definition whose select options provide colors.
 * @returns CSS class string for the pill background.
 */
function resolveColorClass(
  record: DatabaseRecord,
  colorByColumn?: ColumnDefinition,
): string {
  if (!colorByColumn || !colorByColumn.options) {
    return "select-tag--blue";
  }
  const cellValue = record.values[colorByColumn.id];
  const valueStr = typeof cellValue === "string" ? cellValue : null;
  if (!valueStr) {
    return "select-tag--blue";
  }
  const match = colorByColumn.options.find((opt) => opt.value === valueStr);
  return match ? `select-tag--${match.color}` : "select-tag--blue";
}

/**
 * CalendarDay renders a single cell in the monthly calendar grid.
 * Shows event pills, supports drag-and-drop rescheduling, and truncates overflow.
 * @param props - Day metadata, events, and interaction callbacks.
 * @returns Preact VNode for one day cell.
 */
export function CalendarDay(props: CalendarDayProps) {
  const { date, isCurrentMonth, isToday, events, colorByColumn, onOpenNote, onDrop } = props;

  const dateStr = formatDateString(date);

  /** Allow drop by preventing default on dragover. */
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  /** Extract the record ID from the drag payload and invoke onDrop. */
  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const recordId = e.dataTransfer?.getData("text/plain");
      if (recordId) {
        onDrop(recordId, dateStr);
      }
    },
    [onDrop, dateStr],
  );

  const visibleEvents = events.slice(0, MAX_VISIBLE_EVENTS);
  const overflowCount = events.length - MAX_VISIBLE_EVENTS;

  const className = [
    "calendar-day",
    !isCurrentMonth && "calendar-day--other-month",
    isToday && "calendar-day--today",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      class={className}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <span class="calendar-day-number">{date.getDate()}</span>

      {visibleEvents.map((record) => (
        <EventPill
          key={record.id}
          record={record}
          colorClass={resolveColorClass(record, colorByColumn)}
          onOpenNote={onOpenNote}
        />
      ))}

      {overflowCount > 0 && (
        <span
          class="calendar-day-number"
          style={{ marginTop: "2px", cursor: "default" }}
        >
          +{overflowCount} more
        </span>
      )}
    </div>
  );
}

/** Props for the EventPill sub-component. */
interface EventPillProps {
  readonly record: DatabaseRecord;
  readonly colorClass: string;
  readonly onOpenNote: (record: DatabaseRecord) => void;
}

/**
 * EventPill renders a single draggable event inside a calendar day cell.
 * @param props - Record data, color class, and open-note callback.
 * @returns Preact VNode for one event pill.
 */
function EventPill(props: EventPillProps) {
  const { record, colorClass, onOpenNote } = props;

  /** Set the record ID as drag data so the drop target can identify it. */
  const handleDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer?.setData("text/plain", record.id);
    },
    [record.id],
  );

  const handleClick = useCallback(() => {
    onOpenNote(record);
  }, [onOpenNote, record]);

  return (
    <div
      class={`calendar-event ${colorClass}`}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      title={record.name}
    >
      {record.name}
    </div>
  );
}
