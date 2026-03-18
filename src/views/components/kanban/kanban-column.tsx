/** Single kanban column — drop zone with header and card list. */

import { h } from "preact";
import { useState, useCallback } from "preact/hooks";
import type { DatabaseRecord } from "../../../types/record";
import type { ColumnDefinition } from "../../../types/schema";
import { KanbanCard } from "./kanban-card";

/** Props for the KanbanColumn component. */
interface KanbanColumnProps {
  readonly title: string;
  readonly color?: string;
  readonly records: readonly DatabaseRecord[];
  readonly cardFields: readonly string[];
  readonly columns: readonly ColumnDefinition[];
  readonly onDrop: (recordId: string) => void;
  readonly onOpenNote: (record: DatabaseRecord) => void;
}

/**
 * A single kanban column that acts as a drop target for cards.
 * Shows a colored header with title and count, and renders KanbanCard
 * for each record. Provides visual feedback during drag-over.
 * @param props.title - Column header text (the group value).
 * @param props.color - Optional CSS color for the header indicator.
 * @param props.records - Records belonging to this column.
 * @param props.cardFields - Column IDs to display on each card.
 * @param props.columns - All column definitions for formatting.
 * @param props.onDrop - Called with the record ID when a card is dropped here.
 * @param props.onOpenNote - Called when a card title is clicked.
 */
export function KanbanColumn({
  title,
  color,
  records,
  cardFields,
  columns,
  onDrop,
  onOpenNote,
}: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);

  /** Allow drop and set visual feedback. */
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  /** Highlight column when a dragged card enters. */
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  /** Remove highlight when a dragged card leaves this column. */
  const handleDragLeave = useCallback((e: DragEvent) => {
    /* Only clear when leaving the column itself, not child elements */
    const relatedTarget = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as Node;
    if (relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
    setDragOver(false);
  }, []);

  /** Extract record ID from drop event and forward to parent. */
  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const recordId = e.dataTransfer?.getData("text/plain");
      if (recordId) {
        onDrop(recordId);
      }
    },
    [onDrop]
  );

  const columnClass = dragOver ? "kanban-column drag-over" : "kanban-column";

  /** Build the color indicator style if a color is provided. */
  const headerStyle = color
    ? { borderLeft: `3px solid ${color}`, paddingLeft: "9px" }
    : undefined;

  return (
    <div
      class={columnClass}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div class="kanban-column-header" style={headerStyle}>
        <span>{title}</span>
        <span class="kanban-column-count">{records.length}</span>
      </div>
      <div class="kanban-cards">
        {records.map((record) => (
          <KanbanCard
            key={record.id}
            record={record}
            cardFields={cardFields}
            columns={columns}
            onOpenNote={() => onOpenNote(record)}
          />
        ))}
      </div>
    </div>
  );
}
