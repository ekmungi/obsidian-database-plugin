/** Modal dialog for adding or editing a column definition.
 *  Supports type-specific configuration: select options, relation targets, rollups. */

import { h } from "preact";
import { useState, useCallback } from "preact/hooks";
import type {
  ColumnDefinition,
  ColumnType,
  ColorKey,
  SelectOption,
  RollupFunction,
} from "../../../types/schema";
import { ColorPicker } from "../shared/color-picker";

/** All column types available in the type dropdown. */
const COLUMN_TYPES: readonly ColumnType[] = [
  "text", "number", "date", "select", "multi-select",
  "checkbox", "relation", "rollup", "formula",
];

/** All rollup aggregation functions for the rollup function picker. */
const ROLLUP_FUNCTIONS: readonly RollupFunction[] = [
  "count", "count_values", "sum", "avg",
  "min", "max", "percent_empty", "percent_not_empty", "show_original",
];

/** Default color for new select options. */
const DEFAULT_COLOR: ColorKey = "gray";

interface ColumnConfigModalProps {
  /** Existing column to edit, or undefined for a new column. */
  readonly column?: ColumnDefinition;
  /** IDs already in use — the new/edited column must not collide. */
  readonly existingIds: readonly string[];
  /** Called with the saved column definition. */
  readonly onSave: (column: ColumnDefinition) => void;
  /** Called to delete the column (only for editing). */
  readonly onDelete?: () => void;
  /** Called to close the modal without saving. */
  readonly onClose: () => void;
}

/**
 * Generate a slug-style ID from a label string.
 *
 * @param label - Human-readable column label
 * @returns Lowercase, hyphenated ID string
 */
function labelToId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Modal for creating or editing a ColumnDefinition.
 * Shows type-specific fields (options editor, relation target, rollup config).
 *
 * @param props - column, existingIds, onSave, onDelete, onClose
 * @returns Preact VNode for the column config modal
 */
export function ColumnConfigModal({
  column,
  existingIds,
  onSave,
  onDelete,
  onClose,
}: ColumnConfigModalProps) {
  const isEditing = column !== undefined;

  const [label, setLabel] = useState(column?.label ?? "");
  const [id, setId] = useState(column?.id ?? "");
  const [type, setType] = useState<ColumnType>(column?.type ?? "text");
  const [options, setOptions] = useState<readonly SelectOption[]>(column?.options ?? []);
  const [target, setTarget] = useState(column?.target ?? "");
  const [relationColumn, setRelationColumn] = useState(column?.relationColumn ?? "");
  const [targetColumn, setTargetColumn] = useState(column?.targetColumn ?? "");
  const [rollupFunction, setRollupFunction] = useState<RollupFunction>(
    column?.rollupFunction ?? "count",
  );
  const [formula, setFormula] = useState(column?.formula ?? "");
  const [idManuallyEdited, setIdManuallyEdited] = useState(isEditing);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [colorPickerIdx, setColorPickerIdx] = useState<number | null>(null);
  const [error, setError] = useState("");

  /** Update label and auto-generate ID unless manually edited. */
  const handleLabelChange = useCallback(
    (e: Event) => {
      const val = (e.target as HTMLInputElement).value;
      setLabel(val);
      if (!idManuallyEdited) {
        setId(labelToId(val));
      }
    },
    [idManuallyEdited],
  );

  /** Mark ID as manually edited and update value. */
  const handleIdChange = useCallback((e: Event) => {
    setIdManuallyEdited(true);
    setId((e.target as HTMLInputElement).value);
  }, []);

  /** Handle type dropdown change — reset type-specific state. */
  const handleTypeChange = useCallback((e: Event) => {
    setType((e.target as HTMLSelectElement).value as ColumnType);
  }, []);

  /* ── Select options management ─────────────── */

  /** Add a new blank option to the options list. */
  const addOption = useCallback(() => {
    setOptions((prev) => [...prev, { value: "", color: DEFAULT_COLOR }]);
  }, []);

  /** Remove an option by index. */
  const removeOption = useCallback((idx: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  /** Update an option's value text. */
  const updateOptionValue = useCallback((idx: number, value: string) => {
    setOptions((prev) =>
      prev.map((opt, i) => (i === idx ? { ...opt, value } : opt)),
    );
  }, []);

  /** Update an option's color. */
  const updateOptionColor = useCallback((idx: number, color: ColorKey) => {
    setOptions((prev) =>
      prev.map((opt, i) => (i === idx ? { ...opt, color } : opt)),
    );
    setColorPickerIdx(null);
  }, []);

  /** Move an option up in the list. */
  const moveOptionUp = useCallback((idx: number) => {
    if (idx === 0) return;
    setOptions((prev) => {
      const arr = [...prev];
      const temp = arr[idx - 1];
      arr[idx - 1] = arr[idx];
      arr[idx] = temp;
      return arr;
    });
  }, []);

  /** Move an option down in the list. */
  const moveOptionDown = useCallback((idx: number) => {
    setOptions((prev) => {
      if (idx >= prev.length - 1) return prev;
      const arr = [...prev];
      const temp = arr[idx + 1];
      arr[idx + 1] = arr[idx];
      arr[idx] = temp;
      return arr;
    });
  }, []);

  /* ── Validation and save ──────────────────── */

  /** Validate inputs and call onSave with the assembled ColumnDefinition. */
  const handleSave = useCallback(() => {
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    if (!id.trim()) {
      setError("ID is required.");
      return;
    }
    /* Check ID uniqueness (skip current column's own ID when editing). */
    const otherIds = isEditing
      ? existingIds.filter((eid) => eid !== column!.id)
      : existingIds;
    if (otherIds.includes(id)) {
      setError("A column with this ID already exists.");
      return;
    }

    const base: ColumnDefinition = { id, type, label: label.trim() };
    const withOptions =
      type === "select" || type === "multi-select"
        ? { ...base, options: options.filter((o) => o.value.trim()) }
        : base;
    const withRelation =
      type === "relation" ? { ...withOptions, target } : withOptions;
    const withRollup =
      type === "rollup"
        ? { ...withRelation, relationColumn, targetColumn, rollupFunction }
        : withRelation;
    const withFormula =
      type === "formula" ? { ...withRollup, formula } : withRollup;

    onSave(withFormula);
  }, [
    label, id, type, options, target, relationColumn,
    targetColumn, rollupFunction, formula, existingIds, isEditing, column, onSave,
  ]);

  /** Handle delete with confirmation step. */
  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete?.();
  }, [confirmDelete, onDelete]);

  /** Close on backdrop click. */
  const handleBackdropClick = useCallback(
    (e: Event) => {
      if ((e.target as HTMLElement).classList.contains("database-modal-overlay")) {
        onClose();
      }
    },
    [onClose],
  );

  const showOptions = type === "select" || type === "multi-select";
  const showRelation = type === "relation";
  const showRollup = type === "rollup";
  const showFormula = type === "formula";

  return (
    <div class="database-modal-overlay" onClick={handleBackdropClick}>
      <div class="database-modal">
        {/* Header */}
        <div class="database-modal-header">
          <span>{isEditing ? "Edit Column" : "Add Column"}</span>
          <button class="database-btn database-btn--ghost" onClick={onClose}>
            &#10005;
          </button>
        </div>

        {/* Body */}
        <div class="database-modal-body">
          {error && (
            <div style={{ color: "var(--text-error)", marginBottom: "8px", fontSize: "var(--font-ui-small)" }}>
              {error}
            </div>
          )}

          {/* Label */}
          <div class="database-form-group">
            <label class="database-form-label">Label</label>
            <input
              class="database-form-input"
              type="text"
              value={label}
              onInput={handleLabelChange}
              placeholder="Column name"
              autoFocus
            />
          </div>

          {/* ID */}
          <div class="database-form-group">
            <label class="database-form-label">ID</label>
            <input
              class="database-form-input"
              type="text"
              value={id}
              onInput={handleIdChange}
              placeholder="column-id"
            />
          </div>

          {/* Type */}
          <div class="database-form-group">
            <label class="database-form-label">Type</label>
            <select class="database-form-select" value={type} onChange={handleTypeChange}>
              {COLUMN_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Select/Multi-select options */}
          {showOptions && (
            <div class="database-form-group">
              <label class="database-form-label">Options</label>
              <div class="option-editor-list">
                {options.map((opt, idx) => (
                  <div key={idx} class="option-editor-row">
                    <div style={{ position: "relative" }}>
                      <div
                        class="color-picker-swatch"
                        style={{ backgroundColor: colorToHex(opt.color) }}
                        onClick={() =>
                          setColorPickerIdx(colorPickerIdx === idx ? null : idx)
                        }
                        title={opt.color}
                      />
                      {colorPickerIdx === idx && (
                        <div style={{ position: "absolute", top: "28px", left: 0, zIndex: 20 }}>
                          <ColorPicker
                            value={opt.color}
                            onChange={(c) => updateOptionColor(idx, c)}
                            onClose={() => setColorPickerIdx(null)}
                          />
                        </div>
                      )}
                    </div>
                    <input
                      class="database-form-input"
                      type="text"
                      value={opt.value}
                      onInput={(e) =>
                        updateOptionValue(idx, (e.target as HTMLInputElement).value)
                      }
                      placeholder="Option value"
                      style={{ flex: 1 }}
                    />
                    <button
                      class="database-btn database-btn--ghost"
                      onClick={() => moveOptionUp(idx)}
                      title="Move up"
                    >
                      &#9650;
                    </button>
                    <button
                      class="database-btn database-btn--ghost"
                      onClick={() => moveOptionDown(idx)}
                      title="Move down"
                    >
                      &#9660;
                    </button>
                    <button
                      class="database-btn database-btn--ghost"
                      onClick={() => removeOption(idx)}
                      title="Remove"
                    >
                      &#10005;
                    </button>
                  </div>
                ))}
              </div>
              <button
                class="database-btn database-btn--ghost"
                onClick={addOption}
                style={{ marginTop: "4px" }}
              >
                + Add option
              </button>
            </div>
          )}

          {/* Relation target */}
          {showRelation && (
            <div class="database-form-group">
              <label class="database-form-label">Target Folder</label>
              <input
                class="database-form-input"
                type="text"
                value={target}
                onInput={(e) => setTarget((e.target as HTMLInputElement).value)}
                placeholder="path/to/related/database"
              />
            </div>
          )}

          {/* Rollup config */}
          {showRollup && (
            <>
              <div class="database-form-group">
                <label class="database-form-label">Relation Column</label>
                <input
                  class="database-form-input"
                  type="text"
                  value={relationColumn}
                  onInput={(e) =>
                    setRelationColumn((e.target as HTMLInputElement).value)
                  }
                  placeholder="relation-column-id"
                />
              </div>
              <div class="database-form-group">
                <label class="database-form-label">Target Column</label>
                <input
                  class="database-form-input"
                  type="text"
                  value={targetColumn}
                  onInput={(e) =>
                    setTargetColumn((e.target as HTMLInputElement).value)
                  }
                  placeholder="target-column-id"
                />
              </div>
              <div class="database-form-group">
                <label class="database-form-label">Function</label>
                <select
                  class="database-form-select"
                  value={rollupFunction}
                  onChange={(e) =>
                    setRollupFunction(
                      (e.target as HTMLSelectElement).value as RollupFunction,
                    )
                  }
                >
                  {ROLLUP_FUNCTIONS.map((fn) => (
                    <option key={fn} value={fn}>{fn}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Formula expression */}
          {showFormula && (
            <div class="database-form-group">
              <label class="database-form-label">Formula</label>
              <input
                class="database-form-input"
                type="text"
                value={formula}
                onInput={(e) => setFormula((e.target as HTMLInputElement).value)}
                placeholder="e.g. prop('Price') * prop('Quantity')"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div class="database-modal-footer">
          {isEditing && onDelete && (
            <button
              class="database-btn database-btn--danger"
              onClick={handleDelete}
              style={{ marginRight: "auto" }}
            >
              {confirmDelete ? "Confirm delete?" : "Delete"}
            </button>
          )}
          <button class="database-btn database-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button class="database-btn database-btn--primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ────────────────────────────────── */

/** Map ColorKey to hex string for inline swatch styling. */
const COLOR_HEX: Record<ColorKey, string> = {
  gray: "#B8B8B4",
  red: "#E88E8E",
  orange: "#F0A96E",
  yellow: "#F5D76E",
  green: "#8EC78E",
  teal: "#6EC4D6",
  blue: "#6EAAD6",
  purple: "#B89AD6",
  pink: "#E88EBE",
  brown: "#C4A882",
};

/**
 * Convert a ColorKey to its hex color string.
 *
 * @param key - The ColorKey to convert
 * @returns Hex color string
 */
function colorToHex(key: ColorKey): string {
  return COLOR_HEX[key] ?? "#999999";
}
