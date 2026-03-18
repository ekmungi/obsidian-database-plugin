/**
 * Cross-folder engine — aggregates records from multiple database folders
 * into a unified view with merged schemas and prefixed record IDs.
 */

import type {
  ColumnDefinition,
  ViewConfig,
  DatabaseSchema,
  DatabaseRecord,
} from "../types";

/** Configuration for a cross-folder database view. */
export interface CrossFolderConfig {
  readonly id: string;
  readonly name: string;
  readonly sources: readonly string[];
  readonly columns: readonly ColumnDefinition[];
  readonly views: readonly ViewConfig[];
}

/**
 * Parse a JSON string into a CrossFolderConfig.
 * Validates required fields and returns a frozen config object.
 * @param json - Raw JSON string to parse.
 * @returns A frozen CrossFolderConfig.
 * @throws Error if JSON is invalid or required fields are missing.
 */
export function parseCrossFolderConfig(json: string): CrossFolderConfig {
  const raw = JSON.parse(json);

  if (!raw.id || typeof raw.id !== "string") {
    throw new Error("CrossFolderConfig requires a string 'id' field");
  }
  if (!raw.name || typeof raw.name !== "string") {
    throw new Error("CrossFolderConfig requires a string 'name' field");
  }
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    throw new Error("CrossFolderConfig requires a non-empty 'sources' array");
  }
  if (!Array.isArray(raw.columns)) {
    throw new Error("CrossFolderConfig requires a 'columns' array");
  }
  if (!Array.isArray(raw.views)) {
    throw new Error("CrossFolderConfig requires a 'views' array");
  }

  return Object.freeze({
    id: raw.id,
    name: raw.name,
    sources: Object.freeze([...raw.sources]),
    columns: Object.freeze(raw.columns.map((c: ColumnDefinition) => Object.freeze({ ...c }))),
    views: Object.freeze(raw.views.map((v: ViewConfig) => Object.freeze({ ...v }))),
  });
}

/**
 * Serialize a CrossFolderConfig to a formatted JSON string.
 * @param config - The config to serialize.
 * @returns Pretty-printed JSON string.
 */
export function serializeCrossFolderConfig(config: CrossFolderConfig): string {
  return JSON.stringify(
    {
      id: config.id,
      name: config.name,
      sources: config.sources,
      columns: config.columns,
      views: config.views,
    },
    null,
    2,
  );
}

/**
 * Merge records from multiple source folders into a single array.
 * Prefixes each record ID with its source path to avoid collisions.
 * @param recordSets - Map from source folder path to its records.
 * @returns Frozen array of all records with prefixed IDs.
 */
export function mergeRecords(
  recordSets: ReadonlyMap<string, readonly DatabaseRecord[]>,
): readonly DatabaseRecord[] {
  const merged: DatabaseRecord[] = [];

  for (const [sourcePath, records] of recordSets) {
    for (const record of records) {
      // Only prefix if the ID doesn't already start with the source path
      const prefixedId = record.id.startsWith(sourcePath)
        ? record.id
        : `${sourcePath}/${record.id}`;

      merged.push(
        Object.freeze({
          ...record,
          id: prefixedId,
        }),
      );
    }
  }

  return Object.freeze(merged);
}

/**
 * Build a column-lookup key from a column's label and type.
 * Used to detect equivalent columns across schemas.
 * @param col - The column definition.
 * @returns A string key for comparison.
 */
function columnKey(col: ColumnDefinition): string {
  return `${col.label.toLowerCase()}::${col.type}`;
}

/**
 * Merge select options from two columns, deduplicating by value.
 * @param a - First set of options (may be undefined).
 * @param b - Second set of options (may be undefined).
 * @returns Merged frozen array of unique options, or undefined if both inputs are undefined.
 */
function mergeSelectOptions(
  a: ColumnDefinition["options"],
  b: ColumnDefinition["options"],
): ColumnDefinition["options"] {
  if (!a && !b) return undefined;
  const all = [...(a ?? []), ...(b ?? [])];
  const seen = new Set<string>();
  const unique = all.filter((opt) => {
    if (seen.has(opt.value)) return false;
    seen.add(opt.value);
    return true;
  });
  return Object.freeze(unique);
}

/**
 * Resolve column conflicts across multiple database schemas.
 * Columns with the same label and type are merged (select options unioned).
 * Unique columns from each schema are included in the result.
 * @param schemas - Array of database schemas to unify.
 * @returns Frozen array of unified column definitions.
 */
export function resolveColumnConflicts(
  schemas: readonly DatabaseSchema[],
): readonly ColumnDefinition[] {
  /** Map from column key to the merged column definition. */
  const columnMap = new Map<string, ColumnDefinition>();
  /** Track insertion order for stable output. */
  const insertionOrder: string[] = [];

  for (const schema of schemas) {
    for (const col of schema.columns) {
      const key = columnKey(col);
      const existing = columnMap.get(key);

      if (existing) {
        // Merge: union select options, keep first column's metadata
        const merged: ColumnDefinition = Object.freeze({
          ...existing,
          options: mergeSelectOptions(existing.options, col.options),
        });
        columnMap.set(key, merged);
      } else {
        columnMap.set(key, Object.freeze({ ...col }));
        insertionOrder.push(key);
      }
    }
  }

  const result = insertionOrder.map((key) => columnMap.get(key)!);
  return Object.freeze(result);
}
