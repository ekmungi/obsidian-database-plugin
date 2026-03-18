/** Relation cell — displays wikilinks as clickable tags. */

import { h } from "preact";
import { useCallback } from "preact/hooks";
import type { CellValue } from "../../../types/record";

/** Props for the RelationCell component. */
interface RelationCellProps {
  readonly value: CellValue;
  readonly onChange: (value: string) => void;
  readonly onNavigate: (noteName: string) => void;
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
    return (raw as readonly string[]).map((s) =>
      String(s).trim().replace(/^\[\[/, "").replace(/\]\]$/, "")
    );
  }
  return [String(raw)];
}

/**
 * Relation cell that renders linked note names as clickable tags.
 * @param props.value - Raw relation value (wikilink string or array).
 * @param props.onChange - Called when the relation value changes.
 * @param props.onNavigate - Called to open a linked note.
 */
export function RelationCell({ value, onNavigate }: RelationCellProps) {
  const noteNames = extractNoteNames(value);

  /** Navigate to a linked note on click. */
  const handleClick = useCallback(
    (name: string, e: MouseEvent) => {
      e.stopPropagation();
      onNavigate(name);
    },
    [onNavigate]
  );

  if (noteNames.length === 0) {
    return <div class="cell-display" />;
  }

  return (
    <div class="cell-display" style={{ flexWrap: "wrap", gap: "4px" }}>
      {noteNames.map((name) => (
        <span
          key={name}
          class="database-link"
          onClick={(e) => handleClick(name, e)}
        >
          {name}
        </span>
      ))}
    </div>
  );
}
