/** Pure helpers for renaming and removing select option values in frontmatter data. */

import type { CellValue } from "../types";

/**
 * Rename an option value within a CellValue (string or array).
 * Returns a new value with all occurrences of oldName replaced with newName.
 * @param value - The current cell value (string, array, or null).
 * @param oldName - The option value to find.
 * @param newName - The replacement value.
 * @returns Updated cell value with renames applied.
 */
export function renameOptionInValue(value: CellValue, oldName: string, newName: string): CellValue {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return (value as readonly string[]).map((v) => (v === oldName ? newName : v));
  }
  return value === oldName ? newName : value;
}

/**
 * Remove an option value from a CellValue (string or array).
 * Always returns an array (empty if cleared, filtered if removed from array).
 * @param value - The current cell value (string, array, or null).
 * @param optionName - The option value to remove.
 * @returns Updated cell value as an array with the option removed.
 */
export function removeOptionFromValue(value: CellValue, optionName: string): readonly string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return (value as readonly string[]).filter((v) => v !== optionName);
  }
  return value === optionName ? [] : [value as string];
}
