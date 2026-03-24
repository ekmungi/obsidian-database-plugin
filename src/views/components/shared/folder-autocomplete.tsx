/** Folder autocomplete input — searchable dropdown of vault folder paths. */

import { h } from "preact";
import { useState, useCallback, useRef, useEffect, useMemo } from "preact/hooks";

/** Props for the FolderAutocomplete component. */
interface FolderAutocompleteProps {
  /** Current folder path value. */
  readonly value: string;
  /** Called when the user selects or types a folder path. */
  readonly onChange: (value: string) => void;
  /** All available vault folder paths. */
  readonly folderPaths: readonly string[];
  /** Input placeholder text. */
  readonly placeholder?: string;
}

/**
 * Text input with a dropdown of matching vault folders.
 * Opens on focus, filters as user types, closes on blur/outside-click/Escape.
 * @param props - value, onChange, folderPaths, placeholder
 */
export function FolderAutocomplete({
  value,
  onChange,
  folderPaths,
  placeholder = "path/to/folder",
}: FolderAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Filter folders by the current input value. */
  const filteredPaths = useMemo(() => {
    const lower = value.toLowerCase();
    if (!lower) return folderPaths;
    return folderPaths.filter((p) => p.toLowerCase().includes(lower));
  }, [folderPaths, value]);

  /** Close dropdown on outside click. */
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [open]);

  /** Handle input changes — update value and open dropdown. */
  const handleInput = useCallback(
    (e: Event) => {
      onChange((e.target as HTMLInputElement).value);
      setOpen(true);
    },
    [onChange]
  );

  /** Handle focus — open the dropdown. */
  const handleFocus = useCallback(() => {
    setOpen(true);
  }, []);

  /** Handle blur — close after a short delay to allow click on dropdown items. */
  const handleBlur = useCallback(() => {
    // Delay to allow mousedown on dropdown item to fire first
    setTimeout(() => {
      if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
        setOpen(false);
      }
    }, 150);
  }, []);

  /** Handle keyboard — close on Escape. */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      inputRef.current?.blur();
    }
  }, []);

  /** Select a folder path from the dropdown. */
  const handleSelect = useCallback(
    (path: string) => {
      onChange(path);
      setOpen(false);
    },
    [onChange]
  );

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        class="database-form-input"
        type="text"
        value={value}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />

      {open && filteredPaths.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 20,
            maxHeight: "200px",
            overflowY: "auto",
            background: "var(--background-primary)",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "var(--radius-s)",
            boxShadow: "var(--shadow-s)",
            padding: "4px",
          }}
        >
          {filteredPaths.map((path) => (
            <div
              key={path}
              style={{
                padding: "4px 8px",
                cursor: "pointer",
                borderRadius: "var(--radius-s)",
                fontSize: "var(--font-ui-medium)",
                background: path === value ? "var(--background-modifier-hover)" : undefined,
              }}
              onMouseDown={(e) => {
                // Prevent blur from firing before selection
                e.preventDefault();
                handleSelect(path);
              }}
            >
              {path}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
