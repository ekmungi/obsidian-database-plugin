/**
 * Query engine — filter, sort, group, and search database records.
 * All operations are pure functions that never mutate input arrays.
 */

import type { DatabaseRecord, CellValue, FilterRule, SortRule } from "../types";

/**
 * Check whether a cell value is empty (null, undefined, or empty string/array).
 * @param value - The cell value to check.
 * @returns True if the value is considered empty.
 */
function isEmpty(value: CellValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/**
 * Coerce a cell value to a comparable string.
 * @param value - The cell value to convert.
 * @returns A lowercase string representation.
 */
function toComparableString(value: CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ").toLowerCase();
  return String(value).toLowerCase();
}

/**
 * Coerce a cell value to a number for numeric comparisons.
 * @param value - The cell value to convert.
 * @returns The numeric value, or NaN if not convertible.
 */
function toNumber(value: CellValue | undefined): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return Number(value);
}

/**
 * Evaluate a single filter rule against a record's cell value.
 * @param value - The cell value from the record.
 * @param rule - The filter rule to evaluate.
 * @returns True if the record passes the filter.
 */
function matchesFilter(
  value: CellValue | undefined,
  rule: FilterRule
): boolean {
  switch (rule.operator) {
    case "is_empty":
      return isEmpty(value);
    case "is_not_empty":
      return !isEmpty(value);
    case "eq": {
      const target = toComparableString(rule.value ?? null);
      // For arrays (multi-select), check if the array contains the target value
      if (Array.isArray(value)) {
        return value.some((v) => String(v).toLowerCase() === target);
      }
      return toComparableString(value) === target;
    }
    case "neq": {
      const target = toComparableString(rule.value ?? null);
      if (Array.isArray(value)) {
        return !value.some((v) => String(v).toLowerCase() === target);
      }
      return toComparableString(value) !== target;
    }
    case "contains":
      return toComparableString(value).includes(
        toComparableString(rule.value ?? null)
      );
    case "not_contains":
      return !toComparableString(value).includes(
        toComparableString(rule.value ?? null)
      );
    case "gt":
      return toNumber(value) > toNumber(rule.value ?? null);
    case "gte":
      return toNumber(value) >= toNumber(rule.value ?? null);
    case "lt":
      return toNumber(value) < toNumber(rule.value ?? null);
    case "lte":
      return toNumber(value) <= toNumber(rule.value ?? null);
    default:
      return true;
  }
}

/**
 * Filter records by applying all filter rules (AND logic).
 * @param records - The records to filter (not mutated).
 * @param filters - Filter rules to apply.
 * @returns A new array of records that pass all filters.
 */
export function filterRecords(
  records: readonly DatabaseRecord[],
  filters: readonly FilterRule[]
): readonly DatabaseRecord[] {
  if (filters.length === 0) return records;
  return records.filter((record) =>
    filters.every((rule) => matchesFilter(record.values[rule.column], rule))
  );
}

/**
 * Compare two cell values for sorting purposes.
 * Handles strings (case-insensitive), numbers, dates, booleans, and nulls (nulls last).
 * @param a - First value.
 * @param b - Second value.
 * @returns Negative if a < b, positive if a > b, zero if equal.
 */
function compareValues(a: CellValue | undefined, b: CellValue | undefined): number {
  // Nulls always sort last
  const aEmpty = a === null || a === undefined;
  const bEmpty = b === null || b === undefined;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  // Boolean comparison (false < true)
  if (typeof a === "boolean" && typeof b === "boolean") {
    return a === b ? 0 : a ? 1 : -1;
  }

  // Number comparison
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  // Try numeric comparison for strings that look like numbers
  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB) && typeof a !== "boolean" && typeof b !== "boolean") {
    return numA - numB;
  }

  // String comparison (case-insensitive)
  return toComparableString(a).localeCompare(toComparableString(b));
}

/**
 * Sort records by multiple sort rules (first rule has highest priority).
 * @param records - The records to sort (not mutated).
 * @param sort - Sort rules to apply in order of priority.
 * @returns A new sorted array of records.
 */
export function sortRecords(
  records: readonly DatabaseRecord[],
  sort: readonly SortRule[]
): readonly DatabaseRecord[] {
  if (sort.length === 0) return records;
  return [...records].sort((a, b) => {
    for (const rule of sort) {
      const valA = a.values[rule.column];
      const valB = b.values[rule.column];

      // Nulls always sort last regardless of direction
      const aNull = valA === null || valA === undefined;
      const bNull = valB === null || valB === undefined;
      if (aNull && bNull) continue;
      if (aNull) return 1;
      if (bNull) return -1;

      const cmp = compareValues(valA, valB);
      if (cmp !== 0) {
        return rule.dir === "desc" ? -cmp : cmp;
      }
    }
    return 0;
  });
}

/**
 * Group records by a column value. Null/undefined values go into "No value".
 * @param records - The records to group (not mutated).
 * @param groupBy - The column ID to group by.
 * @returns A Map from group key to array of records.
 */
export function groupRecords(
  records: readonly DatabaseRecord[],
  groupBy: string
): ReadonlyMap<string, readonly DatabaseRecord[]> {
  const groups = new Map<string, DatabaseRecord[]>();
  for (const record of records) {
    const raw = record.values[groupBy];
    const key = isEmpty(raw) ? "No value" : String(raw);
    const existing = groups.get(key);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(key, [record]);
    }
  }
  return groups;
}

/**
 * Full-text search across all values of each record (case-insensitive).
 * @param records - The records to search (not mutated).
 * @param query - The search string.
 * @returns A new array of records matching the query.
 */
export function searchRecords(
  records: readonly DatabaseRecord[],
  query: string
): readonly DatabaseRecord[] {
  if (!query.trim()) return records;
  const lowerQuery = query.toLowerCase();
  return records.filter((record) => {
    // Search in record name
    if (record.name.toLowerCase().includes(lowerQuery)) return true;
    // Search in all values
    return Object.values(record.values).some((value) =>
      toComparableString(value).includes(lowerQuery)
    );
  });
}
