/** Text cell editor — click to edit, blur to save. */

import { h } from "preact";
import { useState, useCallback, useRef } from "preact/hooks";

/** Props for the TextCell component. */
interface TextCellProps {
  readonly value: string | null;
  readonly onChange: (value: string) => void;
}

/**
 * Inline text editor that toggles between display and edit mode.
 * @param props.value - Current text value (null renders as empty).
 * @param props.onChange - Called with new value on blur or Enter.
 */
export function TextCell({ value, onChange }: TextCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  /** Enter edit mode and sync draft with current value. */
  const handleClick = useCallback(() => {
    setDraft(value ?? "");
    setEditing(true);
    // Focus after render
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [value]);

  /** Commit edit on blur. */
  const handleBlur = useCallback(() => {
    setEditing(false);
    if (draft !== (value ?? "")) {
      onChange(draft);
    }
  }, [draft, value, onChange]);

  /** Commit on Enter, cancel on Escape. */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        (e.target as HTMLInputElement).blur();
      } else if (e.key === "Escape") {
        setDraft(value ?? "");
        setEditing(false);
      }
    },
    [value]
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="cell-editor"
        type="text"
        value={draft}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div class="cell-display" onClick={handleClick}>
      {value ?? ""}
    </div>
  );
}
