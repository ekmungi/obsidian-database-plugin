/**
 * Relation resolver — parse wikilinks, resolve relations, and compute
 * bidirectional link updates between database records.
 */

import type { DatabaseRecord, CellValue } from "../types";

/** Regex pattern matching a single wikilink: [[Note Name]] */
const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

/**
 * Extract the note name from a single wikilink string like "[[Note Name]]".
 * Returns null if the value is not a valid wikilink.
 * @param value - A string potentially containing a wikilink.
 * @returns The extracted note name, or null.
 */
export function parseWikilink(value: string): string | null {
  const match = /^\[\[([^\]]+)\]\]$/.exec(value.trim());
  return match ? match[1] : null;
}

/**
 * Extract all wikilink note names from a cell value.
 * Handles strings with multiple wikilinks and arrays of strings.
 * @param value - The cell value to parse.
 * @returns An array of extracted note names.
 */
export function parseWikilinks(value: CellValue): readonly string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "number" || typeof value === "boolean") return [];

  if (Array.isArray(value)) {
    // Handle string arrays — each element may be a wikilink
    return (value as readonly (string | number)[]).flatMap((item) => {
      if (typeof item !== "string") return [];
      return extractWikilinksFromString(item);
    });
  }

  if (typeof value === "string") {
    return extractWikilinksFromString(value);
  }

  return [];
}

/**
 * Extract all wikilink names from a single string.
 * @param str - The string to search for wikilinks.
 * @returns Array of note names found.
 */
function extractWikilinksFromString(str: string): readonly string[] {
  const results: string[] = [];
  // Reset lastIndex for global regex reuse
  const regex = new RegExp(WIKILINK_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(str)) !== null) {
    results.push(match[1]);
  }
  return results;
}

/**
 * Format a note name as a wikilink string.
 * @param noteName - The note name to wrap.
 * @returns The formatted wikilink string.
 */
export function formatWikilink(noteName: string): string {
  return `[[${noteName}]]`;
}

/**
 * Resolve relations from a record's column to target records.
 * Matches wikilink note names against target record names.
 * @param record - The source record containing relation values.
 * @param columnId - The column ID holding relation wikilinks.
 * @param targetRecords - The pool of target records to search.
 * @returns An array of matched target records.
 */
export function resolveRelations(
  record: DatabaseRecord,
  columnId: string,
  targetRecords: readonly DatabaseRecord[]
): readonly DatabaseRecord[] {
  const cellValue = record.values[columnId];
  const linkedNames = parseWikilinks(cellValue);
  if (linkedNames.length === 0) return [];

  const nameSet = new Set(linkedNames.map((n) => n.toLowerCase()));
  return targetRecords.filter((target) =>
    nameSet.has(target.name.toLowerCase())
  );
}

/**
 * Compute updates to remove stale back-links when relations are removed.
 * Compares previous vs current linked names and returns updates for targets
 * that should no longer link back to the source.
 * @param previousNames - Note names that were previously linked.
 * @param currentNames - Note names currently linked.
 * @param sourceRecordName - Name of the source record (for back-link removal).
 * @param targetColumnId - The column in target records holding back-links.
 * @param targetRecords - All target records to check.
 * @returns Array of update descriptors for records that need back-links removed.
 */
export function computeBidirectionalRemovals(
  previousNames: readonly string[],
  currentNames: readonly string[],
  sourceRecordName: string,
  targetColumnId: string,
  targetRecords: readonly DatabaseRecord[]
): readonly { recordId: string; field: string; value: CellValue }[] {
  const currentSet = new Set(currentNames.map((n) => n.toLowerCase()));
  const removedNames = previousNames.filter(
    (n) => !currentSet.has(n.toLowerCase())
  );

  if (removedNames.length === 0) return [];

  const removedSet = new Set(removedNames.map((n) => n.toLowerCase()));
  const updates: { recordId: string; field: string; value: CellValue }[] = [];

  for (const target of targetRecords) {
    if (!removedSet.has(target.name.toLowerCase())) continue;

    const existingBacklinks = parseWikilinks(target.values[targetColumnId]);
    const hasBacklink = existingBacklinks.some(
      (name) => name.toLowerCase() === sourceRecordName.toLowerCase()
    );

    if (!hasBacklink) continue;

    // Remove the source back-link from the target
    const existingValue = target.values[targetColumnId];
    let newValue: CellValue;

    if (Array.isArray(existingValue)) {
      newValue = (existingValue as readonly string[]).filter((item) => {
        const str = String(item).trim();
        // Filter out empty/malformed entries and the removed back-link
        if (!str || str === "[[]]" || str === "[]") return false;
        const parsed = parseWikilink(str);
        if (!parsed) return true;
        return parsed.toLowerCase() !== sourceRecordName.toLowerCase();
      });
    } else if (typeof existingValue === "string") {
      // Remove the wikilink from comma-separated string
      const parts = existingValue.split(",").map((s) => s.trim());
      const filtered = parts.filter((part) => {
        if (!part || part === "[[]]" || part === "[]") return false;
        const parsed = parseWikilink(part);
        return !parsed || parsed.toLowerCase() !== sourceRecordName.toLowerCase();
      });
      newValue = filtered.join(", ");
    } else {
      continue;
    }

    updates.push({
      recordId: target.id,
      field: targetColumnId,
      value: newValue,
    });
  }

  return updates;
}

/**
 * Compute the updates needed to keep bidirectional relation links in sync.
 * For each target record linked by the source, ensures the target links back.
 * Returns only the updates that are missing (does not duplicate existing links).
 * @param sourceRecord - The source record with forward links.
 * @param columnId - The source column holding relation wikilinks.
 * @param targetColumnId - The column in target records for back-links.
 * @param targetRecords - All target records to check.
 * @returns Array of update descriptors for records that need back-links added.
 */
export function computeBidirectionalUpdates(
  sourceRecord: DatabaseRecord,
  columnId: string,
  targetColumnId: string,
  targetRecords: readonly DatabaseRecord[]
): readonly { recordId: string; field: string; value: CellValue }[] {
  const linkedTargets = resolveRelations(
    sourceRecord,
    columnId,
    targetRecords
  );

  const updates: { recordId: string; field: string; value: CellValue }[] = [];

  for (const target of linkedTargets) {
    const existingBacklinks = parseWikilinks(target.values[targetColumnId]);
    const alreadyLinked = existingBacklinks.some(
      (name) => name.toLowerCase() === sourceRecord.name.toLowerCase()
    );

    if (!alreadyLinked) {
      // Build new value: append the source wikilink to existing value
      const existingValue = target.values[targetColumnId];
      const sourceLink = formatWikilink(sourceRecord.name);

      let newValue: CellValue;
      if (existingValue === null || existingValue === undefined) {
        newValue = sourceLink;
      } else if (Array.isArray(existingValue)) {
        newValue = [...(existingValue as readonly string[]), sourceLink];
      } else if (typeof existingValue === "string" && existingValue.trim()) {
        newValue = `${existingValue}, ${sourceLink}`;
      } else {
        newValue = sourceLink;
      }

      updates.push({
        recordId: target.id,
        field: targetColumnId,
        value: newValue,
      });
    }
  }

  return updates;
}
