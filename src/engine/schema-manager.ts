/**
 * Schema manager — parse, validate, and transform DatabaseSchema objects.
 * All operations are pure functions returning new schema instances.
 */

import type {
  DatabaseSchema,
  ColumnDefinition,
  ColumnType,
  ViewConfig,
  TableViewConfig,
} from "../types";
import type { CellValue, DatabaseRecord } from "../types/record";

/** Error thrown when schema validation fails. */
export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

/**
 * Validate that a schema has no duplicate column IDs and required fields.
 * Throws SchemaValidationError on invalid input.
 */
function validateSchema(schema: DatabaseSchema): void {
  if (!schema.name || typeof schema.name !== "string") {
    throw new SchemaValidationError("Schema must have a non-empty name");
  }
  if (!schema.source || typeof schema.source !== "string") {
    throw new SchemaValidationError("Schema must have a non-empty source path");
  }
  if (!Array.isArray(schema.columns)) {
    throw new SchemaValidationError("Schema columns must be an array");
  }
  if (!Array.isArray(schema.views)) {
    throw new SchemaValidationError("Schema views must be an array");
  }

  // Check for duplicate column IDs
  const columnIds = new Set<string>();
  for (const col of schema.columns) {
    if (!col.id) {
      throw new SchemaValidationError("Every column must have an id");
    }
    if (!col.type) {
      throw new SchemaValidationError(`Column "${col.id}" must have a type`);
    }
    if (!col.label) {
      throw new SchemaValidationError(`Column "${col.id}" must have a label`);
    }
    if (columnIds.has(col.id)) {
      throw new SchemaValidationError(`Duplicate column id: "${col.id}"`);
    }
    columnIds.add(col.id);
  }

  // Validate relation columns reference existing targets
  for (const col of schema.columns) {
    if (col.type === "relation" && !col.target) {
      throw new SchemaValidationError(
        `Relation column "${col.id}" must have a target`
      );
    }
    if (col.type === "rollup") {
      if (!col.relationColumn) {
        throw new SchemaValidationError(
          `Rollup column "${col.id}" must have a relationColumn`
        );
      }
      if (!col.targetColumn) {
        throw new SchemaValidationError(
          `Rollup column "${col.id}" must have a targetColumn`
        );
      }
      if (!col.rollupFunction) {
        throw new SchemaValidationError(
          `Rollup column "${col.id}" must have a rollupFunction`
        );
      }
    }
  }

  // Validate view IDs are unique
  const viewIds = new Set<string>();
  for (const view of schema.views) {
    if (!view.id) {
      throw new SchemaValidationError("Every view must have an id");
    }
    if (viewIds.has(view.id)) {
      throw new SchemaValidationError(`Duplicate view id: "${view.id}"`);
    }
    viewIds.add(view.id);
  }
}

/**
 * Parse a JSON string into a validated DatabaseSchema.
 * @param jsonString - Raw JSON content from a .database.json file.
 * @returns A validated DatabaseSchema object.
 */
export function parseSchema(jsonString: string): DatabaseSchema {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch {
    throw new SchemaValidationError("Invalid JSON string");
  }
  let schema = raw as DatabaseSchema;
  validateSchema(schema);
  // Default version to 1 for schemas without a version field
  if (!schema.version) {
    schema = { ...schema, version: 1 };
  }
  // Migrate legacy templateFolder to templateFolders array
  if (schema.templateFolder && !schema.templateFolders) {
    const { templateFolder, ...rest } = schema;
    schema = { ...rest, templateFolders: [{ path: templateFolder }] };
  }
  return schema;
}

/**
 * Serialize a DatabaseSchema to a pretty-printed JSON string.
 * @param schema - The schema to serialize.
 * @returns Pretty-printed JSON string.
 */
export function serializeSchema(schema: DatabaseSchema): string {
  return JSON.stringify(schema, null, 2);
}

/**
 * Return a new schema with the given column appended.
 * @param schema - The original schema (not mutated).
 * @param column - The column definition to add.
 * @returns A new schema with the column added.
 */
export function addColumn(
  schema: DatabaseSchema,
  column: ColumnDefinition
): DatabaseSchema {
  const existing = schema.columns.find((c) => c.id === column.id);
  if (existing) {
    throw new SchemaValidationError(`Column id "${column.id}" already exists`);
  }
  const result: DatabaseSchema = {
    ...schema,
    columns: [...schema.columns, column],
  };
  validateSchema(result);
  return result;
}

/**
 * Return a new schema without the specified column.
 * @param schema - The original schema (not mutated).
 * @param columnId - The ID of the column to remove.
 * @returns A new schema without the column.
 */
export function removeColumn(
  schema: DatabaseSchema,
  columnId: string
): DatabaseSchema {
  const exists = schema.columns.some((c) => c.id === columnId);
  if (!exists) {
    throw new SchemaValidationError(`Column "${columnId}" not found`);
  }
  return {
    ...schema,
    columns: schema.columns.filter((c) => c.id !== columnId),
  };
}

/**
 * Return a new schema with the specified column updated.
 * @param schema - The original schema (not mutated).
 * @param columnId - The ID of the column to update.
 * @param updates - Partial column definition to merge.
 * @returns A new schema with the updated column.
 */
export function updateColumn(
  schema: DatabaseSchema,
  columnId: string,
  updates: Partial<ColumnDefinition>
): DatabaseSchema {
  const index = schema.columns.findIndex((c) => c.id === columnId);
  if (index === -1) {
    throw new SchemaValidationError(`Column "${columnId}" not found`);
  }
  const updatedColumn: ColumnDefinition = {
    ...schema.columns[index],
    ...updates,
  };
  const newColumns = schema.columns.map((c, i) =>
    i === index ? updatedColumn : c
  );
  const result: DatabaseSchema = { ...schema, columns: newColumns };
  validateSchema(result);
  return result;
}

/**
 * Return a new schema with columns reordered according to the given ID list.
 * @param schema - The original schema (not mutated).
 * @param columnIds - Ordered array of column IDs.
 * @returns A new schema with columns in the specified order.
 */
export function reorderColumns(
  schema: DatabaseSchema,
  columnIds: readonly string[]
): DatabaseSchema {
  const colMap = new Map(schema.columns.map((c) => [c.id, c]));

  // Every existing column must appear in the list
  if (columnIds.length !== schema.columns.length) {
    throw new SchemaValidationError(
      "columnIds length must match number of columns"
    );
  }
  const reordered = columnIds.map((id) => {
    const col = colMap.get(id);
    if (!col) {
      throw new SchemaValidationError(`Column "${id}" not found in schema`);
    }
    return col;
  });
  return { ...schema, columns: reordered };
}

/**
 * Return a new schema with the given view appended.
 * @param schema - The original schema (not mutated).
 * @param view - The view configuration to add.
 * @returns A new schema with the view added.
 */
export function addView(
  schema: DatabaseSchema,
  view: ViewConfig
): DatabaseSchema {
  const existing = schema.views.find((v) => v.id === view.id);
  if (existing) {
    throw new SchemaValidationError(`View id "${view.id}" already exists`);
  }
  return { ...schema, views: [...schema.views, view] };
}

/**
 * Return a new schema without the specified view.
 * @param schema - The original schema (not mutated).
 * @param viewId - The ID of the view to remove.
 * @returns A new schema without the view.
 */
export function removeView(
  schema: DatabaseSchema,
  viewId: string
): DatabaseSchema {
  const exists = schema.views.some((v) => v.id === viewId);
  if (!exists) {
    throw new SchemaValidationError(`View "${viewId}" not found`);
  }
  return { ...schema, views: schema.views.filter((v) => v.id !== viewId) };
}

/**
 * Create a minimal default schema with a file column, a text column, and a table view.
 * @param name - The database name.
 * @returns A new DatabaseSchema with sensible defaults.
 */
export function createDefaultSchema(name: string): DatabaseSchema {
  const fileColumn: ColumnDefinition = {
    id: "file",
    type: "file",
    label: "Name",
  };
  const textColumn: ColumnDefinition = {
    id: "notes",
    type: "text",
    label: "Notes",
  };
  const tableView: TableViewConfig = {
    id: "default-table",
    type: "table",
    name: "Table",
  };
  return {
    name,
    source: ".",
    columns: [fileColumn, textColumn],
    views: [tableView],
  };
}

/**
 * Guess the column type from a sample of cell values.
 * @param values - Sample values from records for a given property.
 * @returns The best-guess ColumnType.
 */
export function guessColumnType(values: readonly CellValue[]): ColumnType {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonNull.length === 0) return "text";
  if (nonNull.every((v) => typeof v === "boolean")) return "checkbox";
  if (nonNull.every((v) => typeof v === "number")) return "number";
  if (nonNull.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))) return "date";
  if (nonNull.every((v) => Array.isArray(v))) return "multi-select";
  if (nonNull.every((v) => typeof v === "string")) {
    const unique = new Set(nonNull as readonly string[]);
    if (unique.size <= 10 && nonNull.length >= 3) return "select";
  }
  return "text";
}

/**
 * Auto-discover frontmatter properties not yet in the schema and add them as columns.
 * Returns a new schema with discovered columns appended, or the original if none found.
 *
 * @param schema - The current database schema.
 * @param records - All indexed database records.
 * @returns A new schema with discovered columns appended.
 */
export function discoverColumns(
  schema: DatabaseSchema,
  records: readonly DatabaseRecord[],
): DatabaseSchema {
  const schemaIds = new Set(schema.columns.map((c) => c.id));
  /** Built-in record properties that should not become columns. */
  const BUILTIN_PROPS = new Set(["name", "id", "file"]);
  const propMap = new Map<string, CellValue[]>();

  for (const record of records) {
    for (const [key, val] of Object.entries(record.values)) {
      if (schemaIds.has(key) || BUILTIN_PROPS.has(key)) continue;
      if (!propMap.has(key)) propMap.set(key, []);
      propMap.get(key)!.push(val);
    }
  }

  if (propMap.size === 0) return schema;

  const newColumns: readonly ColumnDefinition[] = Array.from(propMap.entries()).map(
    ([id, values]) => ({
      id,
      type: guessColumnType(values),
      label: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }),
  );

  return {
    ...schema,
    columns: [...schema.columns, ...newColumns],
  };
}
