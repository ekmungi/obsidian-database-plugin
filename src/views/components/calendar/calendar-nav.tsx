/** Month navigation header for the calendar view. */

import { h } from "preact";
import { useMemo } from "preact/hooks";

/** Props for the CalendarNav component. */
export interface CalendarNavProps {
  /** First day of the currently displayed month. */
  readonly currentMonth: Date;
  /** Navigate to the previous month. */
  readonly onPrevMonth: () => void;
  /** Navigate to the next month. */
  readonly onNextMonth: () => void;
  /** Jump to the current month. */
  readonly onToday: () => void;
}

/** Months of the year for display formatting. */
const MONTH_NAMES: readonly string[] = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Format a date as "Month Year" (e.g., "March 2026").
 * @param date - The date to format.
 * @returns Formatted month-year string.
 */
function formatMonthYear(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * CalendarNav renders the month navigation bar with prev/next arrows and a Today button.
 * @param props - Navigation callbacks and current month.
 * @returns Preact VNode for the navigation header.
 */
export function CalendarNav(props: CalendarNavProps) {
  const { currentMonth, onPrevMonth, onNextMonth, onToday } = props;

  const title = useMemo(() => formatMonthYear(currentMonth), [currentMonth]);

  return (
    <div class="calendar-nav">
      <button
        class="clickable-icon"
        aria-label="Previous month"
        onClick={onPrevMonth}
      >
        &#8249;
      </button>

      <span class="calendar-nav-title">{title}</span>

      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        <button
          class="clickable-icon"
          aria-label="Today"
          onClick={onToday}
          style={{ fontSize: "var(--font-ui-medium)" }}
        >
          Today
        </button>
        <button
          class="clickable-icon"
          aria-label="Next month"
          onClick={onNextMonth}
        >
          &#8250;
        </button>
      </div>
    </div>
  );
}
