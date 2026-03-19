/** Table header — column headers with sort indicators, type icons, and resize handles. */

import { h } from "preact";
import { useCallback, useRef, useState, useEffect } from "preact/hooks";
import type { ColumnDefinition, ColumnType, SortRule } from "../../../types/schema";
import { ColumnConfigModal } from "../config/column-config-modal";

/** Props for the TableHeader component. */
interface TableHeaderProps {
  readonly columns: readonly ColumnDefinition[];
  readonly sort: readonly SortRule[];
  readonly onSort: (columnId: string, shiftKey: boolean) => void;
  readonly onAddColumn?: () => void;
  readonly onEditColumn?: (columnId: string) => void;
  /** Whether to show the select-all checkbox. */
  readonly showSelectAll?: boolean;
  /** Whether all rows are currently selected. */
  readonly allSelected?: boolean;
  /** Toggle select all. */
  readonly onToggleSelectAll?: () => void;
  /** Per-column widths from view config. */
  readonly columnWidths?: Readonly<Record<string, number>>;
  /** Called when a column is resized via drag. */
  readonly onColumnResize?: (columnId: string, width: number) => void;
  /** Column ID currently being edited — keeps its gear icon visible. */
  readonly editingColumnId?: string;
  /** All column IDs for uniqueness validation in the config dropdown. */
  readonly existingColumnIds?: readonly string[];
  /** Called when column config is saved from the inline dropdown. */
  readonly onSaveColumn?: (column: ColumnDefinition, renames?: ReadonlyMap<string, string>) => void;
  /** Called to delete a column from the inline dropdown. */
  readonly onDeleteColumn?: (columnId: string) => void;
  /** Called to delete a single option and propagate to pages. */
  readonly onDeleteOption?: (columnId: string, optionName: string) => void;
  /** All vault folder paths for relation target autocomplete. */
  readonly folderPaths?: readonly string[];
}

/** SVG calendar icon for date columns. */
function DateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ verticalAlign: "middle" }}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <rect x="8" y="13" width="3" height="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Map column types to monochrome text icons (null = use SVG component). */
const COLUMN_TYPE_ICONS: Record<ColumnType, string | null> = {
  file: "\u2261",
  text: "Aa",
  number: "#",
  date: null,
  select: "\u25CE",
  "multi-select": "\u2630",
  checkbox: "\u2610",
  relation: "\u2192",
  rollup: "\u03A3",
  formula: "fx",
};

/** Map column types to SVG icon components (for types that need them). */
const COLUMN_SVG_ICONS: Partial<Record<ColumnType, () => h.JSX.Element>> = {
  date: DateIcon,
};

/** Sort direction arrow characters. */
const SORT_ARROWS: Record<string, string> = {
  asc: " \u2191",
  desc: " \u2193",
};

/** Find the sort index (1-based priority) for a column, or -1 if unsorted. */
function getSortIndex(columnId: string, sort: readonly SortRule[]): number {
  const idx = sort.findIndex((s) => s.column === columnId);
  return idx === -1 ? -1 : idx + 1;
}

/** Find the current sort direction for a column. */
function getSortDir(columnId: string, sort: readonly SortRule[]): string | null {
  const rule = sort.find((s) => s.column === columnId);
  return rule ? rule.dir : null;
}

/** Absolute minimum column width in pixels. */
const ABS_MIN_COL_WIDTH = 80;

/** Minimum column width = full title length + icon + gear + 1 char padding. */
function getMinColWidth(label: string): number {
  const charWidth = 7.5;
  const iconWidth = 20;
  const gearWidth = 20;
  const padding = 24;
  const estimated = Math.ceil((label.length + 1) * charWidth) + iconWidth + gearWidth + padding;
  return Math.max(ABS_MIN_COL_WIDTH, estimated);
}

/** Default column widths per type — used when no explicit width is set. */
const DEFAULT_COL_WIDTHS: Partial<Record<ColumnType, number>> = {
  file: 200,
  text: 220,
  number: 120,
  date: 140,
  select: 160,
  "multi-select": 200,
  checkbox: 120,
  relation: 200,
  rollup: 140,
};

/**
 * Table header row rendering column labels, type icons, sort indicators, and resize handles.
 * @param props.columns - Column definitions to render.
 * @param props.sort - Current sort rules for displaying indicators.
 * @param props.onSort - Called with column ID when header is clicked.
 * @param props.columnWidths - Per-column widths from view config.
 * @param props.onColumnResize - Called when a column is resized via drag.
 */
export function TableHeader({
  columns, sort, onSort, onAddColumn, onEditColumn,
  showSelectAll, allSelected, onToggleSelectAll,
  columnWidths, onColumnResize, editingColumnId,
  existingColumnIds, onSaveColumn, onDeleteColumn, onDeleteOption, folderPaths,
}: TableHeaderProps) {
  /** Local dropdown state — which column's gear dropdown is open. */
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /** Close dropdown on click outside or Escape. */
  useEffect(() => {
    if (!openDropdownId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpenDropdownId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [openDropdownId]);
  /** Start a column resize drag operation. */
  const handleResizeStart = useCallback((e: MouseEvent, colId: string, minWidth: number) => {
    e.preventDefault();
    e.stopPropagation();

    const th = (e.target as HTMLElement).closest("th");
    if (!th) return;

    const startX = e.clientX;
    const startWidth = th.getBoundingClientRect().width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(minWidth, Math.round(startWidth + delta));
      th.style.width = `${newWidth}px`;
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      const finalWidth = Math.max(minWidth, Math.round(th.getBoundingClientRect().width));
      onColumnResize?.(colId, finalWidth);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [onColumnResize]);

  return (
    <thead>
      <tr>
        {showSelectAll && (
          <th style={{ width: "32px", padding: "4px", textAlign: "center", verticalAlign: "middle" }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleSelectAll}
              title="Select all"
            />
          </th>
        )}
        {columns.map((col) => {
          const sortDir = getSortDir(col.id, sort);
          const sortIdx = getSortIndex(col.id, sort);
          const textIcon = COLUMN_TYPE_ICONS[col.type];
          const SvgIcon = COLUMN_SVG_ICONS[col.type];
          const arrow = sortDir ? SORT_ARROWS[sortDir] ?? "" : "";
          const showPriority = sortIdx > 0 && sort.length > 1;
          const minWidth = getMinColWidth(col.label);
          const savedWidth = columnWidths?.[col.id] ?? DEFAULT_COL_WIDTHS[col.type];
          const width = savedWidth ? Math.max(savedWidth, minWidth) : undefined;

          return (
            <th
              key={col.id}
              style={width ? { width: `${width}px`, minWidth: `${minWidth}px` } : { minWidth: `${minWidth}px` }}
              title={`${col.label} (${col.type}) — click to sort, Shift+click for multi-sort`}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                <span
                  style={{ flex: 1, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  onClick={(e: MouseEvent) => onSort(col.id, e.shiftKey)}
                >
                  <span style={{ marginRight: "4px", opacity: 0.6 }}>
                    {SvgIcon ? <SvgIcon /> : (textIcon ?? "T")}
                  </span>
                  {col.label}
                  {arrow && (
                    <span style={{ marginLeft: "2px", fontSize: "0.85em" }}>
                      {arrow}{showPriority ? sortIdx : ""}
                    </span>
                  )}
                </span>
                {onSaveColumn && (
                  <div ref={openDropdownId === col.id ? dropdownRef : undefined} style={{ position: "relative", display: "inline-flex" }}>
                    <span
                      style={{ opacity: openDropdownId === col.id ? 1 : 0, cursor: "pointer", fontSize: "1.1em", padding: "0 3px" }}
                      class="column-edit-btn"
                      onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === col.id ? null : col.id); }}
                      title={`Edit ${col.label}`}
                    >
                      &#9881;
                    </span>
                    {openDropdownId === col.id && (
                      <div
                        class="database-column-dropdown"
                        style={{ position: "absolute", top: "100%", right: 0, zIndex: 50 }}
                      >
                        <ColumnConfigModal
                          column={col}
                          existingIds={existingColumnIds ?? []}
                          onSave={(updatedCol, renames) => { onSaveColumn(updatedCol, renames); setOpenDropdownId(null); }}
                          onDelete={col.type !== "file" && onDeleteColumn ? () => { onDeleteColumn(col.id); setOpenDropdownId(null); } : undefined}
                          onDeleteOption={onDeleteOption ? (optName) => onDeleteOption(col.id, optName) : undefined}
                          onClose={() => setOpenDropdownId(null)}
                          folderPaths={folderPaths}
                          dropdown
                        />
                      </div>
                    )}
                  </div>
                )}
                {onColumnResize && (
                  <span
                    class="column-resize-handle"
                    onMouseDown={(e) => handleResizeStart(e as unknown as MouseEvent, col.id, minWidth)}
                  />
                )}
              </div>
            </th>
          );
        })}
        {onAddColumn && (
          <th
            style={{ width: "40px", textAlign: "center", cursor: "pointer", opacity: 0.5 }}
            onClick={onAddColumn}
            title="Add column"
          >
            +
          </th>
        )}
      </tr>
    </thead>
  );
}
