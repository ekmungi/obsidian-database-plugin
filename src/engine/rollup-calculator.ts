/**
 * Rollup calculator — aggregate values from related records using
 * various rollup functions (count, sum, avg, min, max, etc.).
 */

import type { DatabaseRecord, CellValue, RollupFunction } from "../types";

/**
 * Extract numeric values from a set of records for a given column.
 * Non-numeric values are silently skipped.
 * @param records - The records to extract from.
 * @param column - The column ID to read.
 * @returns Array of valid numeric values.
 */
function extractNumbers(
  records: readonly DatabaseRecord[],
  column: string
): readonly number[] {
  const nums: number[] = [];
  for (const record of records) {
    const val = record.values[column];
    if (typeof val === "number" && !isNaN(val)) {
      nums.push(val);
    } else if (typeof val === "string") {
      const parsed = Number(val);
      if (!isNaN(parsed)) {
        nums.push(parsed);
      }
    }
  }
  return nums;
}

/**
 * Check if a cell value is considered empty for rollup purposes.
 * @param value - The cell value to check.
 * @returns True if the value is null, undefined, or empty string.
 */
function isValueEmpty(value: CellValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

/**
 * Calculate a rollup aggregation over related records.
 * @param relatedRecords - The records related via a relation column.
 * @param targetColumn - The column in the related records to aggregate.
 * @param fn - The rollup function to apply.
 * @returns The aggregated value, or null for empty inputs.
 */
export function calculateRollup(
  relatedRecords: readonly DatabaseRecord[],
  targetColumn: string,
  fn: RollupFunction
): CellValue {
  switch (fn) {
    case "count":
      return relatedRecords.length;

    case "count_values": {
      let count = 0;
      for (const record of relatedRecords) {
        if (!isValueEmpty(record.values[targetColumn])) {
          count++;
        }
      }
      return count;
    }

    case "sum": {
      const nums = extractNumbers(relatedRecords, targetColumn);
      if (nums.length === 0) return 0;
      return nums.reduce((acc, n) => acc + n, 0);
    }

    case "avg": {
      const nums = extractNumbers(relatedRecords, targetColumn);
      if (nums.length === 0) return null;
      return nums.reduce((acc, n) => acc + n, 0) / nums.length;
    }

    case "min": {
      const nums = extractNumbers(relatedRecords, targetColumn);
      if (nums.length === 0) return null;
      return Math.min(...nums);
    }

    case "max": {
      const nums = extractNumbers(relatedRecords, targetColumn);
      if (nums.length === 0) return null;
      return Math.max(...nums);
    }

    case "percent_empty": {
      if (relatedRecords.length === 0) return 0;
      const emptyCount = relatedRecords.filter((r) =>
        isValueEmpty(r.values[targetColumn])
      ).length;
      return (emptyCount / relatedRecords.length) * 100;
    }

    case "percent_not_empty": {
      if (relatedRecords.length === 0) return 0;
      const nonEmptyCount = relatedRecords.filter(
        (r) => !isValueEmpty(r.values[targetColumn])
      ).length;
      return (nonEmptyCount / relatedRecords.length) * 100;
    }

    case "show_original": {
      const values = relatedRecords.map((r) => r.values[targetColumn]);
      const stringValues = values
        .filter((v) => v !== null && v !== undefined)
        .map(String);
      return stringValues.length > 0 ? stringValues.join(", ") : null;
    }

    default:
      return null;
  }
}
