/** Root Preact component for the database view — orchestrates data, views, and editing. */

import { h } from "preact";
import { useState, useCallback, useMemo, useEffect, useRef } from "preact/hooks";
import type {
  DatabaseSchema, ViewConfig, CellValue, SortRule, SortDirection,
  FilterRule, ColumnDefinition, ColumnType, ColorKey, ViewType, TemplateFolderConfig,
} from "../../types";
import type { DatabaseRecord } from "../../types/record";
import { filterByDbViewType, filterRecords, sortRecords, searchRecords } from "../../engine/query-engine";
import { addColumn, removeColumn, updateColumn, guessColumnType } from "../../engine/schema-manager";
import { isSameGroup } from "../../engine/type-groups";
import { pickNextColor } from "../../engine/color-cycle";
import { TableView } from "./table/table-view";
import { KanbanView } from "./kanban/kanban-view";
import { CalendarView } from "./calendar/calendar-view";
import { TimelineView } from "./timeline/timeline-view";
import { TableToolbar } from "./table/table-toolbar";
import { ColumnConfigModal } from "./config/column-config-modal";
import type { Template, FolderTemplates } from "../../data/template-scanner";

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
  /** All vault folder paths for autocomplete inputs. */
  readonly folderPaths?: readonly string[];
  /** Target records cache keyed by folder path — for relation pickers. */
  readonly targetRecordsByFolder?: ReadonlyMap<string, readonly DatabaseRecord[]>;
  /** Called to clean up bidirectional back-links when a relation column is deleted. */
  readonly onCleanupBidirectionalLinks?: (column: ColumnDefinition) => void;
  /** Called to navigate to a note by name (for relation tag clicks). */
  readonly onNavigateToNote?: (noteName: string) => void;
  /** Called to rename a record's file. */
  readonly onRenameFile?: (recordId: string, newName: string) => void;
  /** Called to create a new record in a target relation folder. */
  readonly onCreateRelationRecord?: (targetFolder: string, name: string) => void;
  /** Called to delete records by their IDs (file paths). */
  readonly onDeleteRecords?: (recordIds: readonly string[]) => void;
  /** Optional view ID to show initially (used by codeblock embedding). */
  readonly initialViewId?: string;
  /** Enabled templates for the picker dropdown (flat list). */
  readonly templates?: readonly Template[];
  /** Per-folder template entries with enabled/disabled status (for settings accordion). */
  readonly folderTemplates?: readonly FolderTemplates[];
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

/** Inline-editable H2 title — click to edit, blur/Enter to save. Dynamically sized. */
function EditableTitle({ name, onRename }: { readonly name: string; readonly onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => { setValue(name); }, [name]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  /** Resize input to match text content. */
  useEffect(() => {
    if (editing && inputRef.current && measureRef.current) {
      measureRef.current.textContent = value || " ";
      inputRef.current.style.width = `${measureRef.current.offsetWidth + 16}px`;
    }
  }, [editing, value]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setValue(name);
  }, [value, name, onRename]);

  if (editing) {
    return (
      <div style={{ position: "relative", display: "inline-block", margin: "12px 12px 4px" }}>
        <span
          ref={measureRef}
          class="database-view-title"
          style={{ visibility: "hidden", position: "absolute", whiteSpace: "pre", margin: 0, padding: "0 4px" }}
        />
        <input
          ref={inputRef}
          class="database-view-title database-view-title--editing"
          type="text"
          value={value}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setEditing(false); setValue(name); }
          }}
        />
      </div>
    );
  }

  return (
    <h2 class="database-view-title" onClick={() => setEditing(true)} title="Click to rename">
      {name}
    </h2>
  );
}

/** Root component that switches between table, kanban, and calendar views. */
export function DatabaseApp(props: DatabaseAppProps): h.JSX.Element {
  const {
    schema, records, onCellChange, onNewRecord, onOpenNote,
    onSchemaChange, onAddPropertyToAll, onRemovePropertyFromAll,
    onClearPropertyFromAll, onRenameOption, onDeleteOption, folderPaths,
    targetRecordsByFolder, onCleanupBidirectionalLinks,
    onNavigateToNote, onRenameFile, onCreateRelationRecord, onDeleteRecords,
  } = props;

  /** Find the initial view — by explicit ID, then default, then first. */
  const initialView = props.initialViewId
    ? schema.views.find((v) => v.id === props.initialViewId) ?? schema.views.find((v) => v.isDefault) ?? schema.views[0]
    : schema.views.find((v) => v.isDefault) ?? schema.views[0];
  const [activeViewId, setActiveViewId] = useState<string>(
    initialView?.id ?? ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilters, setUserFilters] = useState<readonly FilterRule[]>(
    () => initialView?.filters ?? []
  );
  const [sort, setSort] = useState<readonly SortRule[]>(() => {
    if (initialView?.type === "table" && initialView.sort && initialView.sort.length > 0) {
      return initialView.sort;
    }
    return [{ column: "name", dir: "asc" as const }];
  });
  const [modalState, setModalState] = useState<ModalState>({ mode: "closed" });
  const [selectedRecordIds, setSelectedRecordIds] = useState<ReadonlySet<string>>(new Set());

  const activeView: ViewConfig | undefined = useMemo(
    () => schema.views.find((v) => v.id === activeViewId) ?? schema.views[0],
    [schema.views, activeViewId]
  );

  /** Records after source-level db-view-type filter (before search/view filters). */
  const sourceFilteredRecords = useMemo(
    () => filterByDbViewType(records, schema.dbViewType),
    [records, schema.dbViewType]
  );

  const processedRecords = useMemo(() => {
    let result = sourceFilteredRecords;
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
  }, [sourceFilteredRecords, searchQuery, activeView, sort, userFilters]);

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

  /** Save current sort/filters into the active view config in schema. */
  const persistCurrentViewState = useCallback(() => {
    if (!activeView) return;
    const updatedView: ViewConfig = activeView.type === "table"
      ? { ...activeView, sort, filters: userFilters.length > 0 ? userFilters : undefined }
      : { ...activeView, filters: userFilters.length > 0 ? userFilters : undefined };
    const viewChanged = JSON.stringify(updatedView) !== JSON.stringify(activeView);
    if (viewChanged) {
      const updatedViews = schema.views.map((v) => v.id === activeView.id ? updatedView : v);
      onSchemaChange({ ...schema, views: updatedViews });
    }
  }, [activeView, sort, userFilters, schema, onSchemaChange]);

  const handleViewChange = useCallback((viewId: string) => {
    // Save current view's sort/filters before switching
    persistCurrentViewState();
    setActiveViewId(viewId);
    const view = schema.views.find((v) => v.id === viewId);
    // Load sort from the new view
    if (view?.type === "table" && view.sort) {
      setSort(view.sort);
    } else {
      setSort([]);
    }
    // Load filters from the new view
    setUserFilters(view?.filters ?? []);
  }, [schema.views, persistCurrentViewState]);

  /** Create a new view of the given type. */
  const handleAddView = useCallback((type: ViewType) => {
    const existingOfType = schema.views.filter((v) => v.type === type);
    const name = `${type.charAt(0).toUpperCase() + type.slice(1)} ${existingOfType.length + 1}`;
    const id = `${type}-${Date.now()}`;
    let newView: ViewConfig;
    if (type === "kanban") {
      const groupCol = schema.columns.find((c) => c.type === "select" || c.type === "multi-select")
        ?? schema.columns.find((c) => c.type !== "file");
      newView = { id, type: "kanban", name, groupBy: groupCol?.id ?? "name" };
    } else if (type === "calendar") {
      const dateCol = schema.columns.find((c) => c.type === "date")
        ?? schema.columns.find((c) => c.type !== "file");
      newView = { id, type: "calendar", name, dateField: dateCol?.id ?? "name" };
    } else if (type === "timeline") {
      const dateCols = schema.columns.filter((c) => c.type === "date");
      /* Smart detect: prefer "start" in name for start field, "end"/"due" for end field. */
      const startCol = dateCols.find((c) => /start/i.test(c.id) || /start/i.test(c.label))
        ?? dateCols[0]
        ?? schema.columns.find((c) => c.type !== "file");
      const endCol = dateCols.find((c) => /end|due|deadline|finish/i.test(c.id) || /end|due|deadline|finish/i.test(c.label))
        ?? dateCols.find((c) => c !== startCol)
        ?? startCol;
      newView = { id, type: "timeline", name, startDateField: startCol?.id ?? "name", endDateField: endCol?.id ?? "name" };
    } else {
      newView = { id, type: "table", name, sort: [{ column: "name", dir: "asc" }] };
    }
    // If this is the first view, make it default
    const isFirst = schema.views.length === 0;
    const viewToAdd = isFirst ? { ...newView, isDefault: true } : newView;
    onSchemaChange({ ...schema, views: [...schema.views, viewToAdd] });
    setActiveViewId(id);
    // Load new view's state
    if (newView.type === "table" && newView.sort) {
      setSort(newView.sort);
    } else {
      setSort([]);
    }
    setUserFilters([]);
  }, [schema, onSchemaChange]);

  /** Delete a view (blocked if isDefault). */
  const handleDeleteView = useCallback((viewId: string) => {
    const view = schema.views.find((v) => v.id === viewId);
    if (!view || view.isDefault || schema.views.length <= 1) return;
    const updatedViews = schema.views.filter((v) => v.id !== viewId);
    onSchemaChange({ ...schema, views: updatedViews });
    // If deleted view was active, switch to the default or first view
    if (activeViewId === viewId) {
      const defaultView = updatedViews.find((v) => v.isDefault) ?? updatedViews[0];
      if (defaultView) {
        setActiveViewId(defaultView.id);
        if (defaultView.type === "table" && defaultView.sort) {
          setSort(defaultView.sort);
        } else {
          setSort([]);
        }
        setUserFilters(defaultView.filters ?? []);
      }
    }
  }, [schema, onSchemaChange, activeViewId]);

  /** Rename a view. */
  const handleRenameView = useCallback((viewId: string, name: string) => {
    const updatedViews = schema.views.map((v) =>
      v.id === viewId ? { ...v, name } : v
    );
    onSchemaChange({ ...schema, views: updatedViews });
  }, [schema, onSchemaChange]);

  /** Set a view as default (remove isDefault from all others). */
  const handleSetDefaultView = useCallback((viewId: string) => {
    const updatedViews = schema.views.map((v) => ({
      ...v,
      isDefault: v.id === viewId ? true : undefined,
    }));
    onSchemaChange({ ...schema, views: updatedViews });
  }, [schema, onSchemaChange]);

  /** Handle column resize — persist width into the active view's columnWidths. */
  const handleColumnResize = useCallback((columnId: string, width: number) => {
    if (!activeView || activeView.type !== "table") return;
    const currentWidths = activeView.columnWidths ?? {};
    const updatedView = { ...activeView, columnWidths: { ...currentWidths, [columnId]: width } };
    const updatedViews = schema.views.map((v) => v.id === activeView.id ? updatedView : v);
    onSchemaChange({ ...schema, views: updatedViews });
  }, [activeView, schema, onSchemaChange]);

  const handleSearch = useCallback((query: string) => { setSearchQuery(query); }, []);
  const handleFilterChange = useCallback((filters: readonly FilterRule[]) => { setUserFilters(filters); }, []);

  /** Toggle a single record's selection. */
  const handleToggleSelect = useCallback((recordId: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) { next.delete(recordId); } else { next.add(recordId); }
      return next;
    });
  }, []);

  /** Toggle select all visible records. */
  const handleToggleSelectAll = useCallback(() => {
    setSelectedRecordIds((prev) => {
      const allIds = processedRecords.map((r) => r.id);
      const allSelected = allIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allIds);
    });
  }, [processedRecords]);

  /** Delete all selected records. */
  const handleDeleteSelected = useCallback(() => {
    if (selectedRecordIds.size === 0) return;
    onDeleteRecords?.([...selectedRecordIds]);
    setSelectedRecordIds(new Set());
  }, [selectedRecordIds, onDeleteRecords]);

  /** Toggle a column's visibility in the active view's hiddenColumns. */
  const handleToggleColumnVisibility = useCallback((columnId: string) => {
    if (!activeView) return;
    const currentHidden = activeView.hiddenColumns ?? [];
    const isHidden = currentHidden.includes(columnId);
    const updatedHidden = isHidden
      ? currentHidden.filter((id) => id !== columnId)
      : [...currentHidden, columnId];
    const updatedView = { ...activeView, hiddenColumns: updatedHidden };
    const updatedViews = schema.views.map((v) => v.id === activeView.id ? updatedView : v);
    onSchemaChange({ ...schema, views: updatedViews });
  }, [activeView, schema, onSchemaChange]);

  /** Save settings from the toolbar settings dropdown.
   *  Auto-hides the db-view-type column when dbViewType filter is set. */
  const handleSettingsSave = useCallback((updates: { name?: string; templateFolders?: TemplateFolderConfig[]; dbViewType?: string; recursive?: boolean }) => {
    let updated: DatabaseSchema = {
      ...schema,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.templateFolders !== undefined ? { templateFolders: updates.templateFolders.length > 0 ? updates.templateFolders : undefined, templateFolder: undefined } : {}),
      ...(updates.dbViewType !== undefined ? { dbViewType: updates.dbViewType || undefined } : {}),
      ...(updates.recursive !== undefined ? { recursive: updates.recursive || undefined } : {}),
    };
    // When dbViewType is set: ensure db-view-type column exists in schema and auto-hide it
    if (updates.dbViewType) {
      const hasColumn = updated.columns.some((c) => c.id === "db-view-type");
      if (!hasColumn) {
        updated = {
          ...updated,
          columns: [...updated.columns, { id: "db-view-type", type: "text" as const, label: "db view type" }],
        };
      }
      if (activeView) {
        const currentHidden = activeView.hiddenColumns ?? [];
        if (!currentHidden.includes("db-view-type")) {
          const updatedView = { ...activeView, hiddenColumns: [...currentHidden, "db-view-type"] };
          updated = { ...updated, views: updated.views.map((v) => v.id === activeView.id ? updatedView : v) };
        }
      }
    }
    onSchemaChange(updated);
  }, [schema, activeView, onSchemaChange]);

  /* ── Discover existing frontmatter properties not in schema ── */

  const undiscoveredProperties = useMemo(() => {
    const schemaIds = new Set(schema.columns.map((c) => c.id));
    const propMap = new Map<string, CellValue[]>();
    for (const record of sourceFilteredRecords) {
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
  }, [sourceFilteredRecords, schema.columns]);

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

  /** Add a new option to a select/multi-select column's schema with smart color assignment. */
  const handleAddOption = useCallback((columnId: string, value: string, _color: ColorKey) => {
    const col = schema.columns.find((c) => c.id === columnId);
    if (!col) return;
    const existingOptions = col.options ?? [];
    if (existingOptions.some((o) => o.value === value)) return;
    const autoColor = pickNextColor(existingOptions);
    const newOptions = [...existingOptions, { value, color: autoColor }];
    const newSchema = updateColumn(schema, columnId, { options: newOptions });
    onSchemaChange(newSchema);
  }, [schema, onSchemaChange]);

  /** Delete a single option from the currently-edited column and propagate to pages. */
  const handleDeleteOptionFromModal = useCallback((optionName: string) => {
    if (modalState.mode !== "edit") return;
    onDeleteOption?.(modalState.columnId, optionName);
  }, [modalState, onDeleteOption]);

  /** Delete a column — updates schema, removes property from all files, cleans up back-links. */
  const handleDeleteColumn = useCallback(() => {
    if (modalState.mode !== "edit") return;
    // Clean up bidirectional back-links before removing the column
    const deletedCol = schema.columns.find((c) => c.id === modalState.columnId);
    if (deletedCol && deletedCol.type === "relation" && deletedCol.bidirectional) {
      onCleanupBidirectionalLinks?.(deletedCol);
    }
    const newSchema = removeColumn(schema, modalState.columnId);
    onSchemaChange(newSchema);
    onRemovePropertyFromAll?.(modalState.columnId);
    setModalState({ mode: "closed" });
  }, [schema, modalState, onSchemaChange, onRemovePropertyFromAll, onCleanupBidirectionalLinks]);

  /** Inline dropdown: save column config (called from TableHeader dropdown). */
  const handleInlineSaveColumn = useCallback((column: ColumnDefinition, renames?: ReadonlyMap<string, string>) => {
    const oldCol = schema.columns.find((c) => c.id === column.id);
    if (oldCol && oldCol.type !== column.type && !isSameGroup(oldCol.type, column.type)) {
      const cleaned = column.type === "select" || column.type === "multi-select" ? column : { ...column, options: undefined };
      onSchemaChange(updateColumn(schema, column.id, cleaned));
      onClearPropertyFromAll?.(column.id);
    } else {
      onSchemaChange(updateColumn(schema, column.id, column));
      if (renames && renames.size > 0) {
        for (const [oldName, newName] of renames) { onRenameOption?.(column.id, oldName, newName); }
      }
    }
  }, [schema, onSchemaChange, onClearPropertyFromAll, onRenameOption]);

  /** Inline dropdown: delete column by ID. */
  const handleInlineDeleteColumn = useCallback((columnId: string) => {
    const deletedCol = schema.columns.find((c) => c.id === columnId);
    if (deletedCol && deletedCol.type === "relation" && deletedCol.bidirectional) {
      onCleanupBidirectionalLinks?.(deletedCol);
    }
    onSchemaChange(removeColumn(schema, columnId));
    onRemovePropertyFromAll?.(columnId);
  }, [schema, onSchemaChange, onRemovePropertyFromAll, onCleanupBidirectionalLinks]);

  /** Inline dropdown: delete option from a specific column. */
  const handleInlineDeleteOption = useCallback((columnId: string, optionName: string) => {
    onDeleteOption?.(columnId, optionName);
  }, [onDeleteOption]);

  /** Reorder columns — move a column before another in the schema. */
  const handleReorderColumns = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    const cols = [...schema.columns];
    const fromIdx = cols.findIndex((c) => c.id === fromId);
    const toIdx = cols.findIndex((c) => c.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = cols.splice(fromIdx, 1);
    cols.splice(toIdx, 0, moved);
    onSchemaChange({ ...schema, columns: cols });
  }, [schema, onSchemaChange]);

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

  /** Persist a view-specific setting (e.g. timeline zoom) into the active view config. */
  const handleViewSettingChange = useCallback((key: string, value: unknown) => {
    if (!activeView) return;
    const updatedView = { ...activeView, [key]: value };
    const updatedSchema = {
      ...schema,
      views: schema.views.map((v) => v.id === activeView.id ? updatedView : v),
    };
    onSchemaChange(updatedSchema);
  }, [activeView, schema, onSchemaChange]);

  if (!activeView) {
    return (
      <div class="database-empty-state">
        <p>No views configured for this database.</p>
      </div>
    );
  }

  return (
    <div class="database-view-container">
      <EditableTitle name={schema.name} onRename={(newName) => onSchemaChange({ ...schema, name: newName })} />
      <TableToolbar
        schema={schema}
        records={sourceFilteredRecords}
        activeViewId={activeView.id}
        onViewChange={handleViewChange}
        onNewRecord={onNewRecord}
        onSearch={handleSearch}
        templates={props.templates}
        folderTemplates={props.folderTemplates}
        onFilterChange={handleFilterChange}
        sort={sort}
        onSortChange={setSort}
        onSettingsSave={handleSettingsSave}
        folderPaths={folderPaths}
        hiddenColumns={activeView.hiddenColumns}
        onToggleColumnVisibility={handleToggleColumnVisibility}
        selectedCount={selectedRecordIds.size}
        onDeleteSelected={handleDeleteSelected}
        onAddView={handleAddView}
        onDeleteView={handleDeleteView}
        onRenameView={handleRenameView}
        onSetDefaultView={handleSetDefaultView}
      />
      {renderActiveView(activeView, {
        schema,
        records: processedRecords,
        sort,
        hiddenColumns: activeView.hiddenColumns,
        onCellChange,
        onOpenNote,
        onSort: handleSort,
        onClearSort: handleClearSort,
        onAddColumn: handleAddColumn,
        onEditColumn: handleEditColumn,
        onAddOption: handleAddOption,
        targetRecordsByFolder,
        onNavigateToNote,
        onRenameFile,
        onCreateRelationRecord,
        selectedRecordIds,
        onToggleSelect: handleToggleSelect,
        onToggleSelectAll: handleToggleSelectAll,
        onColumnResize: handleColumnResize,
        editingColumnId: modalState.mode === "edit" ? modalState.columnId : undefined,
        existingColumnIds: existingIds,
        onSaveColumn: handleInlineSaveColumn,
        onDeleteColumn: handleInlineDeleteColumn,
        onDeleteOptionInline: handleInlineDeleteOption,
        folderPaths,
        onReorderColumns: handleReorderColumns,
        onViewSettingChange: handleViewSettingChange,
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
            <div style={{ padding: "4px 8px", fontSize: "var(--font-ui-medium)", color: "var(--text-muted)", fontWeight: 600 }}>
              Existing properties
            </div>
            {undiscoveredProperties.map((prop) => (
              <div
                key={prop.id}
                onClick={() => handleAddExistingProperty(prop.id, prop.guessedType)}
                style={{
                  padding: "6px 8px", cursor: "pointer", borderRadius: "var(--radius-s)",
                  fontSize: "var(--font-ui-medium)", display: "flex", justifyContent: "space-between",
                }}
                class="template-picker-item"
              >
                <span>{prop.id}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "var(--font-ui-medium)" }}>{prop.guessedType}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid var(--background-modifier-border)", marginTop: "4px", paddingTop: "4px" }}>
              <div
                onClick={handleAddNewProperty}
                style={{
                  padding: "6px 8px", cursor: "pointer", borderRadius: "var(--radius-s)",
                  fontSize: "var(--font-ui-medium)", color: "var(--text-accent)",
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
          folderPaths={folderPaths}
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
  readonly hiddenColumns?: readonly string[];
  readonly onCellChange: (recordId: string, field: string, value: CellValue) => void;
  readonly onOpenNote: (record: DatabaseRecord) => void;
  readonly onSort: (columnId: string, shiftKey: boolean) => void;
  readonly onClearSort: () => void;
  readonly onAddColumn: () => void;
  readonly onEditColumn: (columnId: string) => void;
  readonly onAddOption: (columnId: string, value: string, color: ColorKey) => void;
  /** Target records cache for relation pickers. */
  readonly targetRecordsByFolder?: ReadonlyMap<string, readonly DatabaseRecord[]>;
  /** Navigate to a note by name (for relation tag clicks). */
  readonly onNavigateToNote?: (noteName: string) => void;
  /** Rename a record's file. */
  readonly onRenameFile?: (recordId: string, newName: string) => void;
  /** Create a new record in a target relation folder. */
  readonly onCreateRelationRecord?: (targetFolder: string, name: string) => void;
  /** Selected record IDs for bulk operations. */
  readonly selectedRecordIds?: ReadonlySet<string>;
  /** Toggle selection of a record. */
  readonly onToggleSelect?: (recordId: string) => void;
  /** Toggle select all records. */
  readonly onToggleSelectAll?: () => void;
  /** Called when a column is resized via drag. */
  readonly onColumnResize?: (columnId: string, width: number) => void;
  /** Column ID currently being edited. */
  readonly editingColumnId?: string;
  /** All column IDs for uniqueness validation. */
  readonly existingColumnIds?: readonly string[];
  /** Called when column config is saved from inline dropdown. */
  readonly onSaveColumn?: (column: ColumnDefinition, renames?: ReadonlyMap<string, string>) => void;
  /** Called to delete a column from inline dropdown. */
  readonly onDeleteColumn?: (columnId: string) => void;
  /** Called to delete an option from inline dropdown. */
  readonly onDeleteOptionInline?: (columnId: string, optionName: string) => void;
  /** Folder paths for relation target autocomplete. */
  readonly folderPaths?: readonly string[];
  /** Called to reorder columns — move fromId before toId. */
  readonly onReorderColumns?: (fromId: string, toId: string) => void;
  /** Called when a view-specific setting changes (e.g. timeline zoom). */
  readonly onViewSettingChange?: (key: string, value: unknown) => void;
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
          hiddenColumns={params.hiddenColumns}
          onCellChange={params.onCellChange}
          onSort={params.onSort}
          onOpenNote={params.onOpenNote}
          onAddColumn={params.onAddColumn}
          onEditColumn={params.onEditColumn}
          onAddOption={params.onAddOption}
          targetRecordsByFolder={params.targetRecordsByFolder}
          onNavigateToNote={params.onNavigateToNote}
          onRenameFile={params.onRenameFile}
          onCreateRelationRecord={params.onCreateRelationRecord}
          selectedRecordIds={params.selectedRecordIds}
          onToggleSelect={params.onToggleSelect}
          onToggleSelectAll={params.onToggleSelectAll}
          columnWidths={view.columnWidths}
          onColumnResize={params.onColumnResize}
          editingColumnId={params.editingColumnId}
          existingColumnIds={params.existingColumnIds}
          onSaveColumn={params.onSaveColumn}
          onDeleteColumn={params.onDeleteColumn}
          onDeleteOption={params.onDeleteOptionInline}
          folderPaths={params.folderPaths}
          onReorderColumns={params.onReorderColumns}
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
    case "timeline":
      return (
        <TimelineView
          schema={params.schema}
          records={params.records}
          startDateField={view.startDateField}
          endDateField={view.endDateField}
          colorBy={view.colorBy}
          groupBy={view.groupBy}
          initialZoom={view.zoom}
          onZoomChange={(z) => params.onViewSettingChange?.("zoom", z)}
          onCellChange={params.onCellChange}
          onOpenNote={params.onOpenNote}
        />
      );
    default:
      return <div class="database-empty-state">Unknown view type</div>;
  }
}
