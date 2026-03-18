/** Main kanban board — groups records by a column and enables drag-and-drop. */

import { h } from "preact";
import { useMemo, useCallback } from "preact/hooks";
import type { DatabaseSchema, ColumnDefinition } from "../../../types/schema";
import type { DatabaseRecord, CellValue } from "../../../types/record";
import type { SelectOption } from "../../../types/schema";
import { KanbanColumn } from "./kanban-column";

/** CSS color values mapped from select option ColorKey values. */
const COLOR_MAP: Readonly<Record<string, string>> = {
  gray: "var(--text-muted)",
  red: "#e03e3e",
  orange: "#d9730d",
  yellow: "#dfab01",
  green: "#0f7b6c",
  teal: "#0b6e99",
  blue: "#2f80ed",
  purple: "#6940a5",
  pink: "#ad1a72",
  brown: "#64473a",
};

/** Sentinel key for records with no value in the groupBy column. */
const NO_VALUE_KEY = "__no_value__";

/** Display label for the "no value" column. */
const NO_VALUE_LABEL = "No value";

/** Props for the KanbanView component. */
interface KanbanViewProps {
  readonly schema: DatabaseSchema;
  readonly records: readonly DatabaseRecord[];
  readonly groupByColumn: string;
  readonly cardFields?: readonly string[];
  readonly onCellChange: (recordId: string, field: string, value: CellValue) => void;
  readonly onOpenNote: (record: DatabaseRecord) => void;
}

/**
 * Resolve the string value of a cell for grouping purposes.
 * Arrays use the first element; nulls become the NO_VALUE_KEY sentinel.
 * @param value - The raw cell value.
 * @returns A string key for grouping.
 */
function resolveGroupKey(value: CellValue): string {
  if (value === null || value === undefined) {
    return NO_VALUE_KEY;
  }
  if (Array.isArray(value)) {
    const first = (value as readonly (string | number)[])[0];
    return first !== undefined ? String(first) : NO_VALUE_KEY;
  }
  const str = String(value);
  return str === "" ? NO_VALUE_KEY : str;
}

/**
 * Build the ordered list of group keys from select options or record values.
 * Select/multi-select columns use their defined option order; other types
 * derive groups from the actual record values.
 * @param column - The column definition for the groupBy field.
 * @param records - All records to extract groups from.
 * @returns Ordered array of group keys (NO_VALUE_KEY excluded).
 */
function buildGroupOrder(
  column: ColumnDefinition | undefined,
  records: readonly DatabaseRecord[],
  groupByColumn: string
): readonly string[] {
  /* Use predefined option order for select columns */
  if (column?.options && column.options.length > 0) {
    return column.options.map((opt: SelectOption) => opt.value);
  }

  /* Derive groups from record values, preserving insertion order */
  const seen = new Set<string>();
  const order: string[] = [];
  for (const record of records) {
    const key = resolveGroupKey(record.values[groupByColumn] ?? null);
    if (key !== NO_VALUE_KEY && !seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  return order;
}

/**
 * Group records by their value in the groupBy column.
 * @param records - All database records.
 * @param groupByColumn - The column ID to group by.
 * @returns A map from group key to array of records.
 */
function groupRecords(
  records: readonly DatabaseRecord[],
  groupByColumn: string
): ReadonlyMap<string, readonly DatabaseRecord[]> {
  const groups = new Map<string, DatabaseRecord[]>();

  for (const record of records) {
    const key = resolveGroupKey(record.values[groupByColumn] ?? null);
    const existing = groups.get(key);
    if (existing) {
      groups.set(key, [...existing, record]);
    } else {
      groups.set(key, [record]);
    }
  }

  return groups;
}

/**
 * Look up the CSS color for a select option value.
 * @param column - The column definition with options.
 * @param value - The option value to match.
 * @returns A CSS color string or undefined.
 */
function getOptionColor(column: ColumnDefinition | undefined, value: string): string | undefined {
  if (!column?.options) return undefined;
  const option = column.options.find((opt: SelectOption) => opt.value === value);
  return option ? COLOR_MAP[option.color] : undefined;
}

/**
 * Main kanban board that groups records into columns by a field value.
 * Supports drag-and-drop to move cards between columns, which updates
 * the groupBy field value via onCellChange.
 * @param props.schema - The database schema with column definitions.
 * @param props.records - All records to display.
 * @param props.groupByColumn - Column ID to group records by.
 * @param props.cardFields - Column IDs to show on each card.
 * @param props.onCellChange - Called when a card is moved to a new column.
 * @param props.onOpenNote - Called when a card title is clicked.
 */
export function KanbanView({
  schema,
  records,
  groupByColumn,
  cardFields,
  onCellChange,
  onOpenNote,
}: KanbanViewProps) {
  /** Find the column definition for the groupBy field. */
  const groupColumn = useMemo(
    () => schema.columns.find((c) => c.id === groupByColumn),
    [schema.columns, groupByColumn]
  );

  /** Resolve which fields to show on cards. */
  const resolvedCardFields = useMemo(
    () => cardFields ?? [],
    [cardFields]
  );

  /** Compute the ordered group keys. */
  const groupOrder = useMemo(
    () => buildGroupOrder(groupColumn, records, groupByColumn),
    [groupColumn, records, groupByColumn]
  );

  /** Group records by the groupBy column value. */
  const grouped = useMemo(
    () => groupRecords(records, groupByColumn),
    [records, groupByColumn]
  );

  /** Check whether a "No value" column is needed. */
  const hasNoValue = grouped.has(NO_VALUE_KEY);

  /**
   * Create a drop handler for a specific column/group value.
   * When a card is dropped, updates the record's groupBy field.
   */
  const makeDropHandler = useCallback(
    (targetValue: string) => (recordId: string) => {
      /* Convert sentinel back to null for the "No value" column */
      const newValue: CellValue = targetValue === NO_VALUE_KEY ? null : targetValue;
      onCellChange(recordId, groupByColumn, newValue);
    },
    [onCellChange, groupByColumn]
  );

  return (
    <div class="kanban-board">
      {/* Render columns in option-defined order */}
      {groupOrder.map((groupKey) => (
        <KanbanColumn
          key={groupKey}
          title={groupKey}
          color={getOptionColor(groupColumn, groupKey)}
          records={grouped.get(groupKey) ?? []}
          cardFields={resolvedCardFields}
          columns={schema.columns}
          onDrop={makeDropHandler(groupKey)}
          onOpenNote={onOpenNote}
        />
      ))}
      {/* "No value" column rendered last when records lack a group value */}
      {hasNoValue && (
        <KanbanColumn
          key={NO_VALUE_KEY}
          title={NO_VALUE_LABEL}
          records={grouped.get(NO_VALUE_KEY) ?? []}
          cardFields={resolvedCardFields}
          columns={schema.columns}
          onDrop={makeDropHandler(NO_VALUE_KEY)}
          onOpenNote={onOpenNote}
        />
      )}
    </div>
  );
}
