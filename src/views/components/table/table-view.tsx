/** Table view — renders the database table with header and rows. Sort and toolbar are managed by parent. */

import { h } from "preact";
import { useCallback, useMemo } from "preact/hooks";
import type { DatabaseSchema, SortRule, ColorKey, ColumnDefinition } from "../../../types/schema";
import type { DatabaseRecord, CellValue } from "../../../types/record";
import { TableHeader } from "./table-header";
import { TableRow } from "./table-row";

/** Props for the TableView component. */
interface TableViewProps {
  readonly schema: DatabaseSchema;
  readonly records: readonly DatabaseRecord[];
  readonly sort: readonly SortRule[];
  readonly hiddenColumns?: readonly string[];
  readonly onCellChange: (recordId: string, field: string, value: CellValue) => void;
  readonly onSort: (columnId: string, shiftKey: boolean) => void;
  readonly onClearSort?: () => void;
  readonly onOpenNote: (record: DatabaseRecord) => void;
  readonly onAddColumn?: () => void;
  readonly onEditColumn?: (columnId: string) => void;
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
 * Table view rendering the database as a spreadsheet-like table.
 * Sort state and toolbar are managed by the parent DatabaseApp.
 * @param props.schema - Database schema with column definitions.
 * @param props.records - Records to display (already filtered and sorted by parent).
 * @param props.sort - Current sort rules (for displaying indicators in header).
 * @param props.onCellChange - Called when a cell value is edited.
 * @param props.onSort - Called with column ID when header is clicked to toggle sort.
 * @param props.onOpenNote - Called to open a record's note file.
 */
export function TableView({
  schema,
  records,
  sort,
  onCellChange,
  onSort,
  onClearSort,
  onOpenNote,
  onAddColumn,
  onEditColumn,
  onAddOption,
  hiddenColumns,
  targetRecordsByFolder,
  onNavigateToNote,
  onRenameFile,
  onCreateRelationRecord,
}: TableViewProps) {
  /** Get visible columns — filter out hidden columns from the active view config. */
  const visibleColumns = useMemo(() => {
    if (!hiddenColumns || hiddenColumns.length === 0) return schema.columns;
    const hiddenSet = new Set(hiddenColumns);
    return schema.columns.filter((c) => !hiddenSet.has(c.id));
  }, [schema.columns, hiddenColumns]);

  /** Handle cell change, forwarding record ID. */
  const handleCellChange = useCallback(
    (recordId: string, field: string, value: CellValue) => {
      onCellChange(recordId, field, value);
    },
    [onCellChange]
  );

  if (records.length === 0) {
    return (
      <div class="database-empty-state">
        <span>No records to display</span>
      </div>
    );
  }

  return (
    <div class="database-table">
      <table>
        <TableHeader
          columns={visibleColumns}
          sort={sort}
          onSort={onSort}
          onAddColumn={onAddColumn}
          onEditColumn={onEditColumn}
        />
        <tbody>
          {records.map((record) => (
            <TableRow
              key={record.id}
              record={record}
              columns={visibleColumns}
              onCellChange={(field, value) =>
                handleCellChange(record.id, field, value)
              }
              onOpenNote={() => onOpenNote(record)}
              records={records}
              onAddOption={onAddOption}
              targetRecordsByFolder={targetRecordsByFolder}
              onNavigateToNote={onNavigateToNote}
              onRenameFile={onRenameFile}
              onCreateRelationRecord={onCreateRelationRecord}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
