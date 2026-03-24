/**
 * Shared data controller for database views — manages schema, records, file events,
 * and all mutation handlers. Used by both DatabaseView (tab) and codeblock renderer.
 */

import { App, TFile, TFolder, TAbstractFile, EventRef } from "obsidian";
import type { DatabaseSchema, CellValue, ColumnDefinition } from "../types";
import type { DatabaseRecord } from "../types/record";
import { updateFrontmatter, removeFrontmatterField } from "../data/frontmatter-io";
import { indexFile } from "../data/file-indexer";
import { parseSchema, createDefaultSchema, discoverColumns } from "../engine/schema-manager";
import { filterByDbViewType } from "../engine/query-engine";
import {
  parseWikilinks,
  formatWikilink,
  computeBidirectionalUpdates,
  computeBidirectionalRemovals,
} from "../engine/relation-resolver";
import { pickNextColor } from "../engine/color-cycle";
import { renameOptionInValue, removeOptionFromValue } from "../engine/option-operations";
import { scanTemplateFolders, scanSingleFolder } from "../data/template-scanner";
import type { Template, FolderTemplates } from "../data/template-scanner";

const SCHEMA_FILENAME = ".database.json";

/** Callbacks the controller uses to communicate with its host (view or codeblock). */
export interface ControllerCallbacks {
  /** Called whenever records or schema change — host should re-render. */
  readonly onStateChange: () => void;
  /** Called to refresh other open views showing the same folder. */
  readonly onRefreshFolder?: (folderPath: string) => void;
  /** Called to update the host's header/title (e.g. tab title). */
  readonly onHeaderUpdate?: () => void;
}

/**
 * DatabaseController — shared data layer for schema, records, and file operations.
 * Does not own any DOM or Preact rendering — that's the host's responsibility.
 */
export class DatabaseController {
  private readonly app: App;
  private readonly callbacks: ControllerCallbacks;

  /** Current database folder path. */
  public folderPath: string | null = null;
  /** Parsed schema from .database.json. */
  public schema: DatabaseSchema | null = null;
  /** Indexed records from markdown files. */
  public records: readonly DatabaseRecord[] = [];
  /** Cached target records for relation columns, keyed by folder path. */
  public targetRecordsCache = new Map<string, readonly DatabaseRecord[]>();
  /** Enabled templates for the picker dropdown (flat list). */
  public templates: readonly Template[] = [];
  /** Per-folder template entries with enabled/disabled status (for settings UI). */
  public folderTemplates: readonly FolderTemplates[] = [];

  /** Track files we just created to prevent duplicate adds from on('create'). */
  private recentlyCreated = new Set<string>();
  /** Serialization queue for cell changes — prevents concurrent bidirectional sync races. */
  private cellChangeQueue: Promise<void> = Promise.resolve();
  /** Pending backlink cleanups keyed by file path. */
  private pendingCleanups = new Map<string, { timer: ReturnType<typeof setTimeout>; record: DatabaseRecord }>();
  /** Watched target folder paths to avoid duplicate watchers. */
  private watchedTargetPaths = new Set<string>();

  constructor(app: App, callbacks: ControllerCallbacks) {
    this.app = app;
    this.callbacks = callbacks;
  }

  /** Load schema, index records, sync options and types, create .dbview file. */
  async loadDatabase(folderPath: string): Promise<void> {
    this.folderPath = folderPath;
    const schemaPath = `${folderPath}/${SCHEMA_FILENAME}`;

    try {
      const content = await this.app.vault.adapter.read(schemaPath);
      this.schema = parseSchema(content);
      console.debug("Database Plugin: Schema loaded", schemaPath, this.schema.columns.length, "columns");
    } catch (err) {
      console.warn("Database Plugin: Schema load failed, using default", schemaPath, err);
      this.schema = createDefaultSchema(folderPath.split("/").pop() ?? "Database");
    }

    await this.indexRecords();

    /* Auto-discover frontmatter properties not yet in schema and add as columns. */
    const discovered = discoverColumns(this.schema, this.records);
    if (discovered !== this.schema) {
      const newCount = discovered.columns.length - this.schema.columns.length;
      this.schema = discovered;
      console.debug("Database Plugin: Auto-discovered", newCount, "new columns");
      const path = `${this.folderPath}/${SCHEMA_FILENAME}`;
      await this.app.vault.adapter.write(path, JSON.stringify(this.schema, null, 2));
    }

    this.ensureDbViewTypeColumn();
    this.syncSchemaOptionsFromRecords();
    await this.syncPropertyTypesToObsidian();
    await this.ensureDbviewFile();
    await this.loadAllTargetRecords();
    await this.discoverTemplates();
  }

  /** Clean up timers and reset state. */
  destroy(): void {
    for (const [, pending] of this.pendingCleanups) {
      clearTimeout(pending.timer);
    }
    this.pendingCleanups.clear();
    this.recentlyCreated.clear();
    this.watchedTargetPaths.clear();
    this.targetRecordsCache.clear();
    this.templates = [];
    this.folderTemplates = [];
    this.schema = null;
    this.records = [];
    this.folderPath = null;
  }

  /** Scan all configured template folders for .md template files. */
  async discoverTemplates(): Promise<void> {
    const folders = this.schema?.templateFolders ?? [];
    if (folders.length > 0) {
      this.templates = await scanTemplateFolders(this.app, folders);
      this.folderTemplates = await Promise.all(
        folders.map((config) => scanSingleFolder(this.app, config))
      );
    } else {
      this.templates = [];
      this.folderTemplates = [];
    }
  }

  /**
   * Register vault file events. The host provides a registration function
   * so ItemView can use this.registerEvent() and codeblocks can track EventRefs manually.
   */
  registerFileEvents(registerFn: (ref: EventRef) => void): void {
    registerFn(
      this.app.vault.on("modify", async (file) => {
        if (
          file instanceof TFile &&
          file.extension === "md" &&
          this.isFileInDatabase(file.path)
        ) {
          const content = await this.app.vault.read(file);
          const updated = indexFile(file, content);
          this.records = this.records.map((r) =>
            r.id === file.path ? updated : r
          );
          this.syncSchemaOptionsFromRecords();
          this.callbacks.onStateChange();
        }
      })
    );

    registerFn(
      this.app.vault.on("delete", async (file) => {
        if (file instanceof TFile && this.folderPath) {
          const isInFolder = file.path.startsWith(this.folderPath + "/");
          if (isInFolder) {
            const deletedRecord = this.records.find((r) => r.id === file.path);
            if (deletedRecord) {
              this.records = this.records.filter((r) => r.id !== file.path);
              this.callbacks.onStateChange();
              const timer = setTimeout(async () => {
                this.pendingCleanups.delete(file.path);
                await this.cleanupBacklinksForRecord(deletedRecord);
              }, 2000);
              this.pendingCleanups.set(file.path, { timer, record: deletedRecord });
            }
          }
        }
      })
    );

    registerFn(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (!(file instanceof TFile) || !this.folderPath) return;

        const wasInFolder = oldPath.startsWith(this.folderPath + "/");
        const isInFolder = file.path.startsWith(this.folderPath + "/") && file.extension === "md";

        if (wasInFolder && !isInFolder) {
          this.records = this.records.filter((r) => r.id !== oldPath);
          this.callbacks.onStateChange();
        } else if (!wasInFolder && isInFolder) {
          const content = await this.app.vault.read(file);
          const record = indexFile(file, content);
          this.records = [...this.records, record];
          this.callbacks.onStateChange();
        } else if (wasInFolder && isInFolder) {
          const content = await this.app.vault.read(file);
          const record = indexFile(file, content);
          this.records = this.records.map((r) =>
            r.id === oldPath ? record : r
          );
          this.callbacks.onStateChange();
        }
      })
    );

    registerFn(
      this.app.vault.on("create", async (file) => {
        if (
          file instanceof TFile &&
          file.extension === "md" &&
          this.isFileInDatabase(file.path)
        ) {
          if (this.recentlyCreated.has(file.path)) {
            this.recentlyCreated.delete(file.path);
            return;
          }
          if (this.records.some((r) => r.id === file.path)) return;
          const content = await this.app.vault.read(file);
          const record = indexFile(file, content);
          this.records = [...this.records, record];
          this.cancelPendingCleanup(record);
          this.callbacks.onStateChange();
        }
      })
    );

    this.registerTargetFolderWatchers(registerFn);
  }

  /* ── Cell Handlers ─────────────────────────── */

  /** Handle cell edits — serialized through a queue to prevent concurrent races. */
  handleCellChange = (recordId: string, field: string, value: CellValue): void => {
    this.cellChangeQueue = this.cellChangeQueue.then(() =>
      this.executeCellChange(recordId, field, value)
    );
  };

  /** Execute a single cell change — writes frontmatter and syncs bidirectional links. */
  private async executeCellChange(recordId: string, field: string, value: CellValue): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(recordId);
    if (!(file instanceof TFile)) return;

    const col = this.schema?.columns.find((c) => c.id === field);
    let writeValue = value;

    if (col) {
      if (col.type === "select") {
        if (value === null || value === "") {
          writeValue = [];
        } else if (typeof value === "string") {
          writeValue = [value];
        }
      }
    }

    const previousValue = this.records.find((r) => r.id === recordId)?.values[field] ?? null;
    const content = await this.app.vault.read(file);
    const newContent = updateFrontmatter(content, field, writeValue);
    await this.app.vault.modify(file, newContent);

    const updatedRecord = indexFile(file, newContent);
    this.records = this.records.map((r) =>
      r.id === recordId ? updatedRecord : r
    );

    await this.syncBidirectionalLinks(field, updatedRecord, previousValue);
    this.callbacks.onStateChange();
  }

  /** Sync bidirectional back-links after a relation cell change. */
  private async syncBidirectionalLinks(
    field: string, sourceRecord: DatabaseRecord, previousValue: CellValue
  ): Promise<void> {
    if (!this.schema) return;

    const col = this.schema.columns.find((c) => c.id === field);
    if (!col || col.type !== "relation" || !col.bidirectional || !col.reverseColumnId || !col.target) return;

    const targetRecords = this.targetRecordsCache.get(col.target);
    if (!targetRecords || targetRecords.length === 0) return;

    const addUpdates = computeBidirectionalUpdates(sourceRecord, field, col.reverseColumnId, targetRecords);
    const previousNames = parseWikilinks(previousValue);
    const currentNames = parseWikilinks(sourceRecord.values[field]);
    const removeUpdates = computeBidirectionalRemovals(
      previousNames, currentNames, sourceRecord.name, col.reverseColumnId, targetRecords
    );

    const allUpdates = [...addUpdates, ...removeUpdates];
    for (const update of allUpdates) {
      try {
        const targetFile = this.app.vault.getAbstractFileByPath(update.recordId);
        if (!(targetFile instanceof TFile)) continue;
        const targetContent = await this.app.vault.read(targetFile);
        const updatedContent = updateFrontmatter(targetContent, update.field, update.value);
        await this.app.vault.modify(targetFile, updatedContent);
      } catch (err) {
        console.error(`Database Plugin: Failed to sync back-link to ${update.recordId}`, err);
      }
    }

    if (allUpdates.length > 0) {
      await this.loadTargetRecords(col.target);
      this.callbacks.onRefreshFolder?.(col.target);
    }
  }

  /* ── Record Handlers ───────────────────────── */

  /** Handle new record creation. */
  handleNewRecord = async (templatePath?: string | null): Promise<void> => {
    if (!this.folderPath || !this.schema) return;

    try {
      const baseName = `Untitled`;
      let filePath = `${this.folderPath}/${baseName}.md`;
      let counter = 1;
      while (this.app.vault.getAbstractFileByPath(filePath)) {
        filePath = `${this.folderPath}/${baseName} ${counter}.md`;
        counter++;
      }

      let content = "---\n";
      if (this.schema.dbViewType) {
        content += `db-view-type: ${this.schema.dbViewType}\n`;
      }
      for (const col of this.schema.columns) {
        if (col.type === "file" || col.type === "rollup" || col.type === "formula") continue;
        if (col.id === "db-view-type" && this.schema.dbViewType) continue;
        switch (col.type) {
          case "checkbox": content += `${col.id}: false\n`; break;
          case "number": content += `${col.id}: 0\n`; break;
          default: content += `${col.id}: \n`; break;
        }
      }
      content += "---\n";

      if (templatePath) {
        const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
        if (templateFile instanceof TFile) {
          content = await this.app.vault.read(templateFile);
        }
      }

      this.recentlyCreated.add(filePath);
      const newFile = await this.app.vault.create(filePath, content);
      const record = indexFile(newFile, content);
      this.records = [...this.records, record];
      this.callbacks.onStateChange();

      // Open the new note for editing
      void this.app.workspace.getLeaf("tab").openFile(newFile);
    } catch (err) {
      console.error("Database Plugin: Failed to create new record", err);
    }
  };

  /** Handle note navigation — open the file in a new tab. */
  handleOpenNote = (record: DatabaseRecord): void => {
    const file = this.app.vault.getAbstractFileByPath(record.id);
    if (file instanceof TFile) {
      void this.app.workspace.getLeaf("tab").openFile(file);
    }
  };

  /** Navigate to a note by name — searches all vault files. */
  handleNavigateToNote = (noteName: string): void => {
    const allFiles = this.app.vault.getMarkdownFiles();
    const file = allFiles.find((f) => f.basename === noteName);
    if (file) {
      void this.app.workspace.getLeaf("tab").openFile(file);
    }
  };

  /** Rename a record's file. */
  handleRenameFile = async (recordId: string, newName: string): Promise<void> => {
    const file = this.app.vault.getAbstractFileByPath(recordId);
    if (!(file instanceof TFile)) return;

    const folder = file.parent?.path ?? "";
    const newPath = folder ? `${folder}/${newName}.md` : `${newName}.md`;

    if (this.app.vault.getAbstractFileByPath(newPath)) {
      console.warn(`Database Plugin: File "${newPath}" already exists, skipping rename`);
      return;
    }

    try {
      await this.app.vault.rename(file, newPath);
    } catch (err) {
      console.error(`Database Plugin: Failed to rename "${recordId}" to "${newPath}"`, err);
    }
  };

  /** Delete multiple records — cleans up bidirectional back-links, then deletes files. */
  handleDeleteRecords = async (recordIds: readonly string[]): Promise<void> => {
    for (const recordId of recordIds) {
      const record = this.records.find((r) => r.id === recordId);
      if (!record) continue;
      await this.cleanupBacklinksForRecord(record);

      const file = this.app.vault.getAbstractFileByPath(recordId);
      if (file instanceof TFile) {
        try {
          await this.app.fileManager.trashFile(file);
        } catch (err) {
          console.error(`Database Plugin: Failed to delete "${recordId}"`, err);
        }
      }
    }
    const deletedSet = new Set(recordIds);
    this.records = this.records.filter((r) => !deletedSet.has(r.id));
    this.callbacks.onStateChange();
  };

  /** Create a new record in a target relation folder. */
  handleCreateRelationRecord = async (targetFolder: string, name: string): Promise<void> => {
    const filePath = `${targetFolder}/${name}.md`;
    if (this.app.vault.getAbstractFileByPath(filePath)) return;

    try {
      const targetSchemaPath = `${targetFolder}/${SCHEMA_FILENAME}`;
      let content = "---\n";
      try {
        const schemaContent = await this.app.vault.adapter.read(targetSchemaPath);
        const targetSchema = parseSchema(schemaContent);
        if (targetSchema.dbViewType) {
          content += `db-view-type: ${targetSchema.dbViewType}\n`;
        }
        for (const col of targetSchema.columns) {
          if (col.type === "file" || col.type === "rollup" || col.type === "formula") continue;
          if (col.id === "db-view-type" && targetSchema.dbViewType) continue;
          switch (col.type) {
            case "checkbox": content += `${col.id}: false\n`; break;
            case "number": content += `${col.id}: 0\n`; break;
            default: content += `${col.id}: \n`; break;
          }
        }
      } catch {
        // No target schema
      }
      content += "---\n";

      await this.app.vault.create(filePath, content);
      await this.loadTargetRecords(targetFolder);
      this.callbacks.onStateChange();
    } catch (err) {
      console.error(`Database Plugin: Failed to create relation record "${filePath}"`, err);
    }
  };

  /* ── Schema Handlers ───────────────────────── */

  /** Handle schema changes — save to .database.json. */
  handleSchemaChange = async (schema: DatabaseSchema): Promise<void> => {
    if (!this.folderPath) return;

    const recursiveChanged = this.schema?.recursive !== schema.recursive;
    const oldName = this.schema?.name;
    this.schema = schema;
    const schemaPath = `${this.folderPath}/${SCHEMA_FILENAME}`;
    const content = JSON.stringify(schema, null, 2);

    await this.app.vault.adapter.write(schemaPath, content);

    /* Rename the .dbview file when the database name changes. */
    if (oldName && schema.name && oldName !== schema.name) {
      const oldPath = `${this.folderPath}/${oldName}.dbview`;
      const newPath = `${this.folderPath}/${schema.name}.dbview`;
      const oldFile = this.app.vault.getAbstractFileByPath(oldPath);
      if (oldFile) {
        try {
          await this.app.vault.rename(oldFile, newPath);
        } catch {
          /* Target may already exist or folder may be read-only */
        }
      }
    }
    if (recursiveChanged) {
      await this.indexRecords();
    }
    await this.syncPropertyTypesToObsidian();
    await this.ensureBidirectionalReverseColumns();
    await this.loadAllTargetRecords();
    await this.discoverTemplates();
    this.callbacks.onHeaderUpdate?.();
    this.callbacks.onStateChange();
  };

  /** For each bidirectional relation column, ensure the reverse column exists in the target schema. */
  private async ensureBidirectionalReverseColumns(): Promise<void> {
    if (!this.schema || !this.folderPath) return;

    const biDirColumns = this.schema.columns.filter(
      (c) => c.type === "relation" && c.bidirectional && c.reverseColumnId && c.target
    );

    for (const col of biDirColumns) {
      const targetSchemaPath = `${col.target}/${SCHEMA_FILENAME}`;
      try {
        const content = await this.app.vault.adapter.read(targetSchemaPath);
        const targetSchema = parseSchema(content);

        if (targetSchema.columns.some((c) => c.id === col.reverseColumnId)) continue;

        const reverseColumn = {
          id: col.reverseColumnId!,
          type: "relation" as const,
          label: col.reverseColumnId!,
          target: this.folderPath,
          multiple: true,
          bidirectional: true,
          reverseColumnId: col.id,
        };

        const updatedTargetSchema = {
          ...targetSchema,
          columns: [...targetSchema.columns, reverseColumn],
        };
        await this.app.vault.adapter.write(
          targetSchemaPath,
          JSON.stringify(updatedTargetSchema, null, 2)
        );

        const targetFolder = this.app.vault.getAbstractFileByPath(col.target!);
        if (targetFolder instanceof TFolder) {
          const mdFiles = targetFolder.children.filter(
            (f): f is TFile => f instanceof TFile && f.extension === "md"
          );
          for (const file of mdFiles) {
            try {
              const fileContent = await this.app.vault.read(file);
              const updated = updateFrontmatter(fileContent, col.reverseColumnId!, "");
              if (updated !== fileContent) {
                await this.app.vault.modify(file, updated);
              }
            } catch {
              // Skip files that can't be read/written
            }
          }
        }

        console.debug(`Database Plugin: Auto-created reverse column "${col.reverseColumnId}" in ${col.target}`);
        this.callbacks.onRefreshFolder?.(col.target!);
      } catch {
        // Target schema doesn't exist
      }
    }
  }

  /** Add a frontmatter property to all existing records. */
  handleAddPropertyToAll = async (field: string, defaultValue: CellValue): Promise<void> => {
    for (const record of this.records) {
      try {
        const file = this.app.vault.getAbstractFileByPath(record.id);
        if (!(file instanceof TFile)) continue;
        const content = await this.app.vault.read(file);
        const newContent = updateFrontmatter(content, field, defaultValue);
        await this.app.vault.modify(file, newContent);
      } catch (err) {
        console.error(`Database Plugin: Failed to add property "${field}" to ${record.id}`, err);
      }
    }
    await this.indexRecords();
    this.callbacks.onStateChange();
  };

  /** Remove a frontmatter property from all existing records. */
  handleRemovePropertyFromAll = async (field: string): Promise<void> => {
    for (const record of this.records) {
      try {
        const file = this.app.vault.getAbstractFileByPath(record.id);
        if (!(file instanceof TFile)) continue;
        const content = await this.app.vault.read(file);
        const newContent = removeFrontmatterField(content, field);
        await this.app.vault.modify(file, newContent);
      } catch (err) {
        console.error(`Database Plugin: Failed to remove property "${field}" from ${record.id}`, err);
      }
    }
    await this.removePropertyTypeIfUnused(field);
    await this.indexRecords();
    this.callbacks.onStateChange();
  };

  /** Clear values for a property across all records. */
  handleClearPropertyFromAll = async (field: string): Promise<void> => {
    for (const record of this.records) {
      try {
        const file = this.app.vault.getAbstractFileByPath(record.id);
        if (!(file instanceof TFile)) continue;
        const content = await this.app.vault.read(file);
        const newContent = updateFrontmatter(content, field, null);
        await this.app.vault.modify(file, newContent);
      } catch (err) {
        console.error(`Database Plugin: Failed to clear "${field}" in ${record.id}`, err);
      }
    }
    await this.indexRecords();
    this.callbacks.onStateChange();
  };

  /** Rename an option value across all records' frontmatter. */
  handleRenameOption = async (field: string, oldName: string, newName: string): Promise<void> => {
    for (const record of this.records) {
      try {
        const val = record.values[field];
        if (val === null || val === undefined) continue;
        const updated = renameOptionInValue(val, oldName, newName);
        if (updated === val) continue;
        const file = this.app.vault.getAbstractFileByPath(record.id);
        if (!(file instanceof TFile)) continue;
        const content = await this.app.vault.read(file);
        const newContent = updateFrontmatter(content, field, updated);
        await this.app.vault.modify(file, newContent);
      } catch (err) {
        console.error(`Database Plugin: Failed to rename option "${oldName}" in ${record.id}`, err);
      }
    }
    await this.indexRecords();
    this.callbacks.onStateChange();
  };

  /** Remove an option value from all records' frontmatter. */
  handleDeleteOption = async (field: string, optionName: string): Promise<void> => {
    for (const record of this.records) {
      try {
        const val = record.values[field];
        if (val === null || val === undefined) continue;
        const updated = removeOptionFromValue(val, optionName);
        const file = this.app.vault.getAbstractFileByPath(record.id);
        if (!(file instanceof TFile)) continue;
        const content = await this.app.vault.read(file);
        const newContent = updateFrontmatter(content, field, updated);
        await this.app.vault.modify(file, newContent);
      } catch (err) {
        console.error(`Database Plugin: Failed to delete option "${optionName}" in ${record.id}`, err);
      }
    }
    await this.indexRecords();
    this.callbacks.onStateChange();
  };

  /** Clean up everything in the target database when a bidirectional relation column is deleted. */
  handleCleanupBidirectionalLinks = async (column: ColumnDefinition): Promise<void> => {
    if (!column.target || !column.reverseColumnId || !column.bidirectional) return;

    const targetFolder = this.app.vault.getAbstractFileByPath(column.target);
    if (targetFolder instanceof TFolder) {
      const mdFiles = targetFolder.children.filter(
        (f): f is TFile => f instanceof TFile && f.extension === "md"
      );
      for (const file of mdFiles) {
        try {
          const content = await this.app.vault.read(file);
          const newContent = removeFrontmatterField(content, column.reverseColumnId!);
          if (newContent !== content) {
            await this.app.vault.modify(file, newContent);
          }
        } catch (err) {
          console.error(`Database Plugin: Failed to remove "${column.reverseColumnId}" from ${file.path}`, err);
        }
      }
    }

    const targetSchemaPath = `${column.target}/${SCHEMA_FILENAME}`;
    try {
      const schemaContent = await this.app.vault.adapter.read(targetSchemaPath);
      const targetSchema = parseSchema(schemaContent);
      const hasReverseCol = targetSchema.columns.some((c) => c.id === column.reverseColumnId);
      if (hasReverseCol) {
        const updatedSchema = {
          ...targetSchema,
          columns: targetSchema.columns.filter((c) => c.id !== column.reverseColumnId),
        };
        await this.app.vault.adapter.write(targetSchemaPath, JSON.stringify(updatedSchema, null, 2));
      }
    } catch {
      // Target schema doesn't exist
    }

    await this.loadTargetRecords(column.target);
    console.debug(`Database Plugin: Cleaned up reverse column "${column.reverseColumnId}" from ${column.target}`);
    this.callbacks.onRefreshFolder?.(column.target);
  };

  /* ── Data Methods ──────────────────────────── */

  /** Recursively collect all .md files from a folder and its subfolders. */
  private collectMdFiles(folder: TFolder): TFile[] {
    const result: TFile[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === "md") {
        result.push(child);
      } else if (child instanceof TFolder) {
        result.push(...this.collectMdFiles(child));
      }
    }
    return result;
  }

  /** Index all markdown files in the database folder. */
  private async indexRecords(): Promise<void> {
    if (!this.folderPath) return;

    const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
    if (!(folder instanceof TFolder)) {
      this.records = [];
      return;
    }

    const mdFiles = this.schema?.recursive
      ? this.collectMdFiles(folder)
      : folder.children.filter(
          (f): f is TFile => f instanceof TFile && f.extension === "md"
        );

    const indexed = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await this.app.vault.read(file);
        return indexFile(file, content);
      })
    );

    this.records = indexed;
  }

  /** Load target records for all relation columns. */
  private async loadAllTargetRecords(): Promise<void> {
    if (!this.schema) return;
    const relationColumns = this.schema.columns.filter((c) => c.type === "relation" && c.target);
    for (const col of relationColumns) {
      if (col.target) {
        await this.loadTargetRecords(col.target);
      }
    }
  }

  /** Index .md files in a target folder with dbViewType filter. */
  private async loadTargetRecords(folderPath: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      this.targetRecordsCache.set(folderPath, []);
      return;
    }

    let targetRecursive = false;
    const targetSchemaPath = `${folderPath}/${SCHEMA_FILENAME}`;
    let targetSchema: DatabaseSchema | null = null;
    try {
      const schemaContent = await this.app.vault.adapter.read(targetSchemaPath);
      targetSchema = parseSchema(schemaContent);
      targetRecursive = targetSchema.recursive ?? false;
    } catch {
      // No target schema
    }

    const mdFiles = targetRecursive
      ? this.collectMdFiles(folder)
      : folder.children.filter(
          (f): f is TFile => f instanceof TFile && f.extension === "md"
        );

    const indexed = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await this.app.vault.read(file);
        return indexFile(file, content);
      })
    );

    let filtered: readonly DatabaseRecord[] = indexed;
    try {
      if (targetSchema?.dbViewType) {
        filtered = filterByDbViewType(indexed, targetSchema.dbViewType);
      }
    } catch {
      // No filter needed
    }

    this.targetRecordsCache.set(folderPath, filtered);
  }

  /** Get all vault folder paths for autocomplete inputs. */
  getVaultFolderPaths(): readonly string[] {
    return this.app.vault.getAllLoadedFiles()
      .filter((f: TAbstractFile): f is TFolder => f instanceof TFolder)
      .map((f) => f.path)
      .filter((p) => p !== "/")
      .sort();
  }

  /* ── Sync Methods ──────────────────────────── */

  /** Ensure db-view-type column exists and is hidden when dbViewType is set. */
  private ensureDbViewTypeColumn(): void {
    if (!this.schema || !this.schema.dbViewType) return;

    let updated = false;
    let schema = this.schema;

    if (!schema.columns.some((c) => c.id === "db-view-type")) {
      schema = {
        ...schema,
        columns: [...schema.columns, { id: "db-view-type", type: "text" as const, label: "db view type" }],
      };
      updated = true;
    }

    const updatedViews = schema.views.map((view) => {
      const hidden = view.hiddenColumns ?? [];
      if (!hidden.includes("db-view-type")) {
        return { ...view, hiddenColumns: [...hidden, "db-view-type"] };
      }
      return view;
    });

    if (JSON.stringify(updatedViews) !== JSON.stringify(schema.views)) {
      schema = { ...schema, views: updatedViews };
      updated = true;
    }

    if (updated) {
      this.schema = schema;
      const schemaPath = `${this.folderPath}/${SCHEMA_FILENAME}`;
      void this.app.vault.adapter.write(schemaPath, JSON.stringify(schema, null, 2));
    }
  }

  /** Discover select/multi-select option values from records not in schema yet. */
  private syncSchemaOptionsFromRecords(): void {
    if (!this.schema) return;

    let changed = false;
    const updatedColumns = this.schema.columns.map((col) => {
      if (col.type !== "select" && col.type !== "multi-select") return col;
      if (!col.options) return col;

      const knownValues = new Set(col.options.map((o) => o.value));
      const newOptions = [...col.options];

      for (const record of this.records) {
        const val = record.values[col.id];
        const values = Array.isArray(val) ? val as readonly string[] : (typeof val === "string" && val ? [val] : []);
        for (const v of values) {
          if (typeof v !== "string" || !v || v === "[]" || v.startsWith("[")) continue;
          if (!knownValues.has(v)) {
            knownValues.add(v);
            const autoColor = pickNextColor(newOptions);
            newOptions.push({ value: v, color: autoColor });
            changed = true;
          }
        }
      }

      return changed ? { ...col, options: newOptions } : col;
    });

    if (changed) {
      this.schema = { ...this.schema, columns: updatedColumns };
      const schemaPath = `${this.folderPath}/${SCHEMA_FILENAME}`;
      void this.app.vault.adapter.write(schemaPath, JSON.stringify(this.schema, null, 2));
    }
  }

  /** Sync column types to Obsidian's types.json in the config directory. */
  private async syncPropertyTypesToObsidian(): Promise<void> {
    if (!this.schema) return;

    const typesPath = `${this.app.vault.configDir}/types.json`;
    let typesData: { types: Record<string, string> } = { types: {} };

    try {
      const content = await this.app.vault.adapter.read(typesPath);
      typesData = JSON.parse(content);
      if (!typesData.types) typesData.types = {};
    } catch {
      // Start fresh
    }

    const typeMap: Record<string, string> = {
      text: "text", number: "number", date: "date",
      select: "multitext", "multi-select": "multitext",
      checkbox: "checkbox", relation: "multitext",
    };

    let changed = false;
    for (const col of this.schema.columns) {
      if (col.type === "file" || col.type === "rollup" || col.type === "formula") continue;
      const obsidianType = typeMap[col.type];
      if (!obsidianType) continue;
      if (typesData.types[col.id] !== obsidianType) {
        typesData.types[col.id] = obsidianType;
        changed = true;
      }
    }

    if (changed) {
      await this.app.vault.adapter.write(typesPath, JSON.stringify(typesData, null, 2));
      console.debug("Database Plugin: Synced property types to types.json");
    }
  }

  /** Remove a property type from .obsidian/types.json only if no other file uses it. */
  private async removePropertyTypeIfUnused(propertyId: string): Promise<void> {
    const allFiles = this.app.vault.getMarkdownFiles();
    const folderPrefix = this.folderPath ? this.folderPath + "/" : "";

    for (const file of allFiles) {
      if (file.path.startsWith(folderPrefix)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter && propertyId in cache.frontmatter) {
        return;
      }
    }

    const typesPath = `${this.app.vault.configDir}/types.json`;
    try {
      const content = await this.app.vault.adapter.read(typesPath);
      const typesData = JSON.parse(content);
      if (typesData.types && propertyId in typesData.types) {
        delete typesData.types[propertyId];
        await this.app.vault.adapter.write(typesPath, JSON.stringify(typesData, null, 2));
        console.debug(`Database Plugin: Removed unused property type "${propertyId}" from types.json`);
      }
    } catch {
      // types.json not readable
    }
  }

  /** Ensure a .dbview entry point file exists in the database folder. */
  private async ensureDbviewFile(): Promise<void> {
    if (!this.folderPath || !this.schema) return;
    const name = this.schema.name || this.folderPath.split("/").pop() || "Database";
    const filePath = `${this.folderPath}/${name}.dbview`;
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (!existing) {
      try {
        await this.app.vault.create(filePath, this.folderPath);
      } catch {
        // File may already exist or folder may be read-only
      }
    }
  }

  /* ── Backlink Cleanup ──────────────────────── */

  /** Clean up all bidirectional back-links for a deleted record. */
  private async cleanupBacklinksForRecord(record: DatabaseRecord): Promise<void> {
    if (!this.schema) return;

    const relationColumns = this.schema.columns.filter(
      (c) => c.type === "relation" && c.bidirectional && c.reverseColumnId && c.target
    );

    for (const col of relationColumns) {
      const linkedNames = parseWikilinks(record.values[col.id]);
      if (linkedNames.length === 0) continue;

      const targetRecords = this.targetRecordsCache.get(col.target!);
      if (!targetRecords) continue;

      const removeUpdates = computeBidirectionalRemovals(
        linkedNames, [], record.name, col.reverseColumnId!, targetRecords
      );

      for (const update of removeUpdates) {
        try {
          const targetFile = this.app.vault.getAbstractFileByPath(update.recordId);
          if (!(targetFile instanceof TFile)) continue;
          const content = await this.app.vault.read(targetFile);
          const updatedContent = updateFrontmatter(content, update.field, update.value);
          await this.app.vault.modify(targetFile, updatedContent);
        } catch (err) {
          console.error(`Database Plugin: Failed to clean up back-link in ${update.recordId}`, err);
        }
      }

      if (removeUpdates.length > 0) {
        await this.loadTargetRecords(col.target!);
        this.callbacks.onRefreshFolder?.(col.target!);
      }
    }
  }

  /** Cancel a pending backlink cleanup if a create event matches a recent delete. */
  private cancelPendingCleanup(newRecord: DatabaseRecord): void {
    if (!this.schema) return;

    for (const [oldPath, pending] of this.pendingCleanups) {
      const relationColumns = this.schema.columns.filter(
        (c) => c.type === "relation" && c.bidirectional && c.reverseColumnId && c.target
      );
      const hasMatchingRelations = relationColumns.some((col) => {
        const oldLinks = parseWikilinks(pending.record.values[col.id]);
        const newLinks = parseWikilinks(newRecord.values[col.id]);
        return oldLinks.length > 0 && oldLinks.length === newLinks.length &&
          oldLinks.every((l) => newLinks.some((n) => n.toLowerCase() === l.toLowerCase()));
      });

      if (!hasMatchingRelations) continue;

      clearTimeout(pending.timer);
      this.pendingCleanups.delete(oldPath);
      return;
    }
  }

  /** Check whether a file path belongs to this database's folder. */
  isFileInDatabase(filePath: string): boolean {
    if (!this.folderPath) return false;
    if (this.schema?.recursive) {
      return filePath.startsWith(this.folderPath + "/");
    }
    const lastSlash = filePath.lastIndexOf("/");
    const parentPath = lastSlash >= 0 ? filePath.substring(0, lastSlash) : "";
    return parentPath === this.folderPath;
  }

  /** Register file watchers for target folders used by relation columns. */
  private registerTargetFolderWatchers(registerFn: (ref: EventRef) => void): void {
    if (!this.schema) return;

    const relationColumns = this.schema.columns.filter((c) => c.type === "relation" && c.target);
    for (const col of relationColumns) {
      const targetPath = col.target!;
      if (this.watchedTargetPaths.has(targetPath)) continue;
      this.watchedTargetPaths.add(targetPath);

      const handleTargetChange = async (file: TAbstractFile) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        const fileFolder = file.path.substring(0, file.path.lastIndexOf("/"));
        if (fileFolder !== targetPath) return;
        await this.loadTargetRecords(targetPath);
        this.callbacks.onStateChange();
      };

      registerFn(this.app.vault.on("modify", handleTargetChange));
      registerFn(this.app.vault.on("create", handleTargetChange));
      registerFn(
        this.app.vault.on("delete", async (file) => {
          if (!(file instanceof TFile)) return;
          if (file.path.startsWith(targetPath + "/")) {
            await this.loadTargetRecords(targetPath);
            this.callbacks.onStateChange();
          }
        })
      );
      registerFn(
        this.app.vault.on("rename", async (file, oldPath) => {
          if (!(file instanceof TFile)) return;
          const wasInTarget = oldPath.startsWith(targetPath + "/");
          const isInTarget = file.path.startsWith(targetPath + "/") && file.extension === "md";
          if (wasInTarget || isInTarget) {
            await this.loadTargetRecords(targetPath);
            this.callbacks.onStateChange();
          }
        })
      );
    }
  }
}
