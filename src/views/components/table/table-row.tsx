/** Table row — renders cells with appropriate editors per column type. */

import { h } from "preact";
import { useCallback } from "preact/hooks";
import type { ColumnDefinition } from "../../../types/schema";
import type { DatabaseRecord, CellValue } from "../../../types/record";
import { CellRenderer } from "../cells/cell-renderer";

/** Props for the TableRow component. */
interface TableRowProps {
  readonly record: DatabaseRecord;
  readonly columns: readonly ColumnDefinition[];
  readonly onCellChange: (field: string, value: CellValue) => void;
  readonly onOpenNote: () => void;
}

/**
 * A single table row that renders each column's cell.
 * The first "file" column renders as a clickable link to open the note.
 * Other columns delegate to CellRenderer for type-appropriate editing.
 * @param props.record - The database record for this row.
 * @param props.columns - Column definitions determining cell types.
 * @param props.onCellChange - Called with (field, value) when a cell changes.
 * @param props.onOpenNote - Called to open this record's note.
 */
export function TableRow({
  record,
  columns,
  onCellChange,
  onOpenNote,
}: TableRowProps) {
  /** Handle cell value change, wrapping with the field name. */
  const handleChange = useCallback(
    (field: string, value: CellValue) => {
      onCellChange(field, value);
    },
    [onCellChange]
  );

  return (
    <tr>
      {columns.map((col) => {
        // File column renders as a clickable link
        if (col.type === "file") {
          return (
            <td key={col.id}>
              <span class="database-link" onClick={onOpenNote}>
                {record.name}
              </span>
            </td>
          );
        }

        const cellValue = record.values[col.id] ?? null;

        return (
          <td key={col.id}>
            <CellRenderer
              column={col}
              value={cellValue}
              onChange={(value) => handleChange(col.id, value)}
              onNavigate={undefined}
            />
          </td>
        );
      })}
    </tr>
  );
}
