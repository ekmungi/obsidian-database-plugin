/** Smart color assignment for select options — picks the first unused color. */

import type { ColorKey, SelectOption } from "../types/schema";

/** Preferred color order for auto-assignment. */
const COLOR_SEQUENCE: readonly ColorKey[] = [
  "blue", "green", "purple", "orange", "red",
  "teal", "yellow", "pink", "brown", "gray",
];

/**
 * Pick the next color for a new option, preferring colors not already in use.
 * Falls back to cycling if all 10 colors are taken.
 * @param existingOptions - Current options with their assigned colors.
 * @returns A ColorKey not yet used, or the least-used one.
 */
export function pickNextColor(existingOptions: readonly SelectOption[]): ColorKey {
  const usedColors = new Set(existingOptions.map((o) => o.color));
  // Find first color in sequence that isn't used yet
  const unused = COLOR_SEQUENCE.find((c) => !usedColors.has(c));
  if (unused) return unused;
  // All colors used — cycle based on count
  return COLOR_SEQUENCE[existingOptions.length % COLOR_SEQUENCE.length];
}
