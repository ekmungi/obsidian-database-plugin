/** Split button for creating new records with optional template selection.
 *  Shows a "+ New" button with a dropdown arrow for template browsing. */

import { h } from "preact";
import { useState, useCallback, useRef, useEffect } from "preact/hooks";
import type { Template } from "../../../data/template-scanner";

/** Props for the TemplatePicker component. */
interface TemplatePickerProps {
  /** Available templates for new record creation. */
  readonly templates: readonly Template[];
  /** Called with the selected template path, or null for blank (no template). */
  readonly onSelect: (templatePath: string | null) => void;
}

/**
 * Split button component: main "+ New" button creates a blank record,
 * dropdown arrow reveals template list. If no templates exist, renders
 * a plain "+ New" button (caller should handle this, but we guard here too).
 *
 * @param props - templates list and onSelect callback
 * @returns Preact VNode for the template picker
 */
export function TemplatePicker({ templates, onSelect }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  /** Main button always creates a blank record (no template). */
  const handleMainClick = useCallback(() => {
    onSelect(null);
  }, [onSelect]);

  /** Toggle the dropdown menu. */
  const toggleDropdown = useCallback(() => {
    setOpen((prev) => !prev);
    setSearch("");
  }, []);

  /** Select a specific template and close dropdown. */
  const handleItemClick = useCallback(
    (path: string) => {
      onSelect(path);
      setOpen(false);
      setSearch("");
    },
    [onSelect],
  );

  /** Select "no template" option from dropdown. */
  const handleBlankClick = useCallback(() => {
    onSelect(null);
    setOpen(false);
    setSearch("");
  }, [onSelect]);

  /** Update search filter text. */
  const handleSearchChange = useCallback(
    (e: Event) => {
      const target = e.target as HTMLInputElement;
      setSearch(target.value);
    },
    [],
  );

  /** Close dropdown on click-outside or Escape. */
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [open]);

  /** Filter templates by search query (case-insensitive). */
  const filtered = search
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()),
      )
    : templates;

  /* Plain button when no templates exist */
  if (templates.length === 0) {
    return (
      <button
        class="database-btn database-btn--primary"
        onClick={handleMainClick}
        title="Create new record"
        style={{
          background: "var(--interactive-accent)",
          color: "var(--text-on-accent)",
          padding: "4px 12px",
          borderRadius: "var(--radius-s)",
          fontWeight: "600",
        }}
      >
        + New
      </button>
    );
  }

  return (
    <div class="template-picker" ref={containerRef} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        onClick={handleMainClick}
        title="Create blank record"
        style={{
          background: "var(--interactive-accent)",
          color: "var(--text-on-accent)",
          padding: "4px 12px 4px 12px",
          borderRadius: "var(--radius-s) 0 0 var(--radius-s)",
          fontWeight: "600",
          border: "none",
          cursor: "pointer",
        }}
      >
        + New
      </button>
      <button
        onClick={toggleDropdown}
        aria-label="Choose template"
        title="Create from template"
        style={{
          background: "var(--interactive-accent)",
          color: "var(--text-on-accent)",
          padding: "4px 6px",
          borderRadius: "0 var(--radius-s) var(--radius-s) 0",
          borderLeft: "1px solid rgba(255,255,255,0.2)",
          fontWeight: "600",
          border: "none",
          borderLeftStyle: "solid",
          borderLeftWidth: "1px",
          borderLeftColor: "rgba(255,255,255,0.2)",
          cursor: "pointer",
        }}
      >
        &#9662;
      </button>

      {open && (
        <div
          class="template-picker-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            zIndex: 50,
            minWidth: "220px",
            background: "var(--background-primary)",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "var(--radius-m)",
            boxShadow: "var(--shadow-s)",
            padding: "4px",
            marginTop: "2px",
          }}
        >
          {templates.length > 5 && (
            <input
              class="database-form-input"
              type="text"
              placeholder="Search templates..."
              value={search}
              onInput={handleSearchChange}
              autoFocus
              style={{ width: "100%", padding: "4px 6px", fontSize: "var(--font-ui-medium)", marginBottom: "4px" }}
            />
          )}
          <div
            class="template-picker-item"
            onClick={handleBlankClick}
            style={{
              padding: "4px 8px",
              cursor: "pointer",
              borderRadius: "var(--radius-s)",
              fontSize: "var(--font-ui-medium)",
              color: "var(--text-muted)",
            }}
          >
            Blank (no template)
          </div>
          {filtered.map((t) => (
            <div
              key={t.path}
              class="template-picker-item"
              onClick={() => handleItemClick(t.path)}
              style={{
                padding: "4px 8px",
                cursor: "pointer",
                borderRadius: "var(--radius-s)",
                fontSize: "var(--font-ui-medium)",
              }}
            >
              {t.name}
            </div>
          ))}
          {filtered.length === 0 && search && (
            <div
              class="template-picker-item"
              style={{ padding: "4px 8px", color: "var(--text-muted)", fontSize: "var(--font-ui-medium)" }}
            >
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}
