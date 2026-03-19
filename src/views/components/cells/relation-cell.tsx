/** Relation cell — displays wikilinks as clickable tags, opens picker for editing. */

import { h } from "preact";
import { useState, useCallback } from "preact/hooks";
import type { CellValue } from "../../../types/record";
import type { DatabaseRecord } from "../../../types/record";
import { RelationPicker } from "./relation-picker";

/** Props for the RelationCell component. */
interface RelationCellProps {
  readonly value: CellValue;
  readonly onChange: (value: CellValue) => void;
  readonly onNavigate: (noteName: string) => void;
  /** Target records available for the relation picker. */
  readonly targetRecords?: readonly DatabaseRecord[];
  /** Whether multiple values are allowed. */
  readonly multiple?: boolean;
  /** Called to create a new record in the target folder. */
  readonly onCreate?: (name: string) => Promise<void>;
}

/**
 * Extract note names from wikilink strings like "[[Note Name]]".
 * @param raw - Raw cell value (string, string[], or other).
 * @returns Array of cleaned note names.
 */
function extractNoteNames(raw: CellValue): readonly string[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim().replace(/^\[\[/, "").replace(/\]\]$/, ""))
      .filter((s) => s.length > 0);
  }
  if (Array.isArray(raw)) {
    return (raw as readonly string[])
      .map((s) => String(s).trim().replace(/^\[\[/, "").replace(/\]\]$/, ""))
      .filter((s) => s.length > 0 && s !== "[]" && s !== "[[]]");
  }
  return [String(raw)];
}

/**
 * Format selected note names as wikilink value for storage.
 * @param names - Array of note names.
 * @param multiple - Whether to store as array or single string.
 * @returns Formatted CellValue for frontmatter.
 */
function formatAsWikilinks(names: readonly string[], multiple: boolean): CellValue {
  if (names.length === 0) return multiple ? [] : "";
  const links = names.map((n) => `[[${n}]]`);
  return multiple ? links : links[0];
}

/**
 * Relation cell that renders linked note names as clickable tags.
 * Click the cell area (not a tag) to open the relation picker.
 * Click a tag to navigate to the linked note.
 * @param props - value, onChange, onNavigate, targetRecords, multiple
 */
export function RelationCell({
  value,
  onChange,
  onNavigate,
  targetRecords,
  multiple = true,
  onCreate,
}: RelationCellProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const noteNames = extractNoteNames(value);

  /** Navigate to a linked note on tag click. */
  const handleTagClick = useCallback(
    (name: string, e: MouseEvent) => {
      e.stopPropagation();
      onNavigate(name);
    },
    [onNavigate]
  );

  /** Open picker when clicking the cell area (not a tag). */
  const handleCellClick = useCallback(() => {
    if (targetRecords && targetRecords.length > 0) {
      setPickerOpen(true);
    }
  }, [targetRecords]);

  /** Handle picker selection — format as wikilinks and persist. */
  const handlePickerSelect = useCallback(
    (names: readonly string[]) => {
      onChange(formatAsWikilinks(names, multiple));
      if (!multiple) {
        setPickerOpen(false);
      }
    },
    [onChange, multiple]
  );

  /** Close the picker. */
  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
  }, []);

  /** Available target record names for the picker. */
  const targetNames = targetRecords
    ? targetRecords.map((r) => r.name)
    : [];

  return (
    <div style={{ position: "relative" }}>
      <div
        class="cell-display"
        onClick={handleCellClick}
        tabIndex={0}
        style={{ flexWrap: "wrap", gap: "4px", cursor: targetRecords ? "pointer" : "default" }}
      >
        {noteNames.length > 0 ? (
          noteNames.map((name, idx) => (
            <span key={name}>
              <span
                class="database-link"
                onClick={(e) => handleTagClick(name, e)}
              >
                {name}
              </span>
              {idx < noteNames.length - 1 && (
                <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>,</span>
              )}
            </span>
          ))
        ) : (
          <span style={{ color: "var(--text-faint)" }}>&nbsp;</span>
        )}
      </div>

      {pickerOpen && (
        <RelationPicker
          targetRecords={targetNames}
          selected={[...noteNames]}
          multiple={multiple}
          onSelect={handlePickerSelect}
          onClose={handlePickerClose}
          onCreate={onCreate}
        />
      )}
    </div>
  );
}
