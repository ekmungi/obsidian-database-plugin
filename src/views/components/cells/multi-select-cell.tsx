/** Multi-select cell editor — toggle tags from a dropdown with in-use/available sections. */

import { h } from "preact";
import { useState, useCallback, useRef, useEffect, useMemo } from "preact/hooks";
import type { SelectOption, ColorKey } from "../../../types/schema";

/** Props for the MultiSelectCell component. */
interface MultiSelectCellProps {
  readonly value: readonly string[] | null;
  readonly options: readonly SelectOption[];
  /** All values for this column across all records — used to split in-use vs available. */
  readonly allRecordValues?: readonly string[];
  readonly onChange: (value: readonly string[]) => void;
  /** Called to add a new option to the schema and toggle it on. */
  readonly onAddOption?: (value: string, color: ColorKey) => void;
}

/**
 * Multi-select cell showing colored tags with a toggle dropdown.
 * Dropdown shows in-use options above a separator, then available options.
 */
export function MultiSelectCell({
  value,
  options,
  allRecordValues,
  onChange,
  onAddOption,
}: MultiSelectCellProps) {
  const [open, setOpen] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const selected = value ?? [];

  /** Close dropdown when clicking outside or pressing Escape. */
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [open]);

  /** Auto-focus the add input when it appears. */
  useEffect(() => {
    if (showAddInput && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [showAddInput]);

  /** Toggle the dropdown. */
  const handleClick = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  /** Toggle an option in/out of the selection. */
  const handleToggle = useCallback(
    (optionValue: string) => {
      const isSelected = selected.includes(optionValue);
      const next = isSelected
        ? selected.filter((v) => v !== optionValue)
        : [...selected, optionValue];
      onChange(next);
    },
    [selected, onChange]
  );

  /** Build a color lookup map for rendering tags. */
  const colorMap = new Map(options.map((o) => [o.value, o.color]));

  /** Split options into in-use and available sections. */
  const { inUseOptions, availableOptions } = useMemo(() => {
    if (!allRecordValues || allRecordValues.length === 0) {
      return { inUseOptions: options, availableOptions: [] as readonly SelectOption[] };
    }
    const inUseValues = new Set(allRecordValues);
    const inUse = options.filter((o) => inUseValues.has(o.value));
    const available = options.filter((o) => !inUseValues.has(o.value));
    return { inUseOptions: inUse, availableOptions: available };
  }, [options, allRecordValues]);

  /** Render a single option row with checkbox indicator and deselect X. */
  const renderOption = (opt: SelectOption) => {
    const isChecked = selected.includes(opt.value);
    return (
      <div
        key={opt.value}
        style={{
          padding: "4px 8px",
          cursor: "pointer",
          borderRadius: "var(--radius-s)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: isChecked
            ? "var(--background-modifier-hover)"
            : "transparent",
        }}
        onClick={() => handleToggle(opt.value)}
      >
        <span style={{ width: "14px" }}>
          {isChecked ? "\u2713" : ""}
        </span>
        <span class={`select-tag select-tag--${opt.color}`} style={{ flex: 1 }}>
          {opt.value}
        </span>
        {isChecked && (
          <span
            style={{
              fontSize: "var(--font-ui-smaller)",
              color: "var(--text-normal)",
              opacity: 0.7,
              padding: "0 2px",
              lineHeight: 1,
            }}
            title="Remove"
          >
            &#10005;
          </span>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        class="cell-display"
        onClick={handleClick}
        tabIndex={0}
        style={{ flexWrap: "wrap", gap: "4px" }}
      >
        {selected.length > 0 ? (
          selected.map((val) => (
            <span
              key={val}
              class={`select-tag select-tag--${colorMap.get(val) ?? "gray"}`}
            >
              {val}
            </span>
          ))
        ) : (
          <span style={{ color: "var(--text-faint)" }}>&nbsp;</span>
        )}
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 10,
            minWidth: "160px",
            background: "var(--background-primary)",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "var(--radius-s)",
            boxShadow: "var(--shadow-s)",
            padding: "4px",
          }}
        >
          {inUseOptions.map(renderOption)}
          {availableOptions.length > 0 && inUseOptions.length > 0 && (
            <div style={{
              borderTop: "1px solid var(--background-modifier-border)",
              margin: "4px 0",
              paddingTop: "2px",
            }}>
              <div style={{
                padding: "2px 8px",
                fontSize: "var(--font-ui-smaller)",
                color: "var(--text-muted)",
              }}>
                Available
              </div>
            </div>
          )}
          {availableOptions.map(renderOption)}
          {onAddOption && (
            <div style={{
              borderTop: "1px solid var(--background-modifier-border)",
              marginTop: "4px",
              paddingTop: "4px",
            }}>
              {!showAddInput ? (
                <div
                  style={{
                    padding: "4px 8px",
                    cursor: "pointer",
                    borderRadius: "var(--radius-s)",
                    fontSize: "var(--font-ui-small)",
                    color: "var(--text-accent)",
                  }}
                  onClick={() => setShowAddInput(true)}
                >
                  + Add new option
                </div>
              ) : (
                <div style={{ padding: "4px 8px", display: "flex", gap: "4px" }}>
                  <input
                    ref={addInputRef}
                    class="database-form-input"
                    type="text"
                    value={newOptionValue}
                    onInput={(e) => setNewOptionValue((e.target as HTMLInputElement).value)}
                    placeholder="Option name"
                    style={{ flex: 1, padding: "2px 6px", fontSize: "var(--font-ui-small)" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newOptionValue.trim()) {
                        onAddOption(newOptionValue.trim(), "gray");
                        onChange([...selected, newOptionValue.trim()]);
                        setNewOptionValue("");
                        setShowAddInput(false);
                      }
                      if (e.key === "Escape") {
                        setShowAddInput(false);
                        setNewOptionValue("");
                      }
                    }}
                  />
                  <button
                    class="database-btn database-btn--primary"
                    style={{ padding: "2px 8px", fontSize: "var(--font-ui-small)" }}
                    onClick={() => {
                      if (!newOptionValue.trim()) return;
                      onAddOption(newOptionValue.trim(), "gray");
                      onChange([...selected, newOptionValue.trim()]);
                      setNewOptionValue("");
                      setShowAddInput(false);
                    }}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
