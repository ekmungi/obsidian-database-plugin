/** Modal dialog for adding or editing a column definition.
 *  Supports type-specific configuration: select options, relation targets, rollups. */

import { h } from "preact";
import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import type {
  ColumnDefinition,
  ColumnType,
  ColorKey,
  SelectOption,
  RollupFunction,
} from "../../../types/schema";
import { isSameGroup } from "../../../engine/type-groups";
import { ColorPicker } from "../shared/color-picker";
import { RelationConfigFields } from "./relation-config-fields";

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
  /** Called with the saved column definition and any option renames. */
  readonly onSave: (column: ColumnDefinition, renames?: ReadonlyMap<string, string>) => void;
  /** Called to delete the column (only for editing). */
  readonly onDelete?: () => void;
  /** Called to delete a single option and propagate to pages. */
  readonly onDeleteOption?: (optionName: string) => void;
  /** Called to close the modal without saving. */
  readonly onClose: () => void;
  /** All vault folder paths for the target folder autocomplete. */
  readonly folderPaths?: readonly string[];
  /** When true, render as compact dropdown content (no overlay, no header, no cancel). */
  readonly dropdown?: boolean;
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
  onDeleteOption,
  onClose,
  folderPaths,
  dropdown,
}: ColumnConfigModalProps) {
  const isEditing = column !== undefined;
  const isFileColumn = column?.type === "file";

  const [label, setLabel] = useState(column?.label ?? "");
  const [id, setId] = useState(column?.id ?? "");
  const [type, setType] = useState<ColumnType>(column?.type ?? "text");
  const [options, setOptions] = useState<readonly SelectOption[]>(column?.options ?? []);
  const [target, setTarget] = useState(column?.target ?? "");
  const [bidirectional, setBidirectional] = useState(column?.bidirectional ?? false);
  const [reverseColumnId, setReverseColumnId] = useState(column?.reverseColumnId ?? "");
  const [relationColumn, setRelationColumn] = useState(column?.relationColumn ?? "");
  const [targetColumn, setTargetColumn] = useState(column?.targetColumn ?? "");
  const [rollupFunction, setRollupFunction] = useState<RollupFunction>(
    column?.rollupFunction ?? "count",
  );
  const [formula, setFormula] = useState(column?.formula ?? "");
  const [idManuallyEdited, setIdManuallyEdited] = useState(isEditing);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTypeChangeConfirm, setShowTypeChangeConfirm] = useState(false);
  /** Tracks option renames: original value -> new value. */
  const [renames, setRenames] = useState<Map<string, string>>(new Map());
  const [confirmDeleteOption, setConfirmDeleteOption] = useState<string | null>(null);
  const [colorPickerIdx, setColorPickerIdx] = useState<number | null>(null);
  const [wrapText, setWrapText] = useState(column?.wrapText ?? false);
  const [error, setError] = useState("");

  /** Refs for auto-save — avoids stale closures and infinite loops. */
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const renamesRef = useRef(renames);
  renamesRef.current = renames;
  const isInitialMount = useRef(true);

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

  /** Handle type dropdown change — reset type-specific state and confirmation. */
  const handleTypeChange = useCallback((e: Event) => {
    setType((e.target as HTMLSelectElement).value as ColumnType);
    setShowTypeChangeConfirm(false);
  }, []);

  /* ── Select options management ─────────────── */

  /** Add a new blank option to the options list. */
  const addOption = useCallback(() => {
    setOptions((prev) => [...prev, { value: "", color: DEFAULT_COLOR }]);
  }, []);

  /** Remove an option by index — if editing, shows confirmation and propagates to pages. */
  const removeOption = useCallback((idx: number) => {
    const opt = options[idx];
    if (isEditing && opt && opt.value && onDeleteOption) {
      // Show confirmation for existing options
      if (confirmDeleteOption !== opt.value) {
        setConfirmDeleteOption(opt.value);
        return;
      }
      // Confirmed — propagate deletion to pages, then remove from local state
      onDeleteOption(opt.value);
      setConfirmDeleteOption(null);
    }
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  }, [options, isEditing, onDeleteOption, confirmDeleteOption]);

  /** Update an option's value text, tracking renames for propagation. */
  const updateOptionValue = useCallback((idx: number, value: string) => {
    setOptions((prev) => {
      const oldValue = prev[idx].value;
      // Track rename: map original value to new value (only for existing options with content)
      if (isEditing && oldValue && oldValue !== value) {
        setRenames((r) => {
          const updated = new Map(r);
          // If this option was already renamed, track from the original name
          const originalName = [...updated.entries()].find(([, v]) => v === oldValue)?.[0] ?? oldValue;
          if (value) {
            updated.set(originalName, value);
          } else {
            updated.delete(originalName);
          }
          return updated;
        });
      }
      return prev.map((opt, i) => (i === idx ? { ...opt, value } : opt));
    });
  }, [isEditing]);

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

  /** Build the ColumnDefinition from current form state.
   *  @param silent - When true, skip setting error state (used by auto-save). */
  const buildColumnDef = useCallback((silent = false): ColumnDefinition | null => {
    if (!label.trim()) {
      if (!silent) setError("Label is required.");
      return null;
    }
    if (!id.trim()) {
      if (!silent) setError("ID is required.");
      return null;
    }
    /* Check ID uniqueness (skip current column's own ID when editing). */
    const otherIds = column !== undefined
      ? existingIds.filter((eid) => eid !== column.id)
      : existingIds;
    if (otherIds.includes(id)) {
      if (!silent) setError("A column with this ID already exists.");
      return null;
    }

    // Check for duplicate option names
    if (type === "select" || type === "multi-select") {
      const optionValues = options.filter((o) => o.value.trim()).map((o) => o.value.trim());
      const uniqueValues = new Set(optionValues);
      if (uniqueValues.size < optionValues.length) {
        if (!silent) setError("Option names must be unique.");
        return null;
      }
    }

    const base: ColumnDefinition = { id, type, label: label.trim() };
    const withOptions =
      type === "select" || type === "multi-select"
        ? { ...base, options: options.filter((o) => o.value.trim()) }
        : base;
    const withRelation =
      type === "relation"
        ? {
            ...withOptions,
            target,
            ...(bidirectional ? { bidirectional: true, reverseColumnId } : {}),
          }
        : withOptions;
    const withRollup =
      type === "rollup"
        ? { ...withRelation, relationColumn, targetColumn, rollupFunction }
        : withRelation;
    const withFormula =
      type === "formula" ? { ...withRollup, formula } : withRollup;
    const withWrap = { ...withFormula, wrapText };

    return withWrap;
  }, [
    label, id, type, options, target, bidirectional, reverseColumnId,
    relationColumn, targetColumn, rollupFunction, formula, wrapText, existingIds, isEditing, column,
  ]);

  /** Auto-save when editing — fires on any form state change after initial mount. */
  useEffect(() => {
    if (!isEditing) return;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const colDef = buildColumnDef(true);
    if (!colDef) return;
    const r = renamesRef.current;
    onSaveRef.current(colDef, r.size > 0 ? r : undefined);
  }, [isEditing, buildColumnDef]);

  /** Validate inputs and call onSave with the assembled ColumnDefinition. */
  const handleSave = useCallback(() => {
    const colDef = buildColumnDef();
    if (!colDef) return;

    // Intercept cross-group type changes with confirmation
    if (isEditing && column && column.type !== colDef.type && !isSameGroup(column.type, colDef.type)) {
      if (!showTypeChangeConfirm) {
        setShowTypeChangeConfirm(true);
        return;
      }
    }

    setShowTypeChangeConfirm(false);
    onSave(colDef, renames.size > 0 ? renames : undefined);
  }, [buildColumnDef, isEditing, column, showTypeChangeConfirm, onSave, renames]);

  /** Handle delete with confirmation step. */
  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete?.();
  }, [confirmDelete, onDelete]);

  /** Close on backdrop click — works for both modal overlay and dropdown overlay. */
  const handleBackdropClick = useCallback(
    (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.classList.contains("database-modal-overlay") || el.classList.contains("database-dropdown-overlay")) {
        onClose();
      }
    },
    [onClose],
  );

  const showOptions = type === "select" || type === "multi-select";
  const showRelation = type === "relation";
  const showRollup = type === "rollup";
  const showFormula = type === "formula";

  /** Shared form fields rendered in both modal and dropdown modes. */
  const formFields = (
    <>
      {error && (<div style={{ color: "var(--text-error)", marginBottom: "8px", fontSize: "var(--font-ui-medium)" }}>{error}</div>)}
      {showTypeChangeConfirm && (<div style={{ background: "var(--background-modifier-error)", padding: "8px 12px", borderRadius: "var(--radius-s)", marginBottom: "8px", fontSize: "var(--font-ui-medium)" }}>Changing type will clear values in all pages. Click Save again to confirm.</div>)}
      <div class="database-form-group"><label class="database-form-label">Label</label><input class="database-form-input" type="text" value={label} onInput={handleLabelChange} placeholder="Column name" autoFocus /></div>
      {!isFileColumn && (<div class="database-form-group"><label class="database-form-label">ID</label><input class="database-form-input" type="text" value={id} onInput={handleIdChange} placeholder="column-id" /></div>)}
      {!isFileColumn && (<div class="database-form-group"><label class="database-form-label">Type</label><select class="database-form-select" value={type} onChange={handleTypeChange}>{COLUMN_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}</select></div>)}
      <div style={{ borderTop: "1px solid var(--background-modifier-border)", margin: "4px 0 8px" }} />
      <div class="database-form-group"><label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "var(--font-ui-medium)" }}><input type="checkbox" checked={wrapText} onChange={() => setWrapText(!wrapText)} /><span>Wrap text</span></label></div>
      {(showOptions || showRelation || showRollup || showFormula) && (<div style={{ borderTop: "1px solid var(--background-modifier-border)", margin: "4px 0 8px" }} />)}
      {showOptions && (
        <div class="database-form-group">
          <label class="database-form-label">Options</label>
          <div class="option-editor-list">
            {options.map((opt, idx) => (
              <div key={idx} class="option-editor-row">
                <div style={{ position: "relative" }}>
                  <div class="color-picker-swatch" style={{ backgroundColor: colorToHex(opt.color) }} onClick={() => setColorPickerIdx(colorPickerIdx === idx ? null : idx)} title={opt.color} />
                  {colorPickerIdx === idx && (<div style={{ position: "absolute", top: "28px", left: 0, zIndex: 20 }}><ColorPicker value={opt.color} onChange={(c) => updateOptionColor(idx, c)} onClose={() => setColorPickerIdx(null)} /></div>)}
                </div>
                <input class="database-form-input" type="text" value={opt.value} onInput={(e) => updateOptionValue(idx, (e.target as HTMLInputElement).value)} placeholder="Option value" style={{ flex: 1 }} />
                <button class="database-btn database-btn--ghost" onClick={() => moveOptionUp(idx)} title="Move up">&#9650;</button>
                <button class="database-btn database-btn--ghost" onClick={() => moveOptionDown(idx)} title="Move down">&#9660;</button>
                <button class={`database-btn ${confirmDeleteOption === opt.value ? "database-btn--danger" : "database-btn--ghost"}`} onClick={() => removeOption(idx)} title={confirmDeleteOption === opt.value ? "Click again to confirm" : "Remove"}>&#10005;</button>
              </div>
            ))}
          </div>
          {confirmDeleteOption && (<div style={{ color: "var(--text-on-accent)", fontSize: "var(--font-ui-medium)", marginTop: "4px", padding: "4px 8px", background: "var(--interactive-accent)", borderRadius: "var(--radius-s)" }}>Click X again to delete "{confirmDeleteOption}" from all pages.</div>)}
          <button class="database-btn database-btn--ghost" onClick={addOption} style={{ marginTop: "4px" }}>+ Add option</button>
        </div>
      )}
      {showRelation && (<RelationConfigFields target={target} onTargetChange={setTarget} bidirectional={bidirectional} onBidirectionalChange={setBidirectional} reverseColumnId={reverseColumnId} onReverseColumnIdChange={setReverseColumnId} folderPaths={folderPaths ?? []} />)}
      {showRollup && (
        <>
          <div class="database-form-group"><label class="database-form-label">Relation Column</label><input class="database-form-input" type="text" value={relationColumn} onInput={(e) => setRelationColumn((e.target as HTMLInputElement).value)} placeholder="relation-column-id" /></div>
          <div class="database-form-group"><label class="database-form-label">Target Column</label><input class="database-form-input" type="text" value={targetColumn} onInput={(e) => setTargetColumn((e.target as HTMLInputElement).value)} placeholder="target-column-id" /></div>
          <div class="database-form-group"><label class="database-form-label">Function</label><select class="database-form-select" value={rollupFunction} onChange={(e) => setRollupFunction((e.target as HTMLSelectElement).value as RollupFunction)}>{ROLLUP_FUNCTIONS.map((fn) => (<option key={fn} value={fn}>{fn}</option>))}</select></div>
        </>
      )}
      {showFormula && (<div class="database-form-group"><label class="database-form-label">Formula</label><input class="database-form-input" type="text" value={formula} onInput={(e) => setFormula((e.target as HTMLInputElement).value)} placeholder="e.g. prop('Price') * prop('Quantity')" /></div>)}
    </>
  );

  // Dropdown mode: compact, no overlay/header/cancel — parent positions this
  if (dropdown) {
    return (
      <>
        <div class="database-dropdown-body">{formFields}</div>
        {((!isEditing) || (isEditing && onDelete && !isFileColumn)) && (
          <div class="database-dropdown-footer">
            {isEditing && onDelete && !isFileColumn && (
              <button class="database-btn database-btn--danger" onClick={handleDelete}>
                {confirmDelete ? "Confirm?" : "Delete"}
              </button>
            )}
            {!isEditing && (
              <button class="database-btn database-btn--primary" onClick={handleSave} style={{ flex: 1 }}>Add</button>
            )}
          </div>
        )}
      </>
    );
  }

  // Modal mode: overlay + header + cancel
  return (
    <div class="database-modal-overlay" onClick={handleBackdropClick}>
      <div class="database-modal">
        <div class="database-modal-header">
          <span>{isEditing ? "Edit column" : "Add column"}</span>
          <button class="database-btn database-btn--ghost" onClick={onClose}>&#10005;</button>
        </div>
        <div class="database-modal-body">{formFields}</div>
        <div class="database-modal-footer">
          {isEditing && onDelete && !isFileColumn && (
            <button class="database-btn database-btn--danger" onClick={handleDelete} style={{ marginRight: "auto" }}>
              {confirmDelete ? "Delete property and all data?" : "Delete"}
            </button>
          )}
          <button class="database-btn database-btn--ghost" onClick={onClose}>{isEditing ? "Done" : "Cancel"}</button>
          {!isEditing && (
            <button class="database-btn database-btn--primary" onClick={handleSave}>Add</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ────────────────────────────────── */

/** Map ColorKey to hex string for inline swatch styling. */
const COLOR_HEX: Record<ColorKey, string> = {
  gray: "#A8B4C8",
  red: "#E09898",
  orange: "#E0A880",
  yellow: "#E0C470",
  green: "#90C890",
  teal: "#80C8C8",
  blue: "#90A8D8",
  purple: "#B898D8",
  pink: "#D890B8",
  brown: "#B8C488",
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
