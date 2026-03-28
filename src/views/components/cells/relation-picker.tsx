/** Searchable dropdown picker for relation targets — mirrors select/multi-select pattern. */

import { h } from "preact";
import { useState, useCallback, useRef, useEffect, useMemo } from "preact/hooks";

/** Props for the RelationPicker component. */
interface RelationPickerProps {
  /** All available target record names. */
  readonly targetRecords: readonly string[];
  /** Currently selected note names. */
  readonly selected: readonly string[];
  /** Whether multiple selections are allowed. */
  readonly multiple: boolean;
  /** Called when a name is selected or deselected. */
  readonly onSelect: (names: readonly string[]) => void;
  /** Called to close the picker. */
  readonly onClose: () => void;
  /** Called to create a new record in the target folder. Returns when file is created and cache refreshed. */
  readonly onCreate?: (name: string) => Promise<void>;
}

/**
 * Searchable dropdown for picking relation targets.
 * For multiple: selected at top with X, separator, unselected below.
 * For single: selected at top with X to deselect, unselected below.
 * @param props - targetRecords, selected, multiple, onSelect, onClose
 */
export function RelationPicker({
  targetRecords,
  selected,
  multiple,
  onSelect,
  onClose,
  onCreate,
}: RelationPickerProps) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Auto-focus search input on mount. */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** Close on outside click or Escape. */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [onClose]);

  /** Filter target records by search query. */
  const lowerQuery = query.toLowerCase();

  /** Split into selected and unselected, filtered by query. */
  const { selectedNames, unselectedNames } = useMemo(() => {
    const selSet = new Set(selected);
    const sel = targetRecords.filter((n) => selSet.has(n));
    const unsel = targetRecords
      .filter((n) => !selSet.has(n))
      .filter((n) => !lowerQuery || n.toLowerCase().includes(lowerQuery));
    return { selectedNames: sel, unselectedNames: unsel };
  }, [targetRecords, selected, lowerQuery]);

  /** Handle selecting a name. */
  const handleSelect = useCallback(
    (name: string) => {
      if (multiple) {
        onSelect([...selected, name]);
      } else {
        onSelect([name]);
      }
    },
    [selected, multiple, onSelect]
  );

  /** Handle deselecting a name. */
  const handleDeselect = useCallback(
    (name: string) => {
      onSelect(selected.filter((n) => n !== name));
    },
    [selected, onSelect]
  );

  /** Handle creating a new record, wait for file creation, then select it. */
  const handleCreate = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || !onCreate) return;
    await onCreate(trimmed);
    if (multiple) {
      onSelect([...selected, trimmed]);
    } else {
      onSelect([trimmed]);
    }
    setQuery("");
  }, [query, onCreate, multiple, selected, onSelect]);

  /** Whether the query matches an existing record name (case-insensitive). */
  const queryMatchesExisting = useMemo(() => {
    if (!query.trim()) return true;
    const lower = query.trim().toLowerCase();
    return targetRecords.some((n) => n.toLowerCase() === lower);
  }, [query, targetRecords]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        zIndex: 10,
        minWidth: "200px",
        maxHeight: "300px",
        overflowY: "auto",
        background: "var(--background-primary)",
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "var(--radius-s)",
        boxShadow: "var(--shadow-s)",
        padding: "4px",
      }}
    >
      {/* Search input */}
      <div style={{ padding: "4px" }}>
        <input
          ref={inputRef}
          class="database-form-input"
          type="text"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="Search..."
          style={{ width: "100%", padding: "4px 8px", fontSize: "var(--font-ui-medium)" }}
        />
      </div>

      {/* Selected names at top with X to remove */}
      {selectedNames.map((name) => (
        <div
          key={name}
          style={{
            padding: "4px 8px",
            cursor: "pointer",
            borderRadius: "var(--radius-s)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "var(--background-modifier-hover)",
          }}
          onClick={() => handleDeselect(name)}
        >
          <span class="database-link" style={{ flex: 1, pointerEvents: "none" }}>
            {name}
          </span>
          <span
            style={{
              fontSize: "var(--font-ui-medium)",
              color: "var(--text-normal)",
              opacity: 0.7,
              padding: "0 4px",
              lineHeight: 1,
            }}
            title="Remove"
          >
            &#10005;
          </span>
        </div>
      ))}

      {/* Separator */}
      {selectedNames.length > 0 && unselectedNames.length > 0 && (
        <div style={{
          borderTop: "1px solid var(--background-modifier-border)",
          margin: "4px 0",
        }} />
      )}

      {/* Unselected names */}
      {unselectedNames.map((name) => (
        <div
          key={name}
          style={{
            padding: "4px 8px",
            cursor: "pointer",
            borderRadius: "var(--radius-s)",
          }}
          onClick={() => handleSelect(name)}
        >
          <span class="database-link" style={{ pointerEvents: "none" }}>
            {name}
          </span>
        </div>
      ))}

      {/* Create new entry — shown when query doesn't match any existing name */}
      {onCreate && query.trim() && !queryMatchesExisting && (
        <div style={{
          borderTop: (selectedNames.length > 0 || unselectedNames.length > 0) ? "1px solid var(--background-modifier-border)" : undefined,
          marginTop: (selectedNames.length > 0 || unselectedNames.length > 0) ? "4px" : undefined,
          paddingTop: (selectedNames.length > 0 || unselectedNames.length > 0) ? "4px" : undefined,
        }}>
          <div
            style={{
              padding: "4px 8px",
              cursor: "pointer",
              borderRadius: "var(--radius-s)",
              fontSize: "var(--font-ui-medium)",
              color: "var(--text-accent)",
            }}
            onClick={() => { void handleCreate(); }}
          >
            + Create "{query.trim()}"
          </div>
        </div>
      )}

      {/* Empty state */}
      {unselectedNames.length === 0 && selectedNames.length === 0 && !query.trim() && (
        <div style={{
          padding: "8px",
          color: "var(--text-muted)",
          fontSize: "var(--font-ui-medium)",
          textAlign: "center",
        }}>
          No records found
        </div>
      )}
    </div>
  );
}
