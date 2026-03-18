/** Checkbox cell — direct toggle, no edit mode needed. */

import { h } from "preact";
import { useCallback } from "preact/hooks";

/** Props for the CheckboxCell component. */
interface CheckboxCellProps {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}

/**
 * Simple checkbox that toggles on click.
 * @param props.value - Current boolean state.
 * @param props.onChange - Called with the inverted value on toggle.
 */
export function CheckboxCell({ value, onChange }: CheckboxCellProps) {
  /** Toggle the checkbox value. */
  const handleChange = useCallback(() => {
    onChange(!value);
  }, [value, onChange]);

  return (
    <input
      class="cell-checkbox"
      type="checkbox"
      checked={value}
      onChange={handleChange}
    />
  );
}
