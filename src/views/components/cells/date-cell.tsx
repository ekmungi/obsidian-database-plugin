/** Date cell editor — native date input. */

import { h } from "preact";
import { useState, useCallback, useRef } from "preact/hooks";

/** Props for the DateCell component. */
interface DateCellProps {
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
}

/**
 * Inline date editor using a native HTML date input.
 * @param props.value - ISO date string (YYYY-MM-DD) or null.
 * @param props.onChange - Called with new date string or null when cleared.
 */
export function DateCell({ value, onChange }: DateCellProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Enter edit mode and focus the input. */
  const handleClick = useCallback(() => {
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  /** Commit the date value on change. */
  const handleChange = useCallback(
    (e: Event) => {
      const newValue = (e.target as HTMLInputElement).value;
      onChange(newValue || null);
    },
    [onChange]
  );

  /** Close editor on blur. */
  const handleBlur = useCallback(() => {
    setEditing(false);
  }, []);

  /** Close on Escape. */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setEditing(false);
    }
  }, []);

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="cell-editor"
        type="date"
        value={value ?? ""}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    );
  }

  /** Format date for display (localized). */
  const displayValue = value
    ? new Date(value + "T00:00:00").toLocaleDateString()
    : "";

  return (
    <div class="cell-display" onClick={handleClick}>
      {displayValue}
    </div>
  );
}
