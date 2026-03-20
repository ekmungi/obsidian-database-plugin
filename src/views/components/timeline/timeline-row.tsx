/** Single row in the timeline — left panel info + positioned bar/dot. */

import { h } from "preact";
import { useCallback, useMemo } from "preact/hooks";
import type { DatabaseRecord } from "../../../types/record";
import type { ColumnDefinition } from "../../../types/schema";
import type { CellValue } from "../../../types/record";
import type { BarDimensions } from "./timeline-utils";
import { parseDate, formatDateStr, positionToDate } from "./timeline-utils";
import { TimelineBar } from "./timeline-bar";

/** Saturated pastel background colors keyed by select option ColorKey. */
const BAR_COLORS: Readonly<Record<string, { bg: string; text: string }>> = {
  gray:   { bg: "#A8B4C8", text: "#2E3540" },
  red:    { bg: "#E09898", text: "#6B2C2C" },
  orange: { bg: "#E0A880", text: "#6B3420" },
  yellow: { bg: "#E0C470", text: "#6B4A0E" },
  green:  { bg: "#90C890", text: "#2E5230" },
  teal:   { bg: "#80C8C8", text: "#1C4E4E" },
  blue:   { bg: "#90A8D8", text: "#3B4470" },
  purple: { bg: "#B898D8", text: "#4A2E7A" },
  pink:   { bg: "#D890B8", text: "#5A2E4E" },
  brown:  { bg: "#B8C488", text: "#3D4422" },
};

/** Default bar color — light grey (#D3D3D3) when no colorBy match is found. */
const DEFAULT_BAR = { bg: "#D3D3D3", text: "#333333" };

/** Props for the TimelineRow component. */
export interface TimelineRowProps {
  readonly record: DatabaseRecord;
  readonly startDateField: string;
  readonly endDateField: string;
  readonly barDimensions: BarDimensions;
  readonly barColor: { bg: string; text: string };
  readonly gridWidth: number;
  readonly rangeStart: Date;
  readonly rangeEnd: Date;
  readonly onOpenNote: (record: DatabaseRecord) => void;
  readonly onCellChange: (recordId: string, field: string, value: CellValue) => void;
}

/**
 * Build a human-readable tooltip string showing record name and date range.
 */
function buildTooltip(
  name: string,
  record: DatabaseRecord,
  startField: string,
  endField: string,
): string {
  const s = parseDate(record.values[startField]);
  const e = parseDate(record.values[endField]);
  const parts = [name];
  if (s) parts.push(`Start: ${formatDateStr(s)}`);
  if (e) parts.push(`End: ${formatDateStr(e)}`);
  return parts.join("\n");
}

/**
 * Resolve the bar color for a record based on the colorBy column.
 */
export function resolveBarColor(
  record: DatabaseRecord,
  colorByColumn?: ColumnDefinition,
): { bg: string; text: string } {
  if (!colorByColumn?.options) return DEFAULT_BAR;
  const cellValue = record.values[colorByColumn.id];
  const valueStr = typeof cellValue === "string" ? cellValue : null;
  if (!valueStr) return DEFAULT_BAR;
  const match = colorByColumn.options.find((opt) => opt.value === valueStr);
  return match ? (BAR_COLORS[match.color] ?? DEFAULT_BAR) : DEFAULT_BAR;
}

/**
 * TimelineRow renders one record as a left-panel label + a positioned bar in the grid.
 * Supports drag-to-resize on bar edges to update start/end dates.
 */
export function TimelineRow({
  record, startDateField, endDateField, barDimensions,
  barColor, gridWidth, rangeStart, rangeEnd, onOpenNote, onCellChange,
}: TimelineRowProps): h.JSX.Element {
  const handleOpenNote = useCallback(() => {
    onOpenNote(record);
  }, [onOpenNote, record]);

  const tooltip = useMemo(
    () => buildTooltip(record.name, record, startDateField, endDateField),
    [record, startDateField, endDateField],
  );

  /** Handle resize: convert pixel delta to a new date and write to frontmatter. */
  const handleResize = useCallback((edge: "left" | "right", deltaPx: number) => {
    if (barDimensions.isDot) return;

    const currentLeft = barDimensions.left;
    const currentRight = barDimensions.left + barDimensions.width;

    if (edge === "left") {
      const newLeftPx = currentLeft + deltaPx;
      const newDate = positionToDate(newLeftPx, rangeStart, rangeEnd, gridWidth);
      onCellChange(record.id, startDateField, formatDateStr(newDate));
    } else {
      const newRightPx = currentRight + deltaPx;
      const newDate = positionToDate(newRightPx, rangeStart, rangeEnd, gridWidth);
      onCellChange(record.id, endDateField, formatDateStr(newDate));
    }
  }, [barDimensions, rangeStart, rangeEnd, gridWidth, record.id, startDateField, endDateField, onCellChange]);

  /** Handle move: shift both start and end dates by the same pixel delta. */
  const handleMove = useCallback((deltaPx: number) => {
    if (barDimensions.isDot) return;

    const newStartPx = barDimensions.left + deltaPx;
    const newEndPx = barDimensions.left + barDimensions.width + deltaPx;
    const newStart = positionToDate(newStartPx, rangeStart, rangeEnd, gridWidth);
    const newEnd = positionToDate(newEndPx, rangeStart, rangeEnd, gridWidth);
    onCellChange(record.id, startDateField, formatDateStr(newStart));
    onCellChange(record.id, endDateField, formatDateStr(newEnd));
  }, [barDimensions, rangeStart, rangeEnd, gridWidth, record.id, startDateField, endDateField, onCellChange]);

  /** Preview projected dates for a given drag delta — used by the live tooltip. */
  const getDatePreview = useCallback((action: "move" | "resize-left" | "resize-right", deltaPx: number) => {
    const curStart = parseDate(record.values[startDateField]);
    const curEnd = parseDate(record.values[endDateField]);
    let newStart = curStart ? formatDateStr(curStart) : "—";
    let newEnd = curEnd ? formatDateStr(curEnd) : "—";

    if (action === "move") {
      const s = positionToDate(barDimensions.left + deltaPx, rangeStart, rangeEnd, gridWidth);
      const e = positionToDate(barDimensions.left + barDimensions.width + deltaPx, rangeStart, rangeEnd, gridWidth);
      newStart = formatDateStr(s);
      newEnd = formatDateStr(e);
    } else if (action === "resize-left") {
      const s = positionToDate(barDimensions.left + deltaPx, rangeStart, rangeEnd, gridWidth);
      newStart = formatDateStr(s);
    } else {
      const e = positionToDate(barDimensions.left + barDimensions.width + deltaPx, rangeStart, rangeEnd, gridWidth);
      newEnd = formatDateStr(e);
    }

    return { start: newStart, end: newEnd };
  }, [record, startDateField, endDateField, barDimensions, rangeStart, rangeEnd, gridWidth]);

  return (
    <div class="timeline-row">
      <div class="timeline-left-row" onClick={handleOpenNote} title={record.name}>
        <span class="timeline-left-row__name">{record.name}</span>
      </div>
      <div class="timeline-row__grid" style={{ width: `${gridWidth}px` }}>
        <TimelineBar
          left={barDimensions.left}
          width={barDimensions.width}
          isDot={barDimensions.isDot}
          bgColor={barColor.bg}
          textColor={barColor.text}
          label={record.name}
          tooltip={tooltip}
          onClick={handleOpenNote}
          onResize={barDimensions.isDot ? undefined : handleResize}
          onMove={barDimensions.isDot ? undefined : handleMove}
          getDatePreview={barDimensions.isDot ? undefined : getDatePreview}
        />
      </div>
    </div>
  );
}
