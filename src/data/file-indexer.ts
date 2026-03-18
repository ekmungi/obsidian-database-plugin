/** File indexer — creates DatabaseRecord instances from markdown files and their frontmatter. */

import type { TFile } from "obsidian";
import type { DatabaseRecord } from "../types";
import { parseFrontmatter } from "./frontmatter-io";

/**
 * Create a DatabaseRecord from a single file and its content.
 * Pure function — no side effects or Obsidian API calls.
 * @param file - The Obsidian TFile reference
 * @param content - The full markdown content of the file
 * @returns A frozen DatabaseRecord
 */
export function indexFile(file: TFile, content: string): DatabaseRecord {
  const frontmatter = parseFrontmatter(content);
  // Include file name in values so the query engine can sort/filter the "name" column
  const values = { ...frontmatter, name: file.basename };

  return Object.freeze({
    id: file.path,
    name: file.basename,
    file,
    values: Object.freeze(values),
    mtime: file.stat.mtime,
  });
}

/**
 * Index all .md files in a folder by reading their content via the injected reader.
 * Filters to only markdown files. Returns a frozen array of records.
 * @param files - Array of TFile objects to index
 * @param readContent - Injected function to read file content (avoids direct Obsidian API coupling)
 * @returns Promise resolving to an array of DatabaseRecords
 */
export async function indexFolder(
  files: readonly TFile[],
  readContent: (file: TFile) => Promise<string>,
): Promise<readonly DatabaseRecord[]> {
  const mdFiles = files.filter((f) => f.path.endsWith(".md"));

  const records = await Promise.all(
    mdFiles.map(async (file) => {
      const content = await readContent(file);
      return indexFile(file, content);
    }),
  );

  return Object.freeze(records);
}
