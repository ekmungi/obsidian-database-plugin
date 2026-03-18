/** Select cell editor — dropdown with colored option tags, closes on click-outside. */

import { h } from "preact";
import { useState, useCallback, useRef, useEffect } from "preact/hooks";
import type { SelectOption } from "../../../types/schema";

/** Props for the SelectCell component. */
interface SelectCellProps {
  readonly value: string | null;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string | null) => void;
}

/**
 * Single-select cell with colored tag display and dropdown editor.
 * Closes on click-outside or Escape.
 */
export function SelectCell({ value, options, onChange }: SelectCellProps) {
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
          {options.map((opt) => (
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
        </div>
      )}
    </div>
  );
}
