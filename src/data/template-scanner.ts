/** Scans vault folders for .md template files. */

import type { App, TFile, TFolder } from "obsidian";
import type { TemplateFolderConfig } from "../types/schema";

/** A discovered template file. */
export interface Template {
  readonly name: string;
  readonly path: string;
  /** Which template folder this came from. */
  readonly folderPath: string;
}

/** All templates discovered from a single folder, including disabled status. */
export interface FolderTemplates {
  readonly folderPath: string;
  readonly templates: readonly TemplateEntry[];
}

/** A template entry with its enabled/disabled state. */
export interface TemplateEntry {
  readonly name: string;
  readonly path: string;
  readonly enabled: boolean;
}

/**
 * Check if an abstract file is a folder (duck-type for testability).
 * @param f - Abstract file from vault
 * @returns True if it has a children array
 */
function isFolder(f: unknown): f is TFolder {
  return f !== null && typeof f === "object" && "children" in f && Array.isArray((f as { children: unknown }).children);
}

/**
 * Check if an abstract file is a markdown file.
 * @param f - Abstract file from vault
 * @returns True if it has extension === "md"
 */
function isMdFile(f: unknown): f is TFile {
  return f !== null && typeof f === "object" && "extension" in f && (f as { extension: string }).extension === "md";
}

/**
 * Scan a single folder for .md files.
 * Returns alphabetically sorted templates with enabled/disabled status.
 *
 * @param app - Obsidian App instance
 * @param config - Folder config with path and optional disabled list
 * @returns FolderTemplates with all entries and their enabled state
 */
export function scanSingleFolder(
  app: App,
  config: TemplateFolderConfig,
): Promise<FolderTemplates> {
  const folder = app.vault.getAbstractFileByPath(config.path);
  if (!isFolder(folder)) return { folderPath: config.path, templates: [] };

  const disabled = new Set(config.disabledTemplates ?? []);
  const entries: TemplateEntry[] = folder.children
    .filter(isMdFile)
    .map((f) => ({
      name: f.basename,
      path: f.path,
      enabled: !disabled.has(f.basename),
    }));

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { folderPath: config.path, templates: entries };
}

/**
 * Scan multiple template folders and return only enabled templates.
 * This is the main entry point used by the controller to populate the picker.
 *
 * @param app - Obsidian App instance
 * @param folders - Array of folder configs
 * @returns Flat sorted array of enabled Template objects
 */
export async function scanTemplateFolders(
  app: App,
  folders: readonly TemplateFolderConfig[],
): Promise<readonly Template[]> {
  const results: Template[] = [];
  for (const config of folders) {
    const { folderPath, templates } = await scanSingleFolder(app, config);
    for (const t of templates) {
      if (t.enabled) {
        results.push({ name: t.name, path: t.path, folderPath });
      }
    }
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/**
 * Legacy single-folder scan — delegates to scanTemplateFolders.
 * @deprecated Use scanTemplateFolders instead.
 */
export async function scanTemplateFolder(
  app: App,
  folderPath: string,
): Promise<readonly Template[]> {
  return scanTemplateFolders(app, [{ path: folderPath }]);
}
