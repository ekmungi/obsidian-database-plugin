/** Main timeline/Gantt view — horizontal bars over a date grid with zoom and grouping. */

import { h } from "preact";
import { useState, useCallback, useMemo, useRef, useEffect } from "preact/hooks";
import type { DatabaseSchema, ColumnDefinition } from "../../../types/schema";
import type { DatabaseRecord, CellValue } from "../../../types/record";
import type { ZoomLevel } from "./timeline-utils";
import {
  filterRecordsWithDates, getDataDrivenRange, getBarDimensions,
  getHeaderColumns, getColumnWidth, dateToPosition,
} from "./timeline-utils";
import { TimelineHeader } from "./timeline-header";
import { TimelineRow, resolveBarColor } from "./timeline-row";

/** Props for the TimelineView component. */
export interface TimelineViewProps {
  readonly schema: DatabaseSchema;
  readonly records: readonly DatabaseRecord[];
  readonly startDateField: string;
  readonly endDateField: string;
  readonly colorBy?: string;
  readonly groupBy?: string;
  readonly initialZoom?: string;
  readonly onZoomChange?: (zoom: string) => void;
  readonly onCellChange: (recordId: string, field: string, value: CellValue) => void;
  readonly onOpenNote: (record: DatabaseRecord) => void;
}

/** Zoom level options for the dropdown selector. */
const ZOOM_OPTIONS: readonly { value: ZoomLevel; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

/**
 * TimelineView renders a Gantt-style horizontal bar chart.
 * Range is data-driven — computed from actual record dates + padding per zoom level.
 */
export function TimelineView({
  schema, records, startDateField, endDateField, colorBy, groupBy, initialZoom, onZoomChange, onCellChange, onOpenNote,
}: TimelineViewProps): h.JSX.Element {
  const [zoom, setZoom] = useState<ZoomLevel>((initialZoom as ZoomLevel) || "month");
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  /** Measure the scroll container so grid always fills it. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* Filter to only records with at least one valid date. */
  const datedRecords = useMemo(
    () => filterRecordsWithDates(records, startDateField, endDateField),
    [records, startDateField, endDateField],
  );

  /* Resolve the colorBy column definition. */
  const colorByColumn: ColumnDefinition | undefined = useMemo(
    () => (colorBy ? schema.columns.find((c) => c.id === colorBy) : undefined),
    [colorBy, schema.columns],
  );

  /* Data-driven range with zoom-specific padding. */
  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => getDataDrivenRange(datedRecords, startDateField, endDateField, zoom),
    [datedRecords, startDateField, endDateField, zoom],
  );

  /* Grid width = max(columns * colWidth, container width). */
  const gridWidth = useMemo(() => {
    const cols = getHeaderColumns(rangeStart, rangeEnd, zoom);
    const calculated = cols.length * getColumnWidth(zoom);
    return Math.max(calculated, containerWidth);
  }, [rangeStart, rangeEnd, zoom, containerWidth]);

  /* Group records by the groupBy column if configured. */
  const groupedRecords = useMemo(() => {
    if (!groupBy) return [{ group: null, records: datedRecords }];
    const groups = new Map<string, DatabaseRecord[]>();
    const ungrouped: DatabaseRecord[] = [];
    for (const r of datedRecords) {
      const val = r.values[groupBy];
      const key = typeof val === "string" ? val : null;
      if (key) {
        const existing = groups.get(key);
        if (existing) existing.push(r);
        else groups.set(key, [r]);
      } else {
        ungrouped.push(r);
      }
    }
    const result: { group: string | null; records: readonly DatabaseRecord[] }[] = [];
    for (const [group, recs] of groups) {
      result.push({ group, records: recs });
    }
    if (ungrouped.length > 0) {
      result.push({ group: null, records: ungrouped });
    }
    return result;
  }, [datedRecords, groupBy]);

  /** Scroll to today's position in the grid. */
  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayPos = dateToPosition(new Date(), rangeStart, rangeEnd, gridWidth);
    el.scrollLeft = Math.max(0, todayPos - el.clientWidth / 2);
  }, [rangeStart, rangeEnd, gridWidth]);

  /** Scroll left by ~40% of the viewport. */
  const handlePrev = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: -el.clientWidth * 0.4, behavior: "smooth" });
  }, []);

  /** Scroll right by ~40% of the viewport. */
  const handleNext = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: el.clientWidth * 0.4, behavior: "smooth" });
  }, []);

  const handleZoomChange = useCallback((e: Event) => {
    const newZoom = (e.target as HTMLSelectElement).value as ZoomLevel;
    setZoom(newZoom);
    onZoomChange?.(newZoom);
  }, [onZoomChange]);

  /** Toggle a group's collapsed state. */
  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  /** Auto-scroll to today on mount and when zoom changes. */
  useEffect(() => {
    /* Small delay to let the grid render its width first. */
    const timer = setTimeout(scrollToToday, 50);
    return () => clearTimeout(timer);
  }, [scrollToToday]);

  return (
    <div class="timeline-view">
      {/* Navigation bar */}
      <div class="timeline-nav">
        <div class="timeline-nav__controls">
          <button class="timeline-nav__btn" onClick={handlePrev} title="Scroll left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button class="timeline-nav__btn" onClick={scrollToToday}>Today</button>
          <button class="timeline-nav__btn" onClick={handleNext} title="Scroll right">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
        <select class="timeline-nav__zoom" value={zoom} onChange={handleZoomChange}>
          {ZOOM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Content: left panel + scrollable grid */}
      <div class="timeline-content">
        {/* Fixed left panel with record names */}
        <div class="timeline-left-panel">
          <div class="timeline-left-panel__header">Name</div>
          {groupedRecords.map(({ group, records: groupRecs }) => {
            const isCollapsed = group !== null && collapsedGroups.has(group);
            return (
              <div key={group ?? "__ungrouped"}>
                {group !== null && (
                  <div
                    class="timeline-group-header"
                    onClick={() => toggleGroup(group)}
                  >
                    <span class={`timeline-group-header__arrow ${isCollapsed ? "timeline-group-header__arrow--collapsed" : ""}`}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                    <span>{group}</span>
                    <span class="timeline-group-header__count">{groupRecs.length}</span>
                  </div>
                )}
                {!isCollapsed && groupRecs.map((record) => (
                  <div
                    key={record.id}
                    class="timeline-left-row"
                    onClick={() => onOpenNote(record)}
                    title={record.name}
                  >
                    <span class="timeline-left-row__name">{record.name}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Scrollable grid with header + rows */}
        <div class="timeline-grid-scroll" ref={scrollRef}>
          <TimelineHeader
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            zoom={zoom}
            gridWidth={gridWidth}
          />
          <div class="timeline-rows" style={{ minWidth: `${gridWidth}px` }}>
            {groupedRecords.map(({ group, records: groupRecs }) => {
              const isCollapsed = group !== null && collapsedGroups.has(group);
              return (
                <div key={group ?? "__ungrouped"}>
                  {group !== null && (
                    <div class="timeline-group-row" style={{ width: `${gridWidth}px` }} />
                  )}
                  {!isCollapsed && groupRecs.map((record) => {
                    const dims = getBarDimensions(
                      record, startDateField, endDateField,
                      rangeStart, rangeEnd, gridWidth,
                    );
                    if (!dims) return null;
                    const barColor = resolveBarColor(record, colorByColumn);
                    return (
                      <TimelineRow
                        key={record.id}
                        record={record}
                        startDateField={startDateField}
                        endDateField={endDateField}
                        barDimensions={dims}
                        barColor={barColor}
                        gridWidth={gridWidth}
                        rangeStart={rangeStart}
                        rangeEnd={rangeEnd}
                        onOpenNote={onOpenNote}
                        onCellChange={onCellChange}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Empty state when no records have dates */}
      {datedRecords.length === 0 && (
        <div class="database-empty-state">
          <p>No records have date values in the configured columns.</p>
          <p style={{ fontSize: "var(--font-ui-medium)" }}>
            Add dates to your "{startDateField}" or "{endDateField}" fields to see them here.
          </p>
        </div>
      )}
    </div>
  );
}
