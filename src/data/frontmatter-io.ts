/** Frontmatter I/O — parse, update, and remove YAML frontmatter fields from markdown content. */

import type { CellValue } from "../types";

/** Regex to match YAML frontmatter block between --- delimiters. */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

/** Regex to match a wikilink like [[Some Page]]. */
const WIKILINK_REGEX = /^\[\[(.+?)\]\]$/;

/** Regex to match an inline YAML array like [a, b, c]. */
const INLINE_ARRAY_REGEX = /^\[(.+)\]$/;

/**
 * Parse a single YAML value string into a typed CellValue.
 * Handles: null, booleans, numbers, wikilinks, inline arrays, and plain strings.
 * @param raw - The raw string value from YAML
 * @returns Parsed CellValue
 */
function parseValue(raw: string): CellValue {
  const trimmed = raw.trim();

  if (trimmed === "" || trimmed === "null" || trimmed === "~") {
    return null;
  }

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Wikilink: [[Page Name]]
  const wikiMatch = trimmed.match(WIKILINK_REGEX);
  if (wikiMatch) {
    return `[[${wikiMatch[1]}]]`;
  }

  // Inline array: [a, b, c]
  const inlineMatch = trimmed.match(INLINE_ARRAY_REGEX);
  if (inlineMatch) {
    return inlineMatch[1].split(",").map((item) => {
      const parsed = parseValue(item.trim());
      return parsed === null ? "" : parsed;
    }) as readonly string[] | readonly number[];
  }

  // Number
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== "") {
    return num;
  }

  // Strip surrounding quotes
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * Parse YAML frontmatter from markdown file content.
 * Returns an empty record if no frontmatter is found.
 * @param content - Full markdown file content
 * @returns Parsed frontmatter as key-value pairs
 */
export function parseFrontmatter(
  content: string,
): Record<string, CellValue> {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) return {};

  const yaml = match[1];
  if (!yaml.trim()) return {};

  const result: Record<string, CellValue> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const keyMatch = line.match(/^(\w[\w\s-]*?):\s*(.*)/);

    if (!keyMatch) {
      i++;
      continue;
    }

    const key = keyMatch[1].trim();
    const valuePart = keyMatch[2].trim();

    // Check for multiline array (next lines start with "- ")
    if (valuePart === "" && i + 1 < lines.length && lines[i + 1].match(/^\s+-\s/)) {
      const items: CellValue[] = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        const itemMatch = lines[i].match(/^\s+-\s+(.*)/);
        if (itemMatch) {
          items.push(parseValue(itemMatch[1]));
        }
        i++;
      }
      result[key] = items as readonly string[] | readonly number[];
      continue;
    }

    result[key] = parseValue(valuePart);
    i++;
  }

  return result;
}

/**
 * Serialize a CellValue into a YAML-compatible string for a single line.
 * @param value - The value to serialize
 * @returns YAML string representation
 */
function serializeValue(value: CellValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `[${(value as readonly (string | number)[]).join(", ")}]`;
  }
  // String — quote if it contains special chars
  const str = value as string;
  if (str.includes(":") || str.includes("#") || str.includes('"')) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

/**
 * Update a single frontmatter field, returning new file content.
 * Creates frontmatter block if none exists.
 * @param content - Original file content
 * @param key - Frontmatter key to set
 * @param value - New value for the key
 * @returns New file content with updated frontmatter
 */
export function updateFrontmatter(
  content: string,
  key: string,
  value: CellValue,
): string {
  const serialized = serializeValue(value);
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    // No frontmatter — create one
    return `---\n${key}: ${serialized}\n---\n${content}`;
  }

  const yaml = match[1];
  const lines = yaml.split(/\r?\n/);
  let found = false;
  const newLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const keyMatch = lines[i].match(/^(\w[\w\s-]*?):\s*/);
    if (keyMatch && keyMatch[1].trim() === key) {
      found = true;
      newLines.push(`${key}: ${serialized}`);
      i++;
      // Skip multiline array items belonging to this key
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        i++;
      }
      continue;
    }
    newLines.push(lines[i]);
    i++;
  }

  if (!found) {
    newLines.push(`${key}: ${serialized}`);
  }

  const newYaml = newLines.join("\n");
  return content.replace(FRONTMATTER_REGEX, `---\n${newYaml}\n---`);
}

/**
 * Remove a frontmatter field, returning new file content.
 * Returns content unchanged if the key doesn't exist.
 * @param content - Original file content
 * @param key - Frontmatter key to remove
 * @returns New file content with the field removed
 */
export function removeFrontmatterField(
  content: string,
  key: string,
): string {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) return content;

  const yaml = match[1];
  const lines = yaml.split(/\r?\n/);
  const newLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const keyMatch = lines[i].match(/^(\w[\w\s-]*?):\s*/);
    if (keyMatch && keyMatch[1].trim() === key) {
      i++;
      // Skip multiline array items
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        i++;
      }
      continue;
    }
    newLines.push(lines[i]);
    i++;
  }

  const newYaml = newLines.join("\n");
  return content.replace(FRONTMATTER_REGEX, `---\n${newYaml}\n---`);
}
