/** Table row — renders cells with appropriate editors per column type. */

import { h } from "preact";
import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import type { ColumnDefinition, ColorKey } from "../../../types/schema";
import type { DatabaseRecord, CellValue } from "../../../types/record";
import { CellRenderer } from "../cells/cell-renderer";

/** Props for the TableRow component. */
interface TableRowProps {
  readonly record: DatabaseRecord;
  readonly columns: readonly ColumnDefinition[];
  readonly onCellChange: (field: string, value: CellValue) => void;
  readonly onOpenNote: () => void;
  /** All records — passed to CellRenderer for select in-use/available sections. */
  readonly records?: readonly DatabaseRecord[];
  /** Called to add a new option to a select/multi-select column. */
  readonly onAddOption?: (columnId: string, value: string, color: ColorKey) => void;
  /** Target records cache keyed by folder path — for relation pickers. */
  readonly targetRecordsByFolder?: ReadonlyMap<string, readonly DatabaseRecord[]>;
  /** Navigate to a note by name (for relation tag clicks). */
  readonly onNavigateToNote?: (noteName: string) => void;
  /** Rename a record's file. */
  readonly onRenameFile?: (recordId: string, newName: string) => void;
  /** Create a new record in a target relation folder. */
  readonly onCreateRelationRecord?: (targetFolder: string, name: string) => void;
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
  records,
  onAddOption,
  targetRecordsByFolder,
  onNavigateToNote,
  onRenameFile,
  onCreateRelationRecord,
}: TableRowProps) {
  /** Handle cell value change, wrapping with the field name. */
  const handleChange = useCallback(
    (field: string, value: CellValue) => {
      onCellChange(field, value);
    },
    [onCellChange]
  );

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(record.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  /** Sync nameValue when record changes (e.g., after rename or re-index). */
  useEffect(() => {
    setNameValue(record.name);
    setEditingName(false);
  }, [record.name]);

  /** Focus and select the input text when entering edit mode. */
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  /** Commit the file rename and exit edit mode. */
  const handleNameCommit = useCallback(() => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== record.name) {
      onRenameFile?.(record.id, trimmed);
    } else {
      setNameValue(record.name);
    }
  }, [nameValue, record.id, record.name, onRenameFile]);

  return (
    <tr>
      {columns.map((col) => {
        // File column: click text to navigate, click cell area to edit
        if (col.type === "file") {
          return (
            <td
              key={col.id}
              onClick={() => setEditingName(true)}
              style={{ cursor: "text" }}
            >
              {editingName ? (
                <input
                  ref={nameInputRef}
                  class="database-form-input"
                  type="text"
                  value={nameValue}
                  onInput={(e) => setNameValue((e.target as HTMLInputElement).value)}
                  onBlur={handleNameCommit}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNameCommit();
                    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditingName(false); setNameValue(record.name); }
                  }}
                  style={{ width: "100%", padding: "2px 4px" }}
                />
              ) : (
                <span
                  class="database-link"
                  onClick={(e) => { e.stopPropagation(); onOpenNote(); }}
                >
                  {record.name}
                </span>
              )}
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
              onNavigate={onNavigateToNote}
              records={records}
              onAddOption={onAddOption}
              targetRecordsByFolder={targetRecordsByFolder}
              onCreateRelationRecord={onCreateRelationRecord}
            />
          </td>
        );
      })}
    </tr>
  );
}
