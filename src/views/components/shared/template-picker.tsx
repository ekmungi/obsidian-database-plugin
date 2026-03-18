/** Split button for creating new records with optional template selection.
 *  Shows a "New" button with a dropdown arrow for template browsing. */

import { h } from "preact";
import { useState, useCallback, useRef } from "preact/hooks";

interface Template {
  readonly name: string;
  readonly path: string;
}

interface TemplatePickerProps {
  /** Available templates for new record creation. */
  readonly templates: readonly Template[];
  /** Called with the selected template path, or null for no template. */
  readonly onSelect: (templatePath: string | null) => void;
}

/**
 * Split button component: main "New" button plus dropdown arrow for templates.
 * If no templates are configured, renders a plain "New" button.
 *
 * @param props - templates list and onSelect callback
 * @returns Preact VNode for the template picker
 */
export function TemplatePicker({ templates, onSelect }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  /** Create with default template (first in list, or null). */
  const handleMainClick = useCallback(() => {
    const defaultPath = templates.length > 0 ? templates[0].path : null;
    onSelect(defaultPath);
  }, [templates, onSelect]);

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

  /** Select "no template" option. */
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

  /** Filter templates by search query (case-insensitive). */
  const filtered = search
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()),
      )
    : templates;

  /* Plain button when no templates exist */
  if (templates.length === 0) {
    return (
      <button class="database-btn database-btn--primary" onClick={handleMainClick}>
        New
      </button>
    );
  }

  return (
    <div class="template-picker" ref={containerRef}>
      <button class="database-btn database-btn--primary" onClick={handleMainClick}>
        New
      </button>
      <button
        class="database-btn database-btn--primary"
        style={{ paddingLeft: "4px", paddingRight: "4px", borderLeft: "1px solid rgba(255,255,255,0.2)" }}
        onClick={toggleDropdown}
        aria-label="Choose template"
      >
        &#9662;
      </button>

      {open && (
        <div class="template-picker-dropdown">
          <input
            class="database-form-input"
            type="text"
            placeholder="Search templates..."
            value={search}
            onInput={handleSearchChange}
            autoFocus
          />
          <div class="template-picker-item" onClick={handleBlankClick}>
            Blank (no template)
          </div>
          {filtered.map((t) => (
            <div
              key={t.path}
              class="template-picker-item"
              onClick={() => handleItemClick(t.path)}
            >
              {t.name}
            </div>
          ))}
          {filtered.length === 0 && search && (
            <div class="template-picker-item" style={{ color: "var(--text-muted)" }}>
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}
