/** Modal for editing database-level settings (name, template folder).
 *  Reuses the shared modal CSS classes from column-config-modal. */

import { h } from "preact";
import { useState, useCallback } from "preact/hooks";
import type { DatabaseSchema } from "../../../types/schema";

interface DatabaseSettingsModalProps {
  /** Current database schema (read-only reference for initial values). */
  readonly schema: DatabaseSchema;
  /** Called with the updated fields on save. */
  readonly onSave: (updates: { name?: string; templateFolder?: string }) => void;
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

  /** Persist changes and close. */
  const handleSave = useCallback(() => {
    const updates: { name?: string; templateFolder?: string } = {};

    if (name.trim() && name.trim() !== schema.name) {
      updates.name = name.trim();
    }
    const trimmedFolder = templateFolder.trim();
    if (trimmedFolder !== (schema.templateFolder ?? "")) {
      updates.templateFolder = trimmedFolder || undefined;
    }

    onSave(updates);
  }, [name, templateFolder, schema, onSave]);

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
                fontSize: "var(--font-ui-smaller)",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              Folder containing note templates for new records.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div class="database-modal-footer">
          <button class="database-btn database-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            class="database-btn database-btn--primary"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
