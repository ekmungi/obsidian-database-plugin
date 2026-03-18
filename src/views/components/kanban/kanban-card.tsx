/** Single draggable kanban card — shows record name and selected fields. */

import { h } from "preact";
import { useState, useCallback } from "preact/hooks";
import type { DatabaseRecord } from "../../../types/record";
import type { ColumnDefinition } from "../../../types/schema";
import type { CellValue } from "../../../types/record";

/** Props for the KanbanCard component. */
interface KanbanCardProps {
  readonly record: DatabaseRecord;
  readonly cardFields: readonly string[];
  readonly columns: readonly ColumnDefinition[];
  readonly onOpenNote: () => void;
}

/**
 * Format a cell value for display on a kanban card.
 * Dates are formatted, arrays joined, booleans converted to text.
 * @param value - The raw cell value from frontmatter.
 * @param column - Column definition for type-aware formatting.
 * @returns A human-readable string representation.
 */
function formatFieldValue(value: CellValue, column: ColumnDefinition | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return (value as readonly (string | number)[]).join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  /* Format date strings with locale-aware display */
  if (column?.type === "date" && typeof value === "string") {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  }

  return String(value);
}

/**
 * Look up a column definition by its ID.
 * @param columns - All column definitions in the schema.
 * @param fieldId - The column ID to find.
 * @returns The matching ColumnDefinition or undefined.
 */
function findColumn(
  columns: readonly ColumnDefinition[],
  fieldId: string
): ColumnDefinition | undefined {
  return columns.find((c) => c.id === fieldId);
}

/**
 * Determine whether a select/multi-select value should render as a tag.
 * @param column - The column definition.
 * @returns True if the column type supports tag rendering.
 */
function isTagType(column: ColumnDefinition | undefined): boolean {
  return column?.type === "select" || column?.type === "multi-select";
}

/**
 * Render a single field value, using tag styling for select columns.
 * @param value - The formatted display string.
 * @param column - The column definition for styling decisions.
 * @param label - The column label for display.
 */
function renderFieldContent(
  value: CellValue,
  column: ColumnDefinition | undefined,
  label: string
) {
  const formatted = formatFieldValue(value, column);
  if (!formatted) {
    return null;
  }

  /* Render select/multi-select values as inline tags */
  if (isTagType(column) && Array.isArray(value)) {
    const items = value as readonly string[];
    return (
      <div class="kanban-card-field">
        <span class="kanban-card-field-label">{label}: </span>
        {items.map((item) => (
          <span key={item} class="kanban-card-tag">
            {item}
          </span>
        ))}
      </div>
    );
  }

  if (isTagType(column) && typeof value === "string") {
    return (
      <div class="kanban-card-field">
        <span class="kanban-card-field-label">{label}: </span>
        <span class="kanban-card-tag">{value}</span>
      </div>
    );
  }

  return (
    <div class="kanban-card-field">
      <span class="kanban-card-field-label">{label}: </span>
      {formatted}
    </div>
  );
}

/**
 * A single draggable kanban card representing one database record.
 * Shows the record name as a clickable title and selected fields below.
 * @param props.record - The database record to display.
 * @param props.cardFields - Column IDs to show as secondary info.
 * @param props.columns - All column definitions for formatting.
 * @param props.onOpenNote - Called when the card title is clicked.
 */
export function KanbanCard({ record, cardFields, columns, onOpenNote }: KanbanCardProps) {
  const [dragging, setDragging] = useState(false);

  /** Set drag data and visual state on drag start. */
  const handleDragStart = useCallback(
    (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.setData("text/plain", record.id);
      e.dataTransfer.effectAllowed = "move";
      setDragging(true);
    },
    [record.id]
  );

  /** Clear dragging state when drag ends. */
  const handleDragEnd = useCallback(() => {
    setDragging(false);
  }, []);

  /** Open the note on title click, preventing drag interference. */
  const handleTitleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onOpenNote();
    },
    [onOpenNote]
  );

  const className = dragging ? "kanban-card dragging" : "kanban-card";

  return (
    <div
      class={className}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div class="kanban-card-title" onClick={handleTitleClick}>
        {record.name}
      </div>
      {cardFields.map((fieldId) => {
        const column = findColumn(columns, fieldId);
        const label = column?.label ?? fieldId;
        const value = record.values[fieldId] ?? null;
        return renderFieldContent(value, column, label);
      })}
    </div>
  );
}
