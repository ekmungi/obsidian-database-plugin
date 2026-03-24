/** Timeline header — two-tier date labels (year / columns) and today marker. */

import { h } from "preact";
import { useMemo } from "preact/hooks";
import type { ZoomLevel } from "./timeline-utils";
import { getHeaderColumns, getTopTierGroups, getColumnWidth, dateToPosition, formatDateStr } from "./timeline-utils";

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
 * TimelineHeader renders a two-tier header:
 * - Top tier: year labels spanning multiple columns
 * - Bottom tier: zoom-specific column labels (week ranges, months, quarters)
 * Also renders a "today" marker line.
 */
export function TimelineHeader({
  rangeStart, rangeEnd, zoom, gridWidth,
}: TimelineHeaderProps): h.JSX.Element {
  const columns = useMemo(
    () => getHeaderColumns(rangeStart, rangeEnd, zoom),
    [rangeStart, rangeEnd, zoom],
  );

  const topGroups = useMemo(
    () => getTopTierGroups(columns),
    [columns],
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
      {/* Top tier — year labels */}
      <div class="timeline-header__top-tier">
        {topGroups.map((group, i) => (
          <div
            key={i}
            class="timeline-header-cell timeline-header-cell--top"
            style={{ width: `${group.span * colWidth}px` }}
          >
            {group.label}
          </div>
        ))}
      </div>
      {/* Bottom tier — zoom-specific column labels */}
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
