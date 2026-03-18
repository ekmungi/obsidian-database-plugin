/** Table toolbar — view switcher, search, filter, and new record button. */

import { h } from "preact";
import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import type { DatabaseSchema, ViewType, ColumnDefinition, FilterRule, FilterOperator } from "../../../types/schema";
import type { DatabaseRecord, CellValue } from "../../../types/record";

/** Props for the TableToolbar component. */
interface TableToolbarProps {
  readonly schema: DatabaseSchema;
  readonly records: readonly DatabaseRecord[];
  readonly activeViewId: string;
  readonly onViewChange: (viewId: string) => void;
  readonly onNewRecord: () => void;
  readonly onSearch: (query: string) => void;
  readonly onFilterChange?: (filters: readonly FilterRule[]) => void;
  readonly onClearSort?: () => void;
  readonly sortCount?: number;
}

/** SVG icon components for each view type — monochrome, inherits currentColor. */
const VIEW_ICONS: Record<ViewType, () => h.JSX.Element> = {
  table: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),
  kanban: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="5" height="16" rx="1" />
      <rect x="10" y="3" width="5" height="10" rx="1" />
      <rect x="17" y="3" width="5" height="13" rx="1" />
    </svg>
  ),
  calendar: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};

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
  onFilterChange,
  onClearSort,
  sortCount,
}: TableToolbarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const filterContainerRef = useRef<HTMLDivElement>(null);

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

  /** Clear the search input. */
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    onSearch("");
  }, [onSearch]);

  /** Add a new blank filter rule. */
  const handleAddFilter = useCallback(() => {
    const firstCol = schema.columns.find((c) => c.type !== "file");
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
  const activeFilterCount = filters.length;

  return (
    <div class="database-toolbar">
      {/* View switcher tabs */}
      <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
        {schema.views.map((view) => {
          const isActive = view.id === activeViewId;
          const IconComponent = VIEW_ICONS[view.type];
          return (
            <button
              key={view.id}
              onClick={() => onViewChange(view.id)}
              style={
                isActive
                  ? { background: "var(--background-modifier-hover)", color: "var(--text-normal)" }
                  : undefined
              }
              title={view.name ?? view.type}
            >
              {IconComponent ? <IconComponent /> : <span>{view.type}</span>}
              <span>{view.name ?? view.type}</span>
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search input */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onInput={handleSearchInput}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "var(--radius-s)",
            background: "var(--background-primary)",
            color: "var(--text-normal)",
            fontSize: "var(--font-ui-small)",
            width: "140px",
          }}
        />
        {searchQuery && (
          <button
            onClick={handleClearSearch}
            style={{ position: "absolute", right: "4px", padding: "2px" }}
            title="Clear search"
          >
            x
          </button>
        )}
      </div>

      {/* Clear sort button — resets to name ascending */}
      {onClearSort && sortCount && sortCount > 0 && (
        <button
          onClick={onClearSort}
          title="Clear sort (reset to Name ascending)"
          style={{ flexShrink: 0 }}
        >
          <span>Clear sort</span>
        </button>
      )}

      {/* Filter button + dropdown */}
      <div ref={filterContainerRef} style={{ position: "relative", flexShrink: 0 }}>
        <button
          onClick={() => setShowFilterDropdown(!showFilterDropdown)}
          style={activeFilterCount > 0 ? { color: "var(--interactive-accent)" } : undefined}
          title="Filter records"
        >
          <span>Filter</span>
          {activeFilterCount > 0 && (
            <span style={{ marginLeft: "2px", fontSize: "0.8em" }}>({activeFilterCount})</span>
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

              return (
                <div key={idx} style={{ display: "flex", gap: "4px", marginBottom: "4px", alignItems: "center" }}>
                  <select
                    class="database-form-select"
                    style={{ width: "100px", padding: "3px 4px", fontSize: "12px" }}
                    value={filter.column}
                    onChange={(e) => handleUpdateFilter(idx, { column: (e.target as HTMLSelectElement).value })}
                  >
                    {filterableColumns.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <select
                    class="database-form-select"
                    style={{ width: "110px", padding: "3px 4px", fontSize: "12px" }}
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
                        style={{ flex: 1, padding: "3px 4px", fontSize: "12px" }}
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
                        style={{ flex: 1, padding: "3px 4px", fontSize: "12px" }}
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
                fontSize: "12px",
              }}
            >
              + Add filter
            </button>
          </div>
        )}
      </div>

      {/* New record button — prominent style */}
      <button
        onClick={onNewRecord}
        title="Create new record"
        style={{
          background: "var(--interactive-accent)",
          color: "var(--text-on-accent)",
          padding: "4px 12px",
          borderRadius: "var(--radius-s)",
          fontWeight: "600",
          flexShrink: 0,
        }}
      >
        + New
      </button>
    </div>
  );
}
