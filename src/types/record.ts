/** TypeScript types for database records derived from frontmatter. */

import type { TFile } from "obsidian";

/** A single cell value — the union of all possible frontmatter value types. */
export type CellValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[];

/** A record is a single row in the database, derived from one .md file. */
export interface DatabaseRecord {
  /** Unique identifier — the file path relative to the vault root. */
  readonly id: string;
  /** The note's display name (filename without extension). */
  readonly name: string;
  /** Reference to the Obsidian TFile for vault operations. */
  readonly file: TFile;
  /** Frontmatter values keyed by column ID. */
  readonly values: Readonly<Record<string, CellValue>>;
  /** Timestamp of last modification (for cache invalidation). */
  readonly mtime: number;
}

/** Event emitted when a record changes. */
export interface RecordChangeEvent {
  readonly type: "create" | "update" | "delete";
  readonly record: DatabaseRecord;
  readonly changedFields?: readonly string[];
}

/** Callback for record change subscriptions. */
export type RecordChangeHandler = (event: RecordChangeEvent) => void;
