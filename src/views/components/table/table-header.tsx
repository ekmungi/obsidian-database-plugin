/** Table header — column headers with sort indicators and type icons. */

import { h } from "preact";
import { useCallback } from "preact/hooks";
import type { ColumnDefinition, ColumnType, SortRule } from "../../../types/schema";

/** Props for the TableHeader component. */
interface TableHeaderProps {
  readonly columns: readonly ColumnDefinition[];
  readonly sort: readonly SortRule[];
  readonly onSort: (columnId: string, shiftKey: boolean) => void;
  readonly onAddColumn?: () => void;
  readonly onEditColumn?: (columnId: string) => void;
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

/**
 * Find the sort index (1-based priority) for a column, or -1 if unsorted.
 */
function getSortIndex(columnId: string, sort: readonly SortRule[]): number {
  const idx = sort.findIndex((s) => s.column === columnId);
  return idx === -1 ? -1 : idx + 1;
}

/**
 * Find the current sort direction for a column.
 * @param columnId - The column to check.
 * @param sort - Current sort rules.
 * @returns The sort direction string, or null if unsorted.
 */
function getSortDir(
  columnId: string,
  sort: readonly SortRule[]
): string | null {
  const rule = sort.find((s) => s.column === columnId);
  return rule ? rule.dir : null;
}

/**
 * Table header row rendering column labels, type icons, and sort indicators.
 * @param props.columns - Column definitions to render.
 * @param props.sort - Current sort rules for displaying indicators.
 * @param props.onSort - Called with column ID when header is clicked.
 * @param props.onColumnResize - Called when a column is resized (future).
 */
export function TableHeader({ columns, sort, onSort, onAddColumn, onEditColumn }: TableHeaderProps) {
  return (
    <thead>
      <tr>
        {columns.map((col) => {
          const sortDir = getSortDir(col.id, sort);
          const sortIdx = getSortIndex(col.id, sort);
          const textIcon = COLUMN_TYPE_ICONS[col.type];
          const SvgIcon = COLUMN_SVG_ICONS[col.type];
          const arrow = sortDir ? SORT_ARROWS[sortDir] ?? "" : "";
          const showPriority = sortIdx > 0 && sort.length > 1;

          return (
            <th
              key={col.id}
              style={col.width ? { width: `${col.width}px` } : undefined}
              title={`${col.label} (${col.type}) — click to sort, Shift+click for multi-sort`}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                <span
                  style={{ flex: 1, cursor: "pointer" }}
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
                {onEditColumn && (
                  <span
                    style={{ opacity: 0, cursor: "pointer", fontSize: "0.8em", padding: "0 2px" }}
                    class="column-edit-btn"
                    onClick={(e) => { e.stopPropagation(); onEditColumn(col.id); }}
                    title={`Edit ${col.label}`}
                  >
                    &#9881;
                  </span>
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
