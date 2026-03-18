/** YAML group classifier for column types — determines migrate vs clear on type change. */

import type { ColumnType } from "../types";

/** YAML storage groups. Types within the same group can migrate data. */
export type YamlGroup = "array-options" | "string" | "number" | "boolean" | "date" | "wikilinks" | "computed";

/** Maps each column type to its YAML storage group. */
const GROUP_MAP: Record<ColumnType, YamlGroup> = {
  select: "array-options",
  "multi-select": "array-options",
  text: "string",
  number: "number",
  checkbox: "boolean",
  date: "date",
  relation: "wikilinks",
  rollup: "computed",
  formula: "computed",
  file: "computed",
};

/**
 * Get the YAML storage group for a column type.
 * @param type - The column type to classify.
 * @returns The YAML group name.
 */
export function getYamlGroup(type: ColumnType): YamlGroup {
  return GROUP_MAP[type] ?? "string";
}

/**
 * Check if two column types share the same YAML storage group.
 * Types in the same group can have their data migrated; cross-group changes clear values.
 * @param from - The source column type.
 * @param to - The target column type.
 * @returns True if both types are in the same YAML group.
 */
export function isSameGroup(from: ColumnType, to: ColumnType): boolean {
  return getYamlGroup(from) === getYamlGroup(to);
}
