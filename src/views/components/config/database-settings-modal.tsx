/** Modal for editing database-level settings (name, template folder).
 *  Reuses the shared modal CSS classes from column-config-modal. */

import { h } from "preact";
import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import type { DatabaseSchema } from "../../../types/schema";

interface DatabaseSettingsModalProps {
  /** Current database schema (read-only reference for initial values). */
  readonly schema: DatabaseSchema;
  /** Called with the updated fields on save. */
  readonly onSave: (updates: { name?: string; templateFolder?: string; dbViewType?: string }) => void;
  /** Called to close the modal without saving. */
  readonly onClose: () => void;
}

/**
 * Modal dialog for editing database-level settings.
 * Currently supports: database name and template folder path.
 *
 * @param props - schema, onSave, onClose
 * @returns Preact VNode for the settings modal
 */
export function DatabaseSettingsModal({
  schema,
  onSave,
  onClose,
}: DatabaseSettingsModalProps) {
  const [name, setName] = useState(schema.name);
  const [templateFolder, setTemplateFolder] = useState(
    schema.templateFolder ?? "",
  );
  const [dbViewType, setDbViewType] = useState(schema.dbViewType ?? "");

  /** Ref for auto-save to avoid stale closures. */
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const isInitialMount = useRef(true);

  /** Auto-save on every state change after initial mount. */
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const updates: { name?: string; templateFolder?: string; dbViewType?: string } = {};
    if (name.trim() && name.trim() !== schema.name) {
      updates.name = name.trim();
    }
    const trimmedFolder = templateFolder.trim();
    if (trimmedFolder !== (schema.templateFolder ?? "")) {
      updates.templateFolder = trimmedFolder || undefined;
    }
    const trimmedViewType = dbViewType.trim();
    if (trimmedViewType !== (schema.dbViewType ?? "")) {
      updates.dbViewType = trimmedViewType || undefined;
    }
    onSaveRef.current(updates);
  }, [name, templateFolder, dbViewType, schema]);

  /** Close on backdrop click. */
  const handleBackdropClick = useCallback(
    (e: Event) => {
      if (
        (e.target as HTMLElement).classList.contains("database-modal-overlay")
      ) {
        onClose();
      }
    },
    [onClose],
  );

  /** Close on Escape key. */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div class="database-modal-overlay" onClick={handleBackdropClick}>
      <div class="database-modal">
        {/* Header */}
        <div class="database-modal-header">
          <span>Database Settings</span>
          <button class="database-btn database-btn--ghost" onClick={onClose}>
            &#10005;
          </button>
        </div>

        {/* Body */}
        <div class="database-modal-body">
          {/* Database name */}
          <div class="database-form-group">
            <label class="database-form-label">Database Name</label>
            <input
              class="database-form-input"
              type="text"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              placeholder="My Database"
              autoFocus
            />
          </div>

          {/* Template folder */}
          <div class="database-form-group">
            <label class="database-form-label">Template Folder</label>
            <input
              class="database-form-input"
              type="text"
              value={templateFolder}
              onInput={(e) =>
                setTemplateFolder((e.target as HTMLInputElement).value)
              }
              placeholder="path/to/templates (optional)"
            />
            <div
              style={{
                fontSize: "var(--font-ui-medium)",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              Folder containing note templates for new records.
            </div>
          </div>

          {/* Database view type filter */}
          <div class="database-form-group">
            <label class="database-form-label">Database View Type</label>
            <input
              class="database-form-input"
              type="text"
              value={dbViewType}
              onInput={(e) =>
                setDbViewType((e.target as HTMLInputElement).value)
              }
              placeholder="e.g. projects, tasks, contacts"
            />
            <div
              style={{
                fontSize: "var(--font-ui-medium)",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              Only show files where db-view-type matches this value. Leave empty
              to show all files.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div class="database-modal-footer">
          <button class="database-btn database-btn--ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
