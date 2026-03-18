/** Root Preact component for the database view — orchestrates data, views, and editing. */

import { h } from "preact";
import { useState, useCallback, useMemo, useEffect } from "preact/hooks";
import type {
  DatabaseSchema, ViewConfig, CellValue, SortRule, SortDirection,
  FilterRule, ColumnDefinition, ColumnType, ColorKey,
} from "../../types";
import type { DatabaseRecord } from "../../types/record";
import { filterRecords, sortRecords, searchRecords } from "../../engine/query-engine";
import { addColumn, removeColumn, updateColumn } from "../../engine/schema-manager";
import { isSameGroup } from "../../engine/type-groups";
import { TableView } from "./table/table-view";
import { KanbanView } from "./kanban/kanban-view";
import { CalendarView } from "./calendar/calendar-view";
import { TableToolbar } from "./table/table-toolbar";
import { ColumnConfigModal } from "./config/column-config-modal";

/** Props for the root database app component. */
export interface DatabaseAppProps {
  readonly schema: DatabaseSchema;
  readonly records: readonly DatabaseRecord[];
  readonly onCellChange: (recordId: string, field: string, value: CellValue) => void;
  readonly onNewRecord: (templatePath?: string | null) => void;
  readonly onOpenNote: (record: DatabaseRecord) => void;
  readonly onSchemaChange: (schema: DatabaseSchema) => void;
  /** Called to add a new frontmatter field to all existing records. */
  readonly onAddPropertyToAll?: (field: string, defaultValue: CellValue) => void;
  /** Called to remove a frontmatter field from all existing records. */
  readonly onRemovePropertyFromAll?: (field: string) => void;
  /** Called to clear (set to null/empty) a property's values across all records. */
  readonly onClearPropertyFromAll?: (field: string) => void;
  /** Called to rename an option value across all records' frontmatter. */
  readonly onRenameOption?: (field: string, oldName: string, newName: string) => void;
  /** Called to delete an option value from all records' frontmatter. */
  readonly onDeleteOption?: (field: string, optionName: string) => void;
}

/** Cycle sort direction: none -> asc -> desc -> none. */
/** Toggle sort direction: asc -> desc -> asc. Always returns a direction. */
function nextSortDirection(current: SortDirection | null): SortDirection {
  return current === "asc" ? "desc" : "asc";
}

/** Get default value for a column type (used when adding new property to existing files). */
function getDefaultValue(type: string): CellValue {
  switch (type) {
    case "checkbox": return false;
    case "number": return 0;
    case "multi-select": return [];
    default: return "";
  }
}

/** Modal state: closed, adding new, adding from discovered property, or editing existing column. */
type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "add-existing"; propertyId: string; guessedType: ColumnType }
  | { mode: "edit"; columnId: string };

/** Guess a ColumnType from sample values found in frontmatter. */
function guessColumnType(values: readonly CellValue[]): ColumnType {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonNull.length === 0) return "text";
  if (nonNull.every((v) => typeof v === "boolean")) return "checkbox";
  if (nonNull.every((v) => typeof v === "number")) return "number";
  if (nonNull.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))) return "date";
  if (nonNull.every((v) => Array.isArray(v))) return "multi-select";
  // Check if it looks like a select (few unique string values)
  if (nonNull.every((v) => typeof v === "string")) {
    const unique = new Set(nonNull as readonly string[]);
    if (unique.size <= 10 && nonNull.length >= 3) return "select";
  }
  return "text";
}


/** Root component that switches between table, kanban, and calendar views. */
export function DatabaseApp(props: DatabaseAppProps): h.JSX.Element {
  const {
    schema, records, onCellChange, onNewRecord, onOpenNote,
    onSchemaChange, onAddPropertyToAll, onRemovePropertyFromAll,
    onClearPropertyFromAll, onRenameOption, onDeleteOption,
  } = props;

  const [activeViewId, setActiveViewId] = useState<string>(
    schema.views.length > 0 ? schema.views[0].id : ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilters, setUserFilters] = useState<readonly FilterRule[]>([]);
  const [sort, setSort] = useState<readonly SortRule[]>(() => {
    const firstView = schema.views[0];
    if (firstView?.type === "table" && firstView.sort && firstView.sort.length > 0) {
      return firstView.sort;
    }
    return [{ column: "name", dir: "asc" as const }];
  });
  const [modalState, setModalState] = useState<ModalState>({ mode: "closed" });

  const activeView: ViewConfig | undefined = useMemo(
    () => schema.views.find((v) => v.id === activeViewId) ?? schema.views[0],
    [schema.views, activeViewId]
  );

  const processedRecords = useMemo(() => {
    let result = records;
    if (searchQuery.trim()) {
      result = searchRecords(result, searchQuery);
    }
    const allFilters = [...(activeView?.filters ?? []), ...userFilters];
    if (allFilters.length > 0) {
      result = filterRecords(result, allFilters);
    }
    if (sort.length > 0) {
      result = sortRecords(result, sort);
    }
    return result;
  }, [records, searchQuery, activeView, sort, userFilters]);

  /** Sort handler — plain click replaces sort, Shift+click adds to multi-sort. */
  const handleSort = useCallback((columnId: string, shiftKey: boolean) => {
    setSort((prevSort) => {
      const existing = prevSort.find((s) => s.column === columnId);
      const currentDir = existing ? existing.dir : null;
      const nextDir = nextSortDirection(currentDir);

      if (shiftKey) {
        // Multi-sort: stack sort rules
        if (existing) return prevSort.map((s) => s.column === columnId ? { ...s, dir: nextDir } : s);
        return [...prevSort, { column: columnId, dir: nextDir }];
      } else {
        // Single-sort: replace all sort rules with this one
        return [{ column: columnId, dir: nextDir }];
      }
    });
  }, []);

  /** Clear all sorting — defaults to sort by name ascending. */
  const handleClearSort = useCallback(() => {
    setSort([{ column: "name", dir: "asc" }]);
  }, []);

  const handleViewChange = useCallback((viewId: string) => {
    setActiveViewId(viewId);
    const view = schema.views.find((v) => v.id === viewId);
    if (view?.type === "table" && view.sort) {
      setSort(view.sort);
    } else {
      setSort([]);
    }
  }, [schema.views]);

  const handleSearch = useCallback((query: string) => { setSearchQuery(query); }, []);
  const handleFilterChange = useCallback((filters: readonly FilterRule[]) => { setUserFilters(filters); }, []);
  const handleNewRecord = useCallback(() => { onNewRecord(null); }, [onNewRecord]);

  /* ── Discover existing frontmatter properties not in schema ── */

  const undiscoveredProperties = useMemo(() => {
    const schemaIds = new Set(schema.columns.map((c) => c.id));
    const propMap = new Map<string, CellValue[]>();
    for (const record of records) {
      for (const [key, val] of Object.entries(record.values)) {
        if (schemaIds.has(key)) continue;
        if (!propMap.has(key)) propMap.set(key, []);
        propMap.get(key)!.push(val);
      }
    }
    return Array.from(propMap.entries()).map(([id, values]) => ({
      id,
      guessedType: guessColumnType(values),
    }));
  }, [records, schema.columns]);

  const [showAddMenu, setShowAddMenu] = useState(false);

  /** Global escape key handler — closes popups and prevents Obsidian from stealing the event. */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAddMenu) {
          e.preventDefault();
          e.stopPropagation();
          setShowAddMenu(false);
          return;
        }
        if (modalState.mode !== "closed") {
          e.preventDefault();
          e.stopPropagation();
          setModalState({ mode: "closed" });
          return;
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [showAddMenu, modalState]);

  /* ── Column config modal handlers ─────────── */

  const handleAddColumn = useCallback(() => {
    if (undiscoveredProperties.length > 0) {
      setShowAddMenu((prev) => !prev);
    } else {
      setModalState({ mode: "add" });
    }
  }, [undiscoveredProperties]);

  /** Add an existing frontmatter property as a column (pre-filled in modal). */
  const handleAddExistingProperty = useCallback((propId: string, guessedType: ColumnType) => {
    setShowAddMenu(false);
    setModalState({ mode: "add-existing", propertyId: propId, guessedType });
  }, []);

  /** Open the blank "new property" modal. */
  const handleAddNewProperty = useCallback(() => {
    setShowAddMenu(false);
    setModalState({ mode: "add" });
  }, []);

  const handleEditColumn = useCallback((columnId: string) => {
    setModalState({ mode: "edit", columnId });
  }, []);

  const handleCloseModal = useCallback(() => { setModalState({ mode: "closed" }); }, []);

  /** Save a new or edited column — updates schema AND adds property to all files (for truly new ones). */
  const handleSaveColumn = useCallback((column: ColumnDefinition, renames?: ReadonlyMap<string, string>) => {
    if (modalState.mode === "edit") {
      const oldCol = schema.columns.find((c) => c.id === modalState.columnId);
      if (oldCol && oldCol.type !== column.type && !isSameGroup(oldCol.type, column.type)) {
        // Cross-group type change — strip options if moving away from select types, clear values
        const cleaned = column.type === "select" || column.type === "multi-select"
          ? column
          : { ...column, options: undefined };
        const newSchema = updateColumn(schema, modalState.columnId, cleaned);
        onSchemaChange(newSchema);
        onClearPropertyFromAll?.(column.id);
      } else {
        // Same group (or same type) — just update schema, data migrates naturally
        const newSchema = updateColumn(schema, modalState.columnId, column);
        onSchemaChange(newSchema);
        // Propagate any option renames to pages
        if (renames && renames.size > 0) {
          for (const [oldName, newName] of renames) {
            onRenameOption?.(column.id, oldName, newName);
          }
        }
      }
    } else if (modalState.mode === "add-existing") {
      // Property already exists in frontmatter — just add column to schema
      const newSchema = addColumn(schema, column);
      onSchemaChange(newSchema);
    } else {
      const newSchema = addColumn(schema, column);
      // Brand new property — add to all existing MD files
      onAddPropertyToAll?.(column.id, getDefaultValue(column.type));
      onSchemaChange(newSchema);
    }
    setModalState({ mode: "closed" });
  }, [schema, modalState, onSchemaChange, onAddPropertyToAll, onClearPropertyFromAll, onRenameOption]);

  /** Add a new option to a select/multi-select column's schema. */
  const handleAddOption = useCallback((columnId: string, value: string, color: ColorKey) => {
    const col = schema.columns.find((c) => c.id === columnId);
    if (!col) return;
    const existingOptions = col.options ?? [];
    if (existingOptions.some((o) => o.value === value)) return;
    const newOptions = [...existingOptions, { value, color }];
    const newSchema = updateColumn(schema, columnId, { options: newOptions });
    onSchemaChange(newSchema);
  }, [schema, onSchemaChange]);

  /** Delete a single option from the currently-edited column and propagate to pages. */
  const handleDeleteOptionFromModal = useCallback((optionName: string) => {
    if (modalState.mode !== "edit") return;
    onDeleteOption?.(modalState.columnId, optionName);
  }, [modalState, onDeleteOption]);

  /** Delete a column — updates schema AND removes property from all files. */
  const handleDeleteColumn = useCallback(() => {
    if (modalState.mode !== "edit") return;
    const newSchema = removeColumn(schema, modalState.columnId);
    onSchemaChange(newSchema);
    onRemovePropertyFromAll?.(modalState.columnId);
    setModalState({ mode: "closed" });
  }, [schema, modalState, onSchemaChange, onRemovePropertyFromAll]);

  /** Get the column being edited or pre-filled for existing property. */
  const editingColumn = modalState.mode === "edit"
    ? schema.columns.find((c) => c.id === modalState.columnId)
    : modalState.mode === "add-existing"
      ? { id: modalState.propertyId, type: modalState.guessedType, label: modalState.propertyId } as ColumnDefinition
      : undefined;

  const existingIds = useMemo(
    () => schema.columns.map((c) => c.id),
    [schema.columns]
  );

  if (!activeView) {
    return (
      <div class="database-empty-state">
        <p>No views configured for this database.</p>
      </div>
    );
  }

  return (
    <div class="database-view-container">
      <TableToolbar
        schema={schema}
        records={records}
        activeViewId={activeView.id}
        onViewChange={handleViewChange}
        onNewRecord={handleNewRecord}
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
        onClearSort={handleClearSort}
        sortCount={sort.length}
      />
      {renderActiveView(activeView, {
        schema,
        records: processedRecords,
        sort,
        onCellChange,
        onOpenNote,
        onSort: handleSort,
        onClearSort: handleClearSort,
        onAddColumn: handleAddColumn,
        onEditColumn: handleEditColumn,
        onAddOption: handleAddOption,
      })}
      {showAddMenu && undiscoveredProperties.length > 0 && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 89 }}
            onClick={() => setShowAddMenu(false)}
          />
          <div
            style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              zIndex: 90,
              background: "var(--background-primary)",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "var(--radius-m)",
              boxShadow: "var(--shadow-s)",
              padding: "8px",
              minWidth: "220px",
            }}
          >
            <div style={{ padding: "4px 8px", fontSize: "var(--font-ui-smaller)", color: "var(--text-muted)", fontWeight: 600 }}>
              Existing properties
            </div>
            {undiscoveredProperties.map((prop) => (
              <div
                key={prop.id}
                onClick={() => handleAddExistingProperty(prop.id, prop.guessedType)}
                style={{
                  padding: "6px 8px", cursor: "pointer", borderRadius: "var(--radius-s)",
                  fontSize: "var(--font-ui-small)", display: "flex", justifyContent: "space-between",
                }}
                class="template-picker-item"
              >
                <span>{prop.id}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "var(--font-ui-smaller)" }}>{prop.guessedType}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid var(--background-modifier-border)", marginTop: "4px", paddingTop: "4px" }}>
              <div
                onClick={handleAddNewProperty}
                style={{
                  padding: "6px 8px", cursor: "pointer", borderRadius: "var(--radius-s)",
                  fontSize: "var(--font-ui-small)", color: "var(--text-accent)",
                }}
                class="template-picker-item"
              >
                + New property
              </div>
            </div>
          </div>
        </>
      )}
      {modalState.mode !== "closed" && (
        <ColumnConfigModal
          column={editingColumn}
          existingIds={existingIds}
          onSave={handleSaveColumn}
          onDeleteOption={modalState.mode === "edit" ? handleDeleteOptionFromModal : undefined}
          onDelete={modalState.mode === "edit" ? handleDeleteColumn : undefined}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

/** Render params for the active view dispatcher. */
interface RenderParams {
  readonly schema: DatabaseSchema;
  readonly records: readonly DatabaseRecord[];
  readonly sort: readonly SortRule[];
  readonly onCellChange: (recordId: string, field: string, value: CellValue) => void;
  readonly onOpenNote: (record: DatabaseRecord) => void;
  readonly onSort: (columnId: string, shiftKey: boolean) => void;
  readonly onClearSort: () => void;
  readonly onAddColumn: () => void;
  readonly onEditColumn: (columnId: string) => void;
  readonly onAddOption: (columnId: string, value: string, color: ColorKey) => void;
}

/** Dispatches rendering to the correct view component based on view type. */
function renderActiveView(view: ViewConfig, params: RenderParams): h.JSX.Element {
  switch (view.type) {
    case "table":
      return (
        <TableView
          schema={params.schema}
          records={params.records}
          sort={params.sort}
          onCellChange={params.onCellChange}
          onSort={params.onSort}
          onOpenNote={params.onOpenNote}
          onAddColumn={params.onAddColumn}
          onEditColumn={params.onEditColumn}
          onAddOption={params.onAddOption}
        />
      );
    case "kanban":
      return (
        <KanbanView
          schema={params.schema}
          records={params.records}
          groupByColumn={view.groupBy}
          cardFields={view.cardFields}
          onCellChange={params.onCellChange}
          onOpenNote={params.onOpenNote}
        />
      );
    case "calendar":
      return (
        <CalendarView
          schema={params.schema}
          records={params.records}
          dateField={view.dateField}
          colorBy={view.colorBy}
          onCellChange={params.onCellChange}
          onOpenNote={params.onOpenNote}
        />
      );
    default:
      return <div class="database-empty-state">Unknown view type</div>;
  }
}
