/** Select cell editor — dropdown with colored option tags, in-use/available sections. */

import { h } from "preact";
import { useState, useCallback, useRef, useEffect, useMemo } from "preact/hooks";
import type { SelectOption } from "../../../types/schema";

/** Props for the SelectCell component. */
interface SelectCellProps {
  readonly value: string | null;
  readonly options: readonly SelectOption[];
  /** All values for this column across all records — used to split in-use vs available. */
  readonly allRecordValues?: readonly string[];
  readonly onChange: (value: string | null) => void;
}

/**
 * Single-select cell with colored tag display and dropdown editor.
 * Dropdown shows in-use options above a separator, then available options.
 */
export function SelectCell({ value, options, allRecordValues, onChange }: SelectCellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  /** Toggle the dropdown open/closed. */
  const handleClick = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  /** Select an option and close dropdown. */
  const handleSelect = useCallback(
    (optionValue: string) => {
      const newValue = optionValue === value ? null : optionValue;
      onChange(newValue);
      setOpen(false);
    },
    [value, onChange]
  );

  /** Find the matching option for the current value. */
  const selectedOption = value
    ? options.find((o) => o.value === value)
    : null;

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

  /** Render a single option row. */
  const renderOption = (opt: SelectOption) => (
    <div
      key={opt.value}
      style={{
        padding: "4px 8px",
        cursor: "pointer",
        borderRadius: "var(--radius-s)",
      }}
      onClick={() => handleSelect(opt.value)}
    >
      <span class={`select-tag select-tag--${opt.color}`}>
        {opt.value}
      </span>
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div class="cell-display" onClick={handleClick} tabIndex={0}>
        {selectedOption ? (
          <span class={`select-tag select-tag--${selectedOption.color}`}>
            {selectedOption.value}
          </span>
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
            minWidth: "140px",
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
        </div>
      )}
    </div>
  );
}
