/** Timeline header — date labels and today marker across the top of the grid. */

import { h } from "preact";
import { useMemo } from "preact/hooks";
import type { ZoomLevel } from "./timeline-utils";
import { getHeaderColumns, getColumnWidth, dateToPosition, formatDateStr } from "./timeline-utils";

/** Props for the TimelineHeader component. */
export interface TimelineHeaderProps {
  /** Start of the visible date range. */
  readonly rangeStart: Date;
  /** End of the visible date range. */
  readonly rangeEnd: Date;
  /** Current zoom level. */
  readonly zoom: ZoomLevel;
  /** Total pixel width of the scrollable grid area. */
  readonly gridWidth: number;
}

/**
 * TimelineHeader renders the date column labels and a "today" marker line.
 * Syncs horizontally with the row grid via shared parent scroll.
 */
export function TimelineHeader({
  rangeStart, rangeEnd, zoom, gridWidth,
}: TimelineHeaderProps): h.JSX.Element {
  const columns = useMemo(
    () => getHeaderColumns(rangeStart, rangeEnd, zoom),
    [rangeStart, rangeEnd, zoom],
  );

  const colWidth = getColumnWidth(zoom);

  /* Today marker position — only render if today is within the visible range. */
  const today = useMemo(() => new Date(), []);
  const todayStr = formatDateStr(today);
  const rangeStartStr = formatDateStr(rangeStart);
  const rangeEndStr = formatDateStr(rangeEnd);
  const showToday = todayStr >= rangeStartStr && todayStr <= rangeEndStr;
  const todayLeft = showToday
    ? dateToPosition(today, rangeStart, rangeEnd, gridWidth)
    : -1;

  return (
    <div class="timeline-header" style={{ width: `${gridWidth}px` }}>
      <div class="timeline-header__cells">
        {columns.map((col, i) => (
          <div
            key={i}
            class="timeline-header-cell"
            style={{ width: `${colWidth}px` }}
            title={formatDateStr(col.date)}
          >
            {col.label}
          </div>
        ))}
      </div>
      {showToday && (
        <div
          class="timeline-today-marker"
          style={{ left: `${todayLeft}px` }}
          title="Today"
        />
      )}
    </div>
  );
}
