/** Select cell editor — dropdown with colored option tags, in-use/available sections. */

import { h } from "preact";
import { useState, useCallback, useRef, useEffect, useMemo } from "preact/hooks";
import type { SelectOption, ColorKey } from "../../../types/schema";

/** Props for the SelectCell component. */
interface SelectCellProps {
  readonly value: string | null;
  readonly options: readonly SelectOption[];
  /** All values for this column across all records — used to split in-use vs available. */
  readonly allRecordValues?: readonly string[];
  readonly onChange: (value: string | null) => void;
  /** Called to add a new option to the schema and select it. */
  readonly onAddOption?: (value: string, color: ColorKey) => void;
}

/**
 * Single-select cell with colored tag display and dropdown editor.
 * Dropdown shows in-use options above a separator, then available options.
 */
export function SelectCell({ value, options, allRecordValues, onChange, onAddOption }: SelectCellProps) {
  const [open, setOpen] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

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

  /** Split options into selected (current value) and unselected. */
  const { unselectedOptions } = useMemo(() => {
    const unsel = options.filter((o) => o.value !== value);
    return { unselectedOptions: unsel };
  }, [options, value]);

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
          {/* Selected option at top with X to deselect */}
          {selectedOption && (
            <div
              style={{
                padding: "4px 8px",
                cursor: "pointer",
                borderRadius: "var(--radius-s)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "var(--background-modifier-hover)",
              }}
              onClick={() => handleSelect(selectedOption.value)}
            >
              <span class={`select-tag select-tag--${selectedOption.color}`} style={{ flex: 1 }}>
                {selectedOption.value}
              </span>
              <span
                style={{
                  fontSize: "var(--font-ui-medium)",
                  color: "var(--text-normal)",
                  opacity: 0.7,
                  padding: "0 4px",
                  lineHeight: 1,
                }}
                title="Deselect"
              >
                &#10005;
              </span>
            </div>
          )}
          {/* Separator */}
          {selectedOption && unselectedOptions.length > 0 && (
            <div style={{
              borderTop: "1px solid var(--background-modifier-border)",
              margin: "4px 0",
            }} />
          )}
          {/* Unselected options */}
          {unselectedOptions.map((opt) => (
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
          ))}
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
                    fontSize: "var(--font-ui-medium)",
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
                    style={{ flex: 1, padding: "2px 6px", fontSize: "var(--font-ui-medium)" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newOptionValue.trim()) {
                        onAddOption(newOptionValue.trim(), "gray");
                        onChange(newOptionValue.trim());
                        setNewOptionValue("");
                        setShowAddInput(false);
                        setOpen(false);
                      }
                      if (e.key === "Escape") {
                        setShowAddInput(false);
                        setNewOptionValue("");
                      }
                    }}
                  />
                  <button
                    class="database-btn database-btn--primary"
                    style={{ padding: "2px 8px", fontSize: "var(--font-ui-medium)" }}
                    onClick={() => {
                      if (!newOptionValue.trim()) return;
                      onAddOption(newOptionValue.trim(), "gray");
                      onChange(newOptionValue.trim());
                      setNewOptionValue("");
                      setShowAddInput(false);
                      setOpen(false);
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
