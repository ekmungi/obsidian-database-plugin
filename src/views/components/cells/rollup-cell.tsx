/** Rollup cell — read-only display of a computed/aggregated value. */

import { h } from "preact";
import type { CellValue } from "../../../types/record";

/** Props for the RollupCell component. */
interface RollupCellProps {
  readonly value: CellValue;
}

/**
 * Format a cell value for read-only display.
 * @param value - The computed rollup value.
 * @returns Human-readable string representation.
 */
function formatRollupValue(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * Read-only cell for displaying rollup/aggregation results.
 * @param props.value - The computed rollup value to display.
 */
export function RollupCell({ value }: RollupCellProps) {
  return (
    <div class="cell-display" style={{ color: "var(--text-muted)" }}>
      {formatRollupValue(value)}
    </div>
  );
}
