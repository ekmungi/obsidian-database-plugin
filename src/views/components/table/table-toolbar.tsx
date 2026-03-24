/** Table toolbar — view tabs, search, filter, sort, and new record button. */

import { h } from "preact";
import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import type { DatabaseSchema, ViewType, ColumnDefinition, FilterRule, FilterOperator, SortRule, SortDirection, TemplateFolderConfig } from "../../../types/schema";
import type { DatabaseRecord, CellValue } from "../../../types/record";
import { ViewTabs } from "./view-tabs";
import { TemplatePicker } from "../shared/template-picker";
import type { Template, FolderTemplates } from "../../../data/template-scanner";

/** Props for the TableToolbar component. */
interface TableToolbarProps {
  readonly schema: DatabaseSchema;
  readonly records: readonly DatabaseRecord[];
  readonly activeViewId: string;
  readonly onViewChange: (viewId: string) => void;
  readonly onNewRecord: (templatePath?: string | null) => void;
  readonly onSearch: (query: string) => void;
  /** Discovered templates for the "+ New" split button. */
  readonly templates?: readonly Template[];
  /** Per-folder template entries with enabled/disabled status (for settings accordion). */
  readonly folderTemplates?: readonly FolderTemplates[];
  readonly onFilterChange?: (filters: readonly FilterRule[]) => void;
  readonly sort?: readonly SortRule[];
  readonly onSortChange?: (sort: readonly SortRule[]) => void;
  readonly onSettingsSave?: (updates: { name?: string; templateFolders?: TemplateFolderConfig[]; dbViewType?: string; recursive?: boolean }) => void;
  readonly hiddenColumns?: readonly string[];
  readonly onToggleColumnVisibility?: (columnId: string) => void;
  readonly folderPaths?: readonly string[];
  /** Number of currently selected records. */
  readonly selectedCount?: number;
  /** Called to delete all selected records. */
  readonly onDeleteSelected?: () => void;
  /** Called to add a new view of the given type. */
  readonly onAddView?: (type: ViewType) => void;
  /** Called to delete a view by ID. */
  readonly onDeleteView?: (viewId: string) => void;
  /** Called to rename a view. */
  readonly onRenameView?: (viewId: string, name: string) => void;
  /** Called to set a view as the default. */
  readonly onSetDefaultView?: (viewId: string) => void;
}

/** Note: View type icons have been moved to view-tabs.tsx */

/** Human-readable operator labels. */
const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  not_contains: "does not contain",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

/** Operators that don't need a value input. */
const NO_VALUE_OPS = new Set<FilterOperator>(["is_empty", "is_not_empty"]);

/**
 * Toolbar with view tabs, search, filter dropdown, and new record button.
 */
export function TableToolbar({
  schema,
  records,
  activeViewId,
  onViewChange,
  onNewRecord,
  onSearch,
  templates,
  folderTemplates,
  onFilterChange,
  sort,
  onSortChange,
  onSettingsSave,
  hiddenColumns,
  onToggleColumnVisibility,
  folderPaths,
  selectedCount,
  onDeleteSelected,
  onAddView,
  onDeleteView,
  onRenameView,
  onSetDefaultView,
}: TableToolbarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const [settingsName, setSettingsName] = useState(schema.name);
  const [settingsTemplateFolders, setSettingsTemplateFolders] = useState<TemplateFolderConfig[]>(
    [...(schema.templateFolders ?? [])]
  );
  const [templateFolderInput, setTemplateFolderInput] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(new Set());
  const [settingsDbViewType, setSettingsDbViewType] = useState(schema.dbViewType ?? "");
  const [settingsRecursive, setSettingsRecursive] = useState(schema.recursive ?? false);
  const [showFolderSuggestions, setShowFolderSuggestions] = useState(false);

  /** Handle search input changes. */
  const handleSearchInput = useCallback(
    (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      setSearchQuery(value);
      onSearch(value);
    },
    [onSearch]
  );

  /** Close filter dropdown on click-outside or Escape. */
  useEffect(() => {
    if (!showFilterDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filterContainerRef.current && !filterContainerRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [showFilterDropdown]);

  /** Close column visibility dropdown on click-outside or Escape. */
  useEffect(() => {
    if (!showColumnDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(e.target as Node)) {
        setShowColumnDropdown(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setShowColumnDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [showColumnDropdown]);

  /** Close sort dropdown on click-outside or Escape. */
  useEffect(() => {
    if (!showSortDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setShowSortDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [showSortDropdown]);

  /** Close settings dropdown on click-outside or Escape. */
  useEffect(() => {
    if (!showSettingsDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(e.target as Node)) {
        setShowSettingsDropdown(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setShowSettingsDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [showSettingsDropdown]);

  /** Ref for auto-save to avoid stale closures. */
  const onSettingsSaveRef = useRef(onSettingsSave);
  onSettingsSaveRef.current = onSettingsSave;
  const settingsInitialMount = useRef(true);
  /** Flag to skip auto-save when syncing state from an external schema change. */
  const isSyncingSettings = useRef(false);

  /** Sync settings state when schema changes externally. */
  useEffect(() => {
    isSyncingSettings.current = true;
    setSettingsName(schema.name);
    setSettingsTemplateFolders([...(schema.templateFolders ?? [])]);
    setSettingsDbViewType(schema.dbViewType ?? "");
    setSettingsRecursive(schema.recursive ?? false);
  }, [schema.name, schema.templateFolders, schema.dbViewType, schema.recursive]);

  /** Auto-save settings on every user-initiated state change. */
  useEffect(() => {
    if (!onSettingsSaveRef.current) return;
    if (settingsInitialMount.current) {
      settingsInitialMount.current = false;
      return;
    }
    if (isSyncingSettings.current) {
      isSyncingSettings.current = false;
      return;
    }
    const updates: { name?: string; templateFolders?: TemplateFolderConfig[]; dbViewType?: string; recursive?: boolean } = {};
    if (settingsName.trim() && settingsName.trim() !== schema.name) {
      updates.name = settingsName.trim();
    }
    updates.templateFolders = settingsTemplateFolders;
    const trimmedViewType = settingsDbViewType.trim();
    if (trimmedViewType !== (schema.dbViewType ?? "")) {
      updates.dbViewType = trimmedViewType || undefined;
    }
    if (settingsRecursive !== (schema.recursive ?? false)) {
      updates.recursive = settingsRecursive;
    }
    onSettingsSaveRef.current(updates);
  }, [settingsName, settingsTemplateFolders, settingsDbViewType, settingsRecursive, schema]);

  /** Add a template folder from the input. */
  const handleAddTemplateFolder = useCallback(() => {
    const path = templateFolderInput.trim();
    if (!path) return;
    if (settingsTemplateFolders.some((f) => f.path === path)) return;
    setSettingsTemplateFolders([...settingsTemplateFolders, { path }]);
    setTemplateFolderInput("");
    setExpandedFolders((prev) => new Set([...prev, path]));
  }, [templateFolderInput, settingsTemplateFolders]);

  /** Remove a template folder. */
  const handleRemoveTemplateFolder = useCallback((path: string) => {
    setSettingsTemplateFolders(settingsTemplateFolders.filter((f) => f.path !== path));
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, [settingsTemplateFolders]);

  /** Toggle a folder's expanded/collapsed state. */
  const handleToggleFolderExpanded = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); } else { next.add(path); }
      return next;
    });
  }, []);

  /** Toggle a template's enabled/disabled state within a folder. */
  const handleToggleTemplate = useCallback((folderPath: string, templateName: string) => {
    setSettingsTemplateFolders(settingsTemplateFolders.map((f) => {
      if (f.path !== folderPath) return f;
      const disabled = new Set(f.disabledTemplates ?? []);
      if (disabled.has(templateName)) {
        disabled.delete(templateName);
      } else {
        disabled.add(templateName);
      }
      return { ...f, disabledTemplates: disabled.size > 0 ? [...disabled] : undefined };
    }));
  }, [settingsTemplateFolders]);

  /** Clear the search input. */
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    onSearch("");
  }, [onSearch]);

  /** Add a new blank filter rule — picks the first column not already used. */
  const handleAddFilter = useCallback(() => {
    const usedColumns = new Set(filters.map((f) => f.column));
    const firstCol = schema.columns.find((c) => c.type !== "file" && !usedColumns.has(c.id))
      ?? schema.columns.find((c) => c.type !== "file");
    if (!firstCol) return;
    const newFilter: FilterRule = { column: firstCol.id, operator: "contains", value: "" };
    const updated = [...filters, newFilter];
    setFilters(updated);
    onFilterChange?.(updated);
  }, [filters, schema.columns, onFilterChange]);

  /** Update a filter at a given index. */
  const handleUpdateFilter = useCallback(
    (index: number, updates: Partial<FilterRule>) => {
      const updated = filters.map((f, i) =>
        i === index ? { ...f, ...updates } : f
      );
      setFilters(updated);
      onFilterChange?.(updated);
    },
    [filters, onFilterChange]
  );

  /** Remove a filter at a given index. */
  const handleRemoveFilter = useCallback(
    (index: number) => {
      const updated = filters.filter((_, i) => i !== index);
      setFilters(updated);
      onFilterChange?.(updated);
    },
    [filters, onFilterChange]
  );

  /** Get available operators for a column type. */
  const getOperatorsForColumn = (col: ColumnDefinition | undefined): FilterOperator[] => {
    if (!col) return ["contains", "is_empty", "is_not_empty"];
    switch (col.type) {
      case "number":
        return ["eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"];
      case "checkbox":
        return ["eq", "neq"];
      case "select":
      case "multi-select":
        return ["eq", "neq", "is_empty", "is_not_empty"];
      default:
        return ["eq", "neq", "contains", "not_contains", "is_empty", "is_not_empty"];
    }
  };

  /** Get unique non-empty values for a column from actual record data. */
  const getActualValues = useCallback((columnId: string): readonly string[] => {
    const valueSet = new Set<string>();
    for (const record of records) {
      const val = record.values[columnId];
      if (val === null || val === undefined || val === "") continue;
      if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === "string" && v) valueSet.add(v);
        }
      } else if (typeof val === "string") {
        valueSet.add(val);
      } else if (typeof val === "number" || typeof val === "boolean") {
        valueSet.add(String(val));
      }
    }
    return Array.from(valueSet).sort();
  }, [records]);

  const filterableColumns = schema.columns.filter((c) => c.type !== "file");
  const sortableColumns = schema.columns;
  const activeFilterCount = filters.length;

  return (
    <div class="database-toolbar">
      {/* Notion-style view tabs */}
      <ViewTabs
        views={schema.views}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onAddView={onAddView}
        onDeleteView={onDeleteView}
        onRenameView={onRenameView}
        onSetDefaultView={onSetDefaultView}
      />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Delete selected button — soft red, only visible when records are selected */}
      {(selectedCount ?? 0) > 0 && onDeleteSelected && (
        <button
          class="database-btn database-btn--delete"
          onClick={onDeleteSelected}
          title={`Delete ${selectedCount} selected`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
          <span style={{ marginLeft: "4px" }}>Delete ({selectedCount})</span>
        </button>
      )}

      {/* Search input with magnifying glass icon */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          style={{ position: "absolute", left: "6px", opacity: 0.45, pointerEvents: "none" }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder=""
          value={searchQuery}
          onInput={handleSearchInput}
          style={{
            padding: "4px 8px 4px 24px",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "var(--radius-s)",
            background: "var(--background-primary)",
            color: "var(--text-normal)",
            fontSize: "var(--font-ui-medium)",
            width: "140px",
          }}
        />
        {searchQuery && (
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            onClick={handleClearSearch}
            style={{
              position: "absolute",
              right: "6px",
              opacity: 0.45,
              cursor: "pointer",
            }}
            title="Clear search"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </div>

      {/* Sort button + dropdown */}
      {onSortChange && (
        <div ref={sortDropdownRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            style={(sort ?? []).length > 0 ? { color: "var(--interactive-accent)" } : undefined}
            title={(sort ?? []).length > 0 ? `Sort (${(sort ?? []).length} rule${(sort ?? []).length > 1 ? "s" : ""})` : "Sort records"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="4" x2="8" y2="20" />
              <polyline points="4 8 8 4 12 8" />
              <line x1="16" y1="4" x2="16" y2="20" />
              <polyline points="12 16 16 20 20 16" />
            </svg>
          </button>
          {showSortDropdown && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                zIndex: 50,
                minWidth: "320px",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "var(--radius-m)",
                boxShadow: "var(--shadow-s)",
                padding: "8px",
              }}
            >
              {(sort ?? []).length === 0 && (
                <div style={{ padding: "4px 8px", fontSize: "var(--font-ui-medium)", color: "var(--text-muted)" }}>
                  No sort rules. Click below to add one.
                </div>
              )}
              {(sort ?? []).map((rule, idx) => {
                const usedByOthers = new Set((sort ?? []).filter((_, i) => i !== idx).map((s) => s.column));
                const availableSortCols = sortableColumns.filter((c) => !usedByOthers.has(c.id) || c.id === rule.column);
                return (
                <div key={idx} style={{ display: "flex", gap: "4px", marginBottom: "4px", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--font-ui-medium)", color: "var(--text-muted)", width: "16px", textAlign: "center", flexShrink: 0 }}>
                    {idx === 0 ? "" : "then"}
                  </span>
                  <select
                    class="database-form-select"
                    style={{ flex: 1, padding: "3px 4px", fontSize: "var(--font-ui-medium)" }}
                    value={rule.column}
                    onChange={(e) => {
                      const updated = (sort ?? []).map((s, i) =>
                        i === idx ? { ...s, column: (e.target as HTMLSelectElement).value } : s
                      );
                      onSortChange(updated);
                    }}
                  >
                    {availableSortCols.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <select
                    class="database-form-select"
                    style={{ width: "90px", padding: "3px 4px", fontSize: "var(--font-ui-medium)" }}
                    value={rule.dir}
                    onChange={(e) => {
                      const updated = (sort ?? []).map((s, i) =>
                        i === idx ? { ...s, dir: (e.target as HTMLSelectElement).value as SortDirection } : s
                      );
                      onSortChange(updated);
                    }}
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                  <button
                    onClick={() => {
                      const updated = (sort ?? []).filter((_, i) => i !== idx);
                      onSortChange(updated.length > 0 ? updated : [{ column: "name", dir: "asc" }]);
                    }}
                    style={{ padding: "2px 6px", color: "var(--text-error)", flexShrink: 0 }}
                    title="Remove sort rule"
                  >
                    x
                  </button>
                </div>
                );
              })}
              <button
                onClick={() => {
                  const firstCol = sortableColumns.find(
                    (c) => !(sort ?? []).some((s) => s.column === c.id)
                  ) ?? sortableColumns[0];
                  if (!firstCol) return;
                  onSortChange([...(sort ?? []), { column: firstCol.id, dir: "asc" }]);
                }}
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  marginTop: "4px",
                  border: "1px dashed var(--background-modifier-border)",
                  borderRadius: "var(--radius-s)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "var(--font-ui-medium)",
                }}
              >
                + Add sort
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter button + dropdown */}
      <div ref={filterContainerRef} style={{ position: "relative", flexShrink: 0 }}>
        <button
          onClick={() => setShowFilterDropdown(!showFilterDropdown)}
          style={activeFilterCount > 0 ? { color: "var(--interactive-accent)" } : undefined}
          title={activeFilterCount > 0 ? `Filter (${activeFilterCount} active)` : "Filter records"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          {activeFilterCount > 0 && (
            <span style={{ marginLeft: "2px", fontSize: "0.75em" }}>{activeFilterCount}</span>
          )}
        </button>

        {showFilterDropdown && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              zIndex: 50,
              minWidth: "360px",
              background: "var(--background-primary)",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "var(--radius-m)",
              boxShadow: "var(--shadow-s)",
              padding: "8px",
            }}
          >
            {filters.map((filter, idx) => {
              const col = schema.columns.find((c) => c.id === filter.column);
              const ops = getOperatorsForColumn(col);
              const needsValue = !NO_VALUE_OPS.has(filter.operator);
              const isSelect = col?.type === "select" || col?.type === "multi-select";
              const usedByOtherFilters = new Set(filters.filter((_, i) => i !== idx).map((f) => f.column));
              const availableFilterCols = filterableColumns.filter((c) => !usedByOtherFilters.has(c.id) || c.id === filter.column);

              return (
                <div key={idx} style={{ display: "flex", gap: "4px", marginBottom: "4px", alignItems: "center" }}>
                  <select
                    class="database-form-select"
                    style={{ width: "100px", padding: "3px 4px", fontSize: "var(--font-ui-medium)" }}
                    value={filter.column}
                    onChange={(e) => handleUpdateFilter(idx, { column: (e.target as HTMLSelectElement).value })}
                  >
                    {availableFilterCols.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <select
                    class="database-form-select"
                    style={{ width: "110px", padding: "3px 4px", fontSize: "var(--font-ui-medium)" }}
                    value={filter.operator}
                    onChange={(e) => handleUpdateFilter(idx, { operator: (e.target as HTMLSelectElement).value as FilterOperator })}
                  >
                    {ops.map((op) => (
                      <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                    ))}
                  </select>
                  {needsValue && (() => {
                    const actualVals = getActualValues(filter.column);
                    const showDropdown = actualVals.length > 0 && actualVals.length <= 50;
                    return showDropdown ? (
                      <select
                        class="database-form-select"
                        style={{ flex: 1, padding: "3px 4px", fontSize: "var(--font-ui-medium)" }}
                        value={String(filter.value ?? "")}
                        onChange={(e) => handleUpdateFilter(idx, { value: (e.target as HTMLSelectElement).value })}
                      >
                        <option value="">--</option>
                        {actualVals.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        class="database-form-input"
                        style={{ flex: 1, padding: "3px 4px", fontSize: "var(--font-ui-medium)" }}
                        type={col?.type === "number" ? "number" : "text"}
                        value={String(filter.value ?? "")}
                        placeholder="value"
                        onInput={(e) => {
                          const raw = (e.target as HTMLInputElement).value;
                          const val = col?.type === "number" ? Number(raw) : raw;
                          handleUpdateFilter(idx, { value: val });
                        }}
                      />
                    );
                  })()}
                  <button
                    onClick={() => handleRemoveFilter(idx)}
                    style={{ padding: "2px 6px", color: "var(--text-error)", flexShrink: 0 }}
                    title="Remove filter"
                  >
                    x
                  </button>
                </div>
              );
            })}
            <button
              onClick={handleAddFilter}
              style={{
                width: "100%",
                padding: "4px 8px",
                marginTop: "4px",
                border: "1px dashed var(--background-modifier-border)",
                borderRadius: "var(--radius-s)",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "var(--font-ui-medium)",
              }}
            >
              + Add filter
            </button>
          </div>
        )}
      </div>

      {/* Column visibility dropdown */}
      {onToggleColumnVisibility && (
        <div ref={columnDropdownRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowColumnDropdown(!showColumnDropdown)}
            title="Toggle column visibility"
            style={{
              color: (hiddenColumns ?? []).filter((id) => id !== "db-view-type").length > 0 ? "var(--interactive-accent)" : undefined,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {showColumnDropdown && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                zIndex: 50,
                minWidth: "200px",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "var(--radius-m)",
                boxShadow: "var(--shadow-s)",
                padding: "4px",
              }}
            >
              {schema.columns.filter((c) => c.type !== "file").map((col) => {
                const isVisible = !(hiddenColumns ?? []).includes(col.id);
                return (
                  <label
                    key={col.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "4px 8px",
                      cursor: "pointer",
                      borderRadius: "var(--radius-s)",
                      fontSize: "var(--font-ui-medium)",
                    }}
                    class="template-picker-item"
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => onToggleColumnVisibility(col.id)}
                    />
                    <span style={{ opacity: isVisible ? 1 : 0.5 }}>{col.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Settings gear dropdown */}
      {onSettingsSave && (
        <div ref={settingsDropdownRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
            title="Database settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {showSettingsDropdown && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                zIndex: 50,
                minWidth: "260px",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "var(--radius-m)",
                boxShadow: "var(--shadow-s)",
                padding: "8px",
              }}
            >
              <div style={{ marginBottom: "6px" }}>
                <label style={{ fontSize: "var(--font-ui-medium)", color: "var(--text-muted)", fontWeight: 600 }}>Database Name</label>
                <input
                  class="database-form-input"
                  type="text"
                  value={settingsName}
                  onInput={(e) => setSettingsName((e.target as HTMLInputElement).value)}
                  style={{ width: "100%", padding: "3px 6px", fontSize: "var(--font-ui-medium)", marginTop: "2px" }}
                />
              </div>
              <div style={{ marginBottom: "6px" }}>
                <label style={{ fontSize: "var(--font-ui-medium)", color: "var(--text-muted)", fontWeight: 600 }}>Template Folders</label>
                <div style={{ display: "flex", gap: "4px", marginTop: "2px", position: "relative" }}>
                  <input
                    class="database-form-input"
                    type="text"
                    value={templateFolderInput}
                    onInput={(e) => {
                      setTemplateFolderInput((e.target as HTMLInputElement).value);
                      setShowFolderSuggestions(true);
                    }}
                    onFocus={() => setShowFolderSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowFolderSuggestions(false), 150)}
                    onKeyDown={(e) => { if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); handleAddTemplateFolder(); } }}
                    placeholder="path/to/templates"
                    style={{ flex: 1, padding: "3px 6px", fontSize: "var(--font-ui-medium)" }}
                  />
                  <button
                    onClick={handleAddTemplateFolder}
                    style={{
                      padding: "3px 8px",
                      fontSize: "var(--font-ui-medium)",
                      background: "var(--interactive-accent)",
                      color: "var(--text-on-accent)",
                      border: "none",
                      borderRadius: "var(--radius-s)",
                      cursor: "pointer",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    Add
                  </button>
                  {showFolderSuggestions && folderPaths && (() => {
                    const query = templateFolderInput.toLowerCase();
                    const existing = new Set(settingsTemplateFolders.map((f) => f.path));
                    const matches = folderPaths
                      .filter((p) => p.toLowerCase().includes(query) && !existing.has(p))
                      .slice(0, 8);
                    if (matches.length === 0) return null;
                    return (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          zIndex: 60,
                          background: "var(--background-primary)",
                          border: "1px solid var(--background-modifier-border)",
                          borderRadius: "var(--radius-s)",
                          boxShadow: "var(--shadow-s)",
                          maxHeight: "150px",
                          overflowY: "auto",
                        }}
                      >
                        {matches.map((path) => (
                          <div
                            key={path}
                            onClick={() => {
                              setTemplateFolderInput(path);
                              setShowFolderSuggestions(false);
                            }}
                            style={{ padding: "3px 6px", fontSize: "var(--font-ui-medium)", cursor: "pointer" }}
                            class="template-picker-item"
                          >
                            {path}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                {/* Accordion list of added folders */}
                {settingsTemplateFolders.map((folderConfig) => {
                  const isExpanded = expandedFolders.has(folderConfig.path);
                  const folderName = folderConfig.path.split("/").pop() ?? folderConfig.path;
                  const folderData = folderTemplates?.find((ft) => ft.folderPath === folderConfig.path);
                  const disabled = new Set(folderConfig.disabledTemplates ?? []);
                  return (
                    <div
                      key={folderConfig.path}
                      style={{
                        marginTop: "4px",
                        borderRadius: "var(--radius-s)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "3px 6px",
                          background: "none",
                          cursor: "pointer",
                          fontSize: "var(--font-ui-medium)",
                          gap: "4px",
                        }}
                        onClick={() => handleToggleFolderExpanded(folderConfig.path)}
                      >
                        <span style={{ fontSize: "var(--font-ui-medium)", width: "12px", textAlign: "center", flexShrink: 0 }}>
                          {isExpanded ? "\u25BC" : "\u25B6"}
                        </span>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={folderConfig.path}>
                          {folderName}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveTemplateFolder(folderConfig.path); }}
                          style={{ all: "unset", cursor: "pointer", flexShrink: 0, opacity: 0.6, display: "inline-flex", alignItems: "center" }}
                          title="Remove folder"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-muted)">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none" />
                          </svg>
                        </button>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: "2px 4px" }}>
                          {folderData && folderData.templates.length > 0 ? (
                            folderData.templates.map((t) => (
                              <label
                                key={t.path}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "2px 4px",
                                  cursor: "pointer",
                                  fontSize: "var(--font-ui-medium)",
                                  borderRadius: "var(--radius-s)",
                                }}
                                class="template-picker-item"
                              >
                                <input
                                  type="checkbox"
                                  checked={!disabled.has(t.name)}
                                  onChange={() => handleToggleTemplate(folderConfig.path, t.name)}
                                />
                                <span style={{ opacity: disabled.has(t.name) ? 0.5 : 1 }}>{t.name}</span>
                              </label>
                            ))
                          ) : (
                            <div style={{ padding: "2px 4px", fontSize: "var(--font-ui-medium)", color: "var(--text-muted)" }}>
                              No .md files found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label style={{ fontSize: "var(--font-ui-medium)", color: "var(--text-muted)", fontWeight: 600 }}>View Type Filter</label>
                <input
                  class="database-form-input"
                  type="text"
                  value={settingsDbViewType}
                  onInput={(e) => setSettingsDbViewType((e.target as HTMLInputElement).value)}
                  placeholder="e.g. projects, tasks"
                  style={{ width: "100%", padding: "3px 6px", fontSize: "var(--font-ui-medium)", marginTop: "2px" }}
                />
                <div style={{ fontSize: "var(--font-ui-medium)", color: "var(--text-faint)", marginTop: "2px" }}>
                  Only show files with matching db-view-type.
                </div>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "4px 0",
                  marginBottom: "8px",
                  cursor: "pointer",
                  fontSize: "var(--font-ui-medium)",
                }}
              >
                <input
                  type="checkbox"
                  checked={settingsRecursive}
                  onChange={() => setSettingsRecursive(!settingsRecursive)}
                />
                <span>Include subfolders</span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* New record button — split button with template picker when templates exist */}
      <TemplatePicker
        templates={templates ?? []}
        onSelect={onNewRecord}
      />
    </div>
  );
}
