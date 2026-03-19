/** Obsidian ItemView subclass that hosts the database UI (Preact root). */

import { ItemView, TFile, TFolder, TAbstractFile, WorkspaceLeaf } from "obsidian";
import { h, render } from "preact";
import type DatabasePlugin from "../main";
import type { DatabaseSchema, CellValue } from "../types";
import type { DatabaseRecord } from "../types/record";
import { updateFrontmatter, removeFrontmatterField } from "../data/frontmatter-io";
import { indexFile } from "../data/file-indexer";
import { parseSchema, createDefaultSchema } from "../engine/schema-manager";
import { filterByDbViewType } from "../engine/query-engine";
import {
  parseWikilinks,
  formatWikilink,
  computeBidirectionalUpdates,
  computeBidirectionalRemovals,
} from "../engine/relation-resolver";
import { getYamlGroup } from "../engine/type-groups";
import { pickNextColor } from "../engine/color-cycle";
import { renameOptionInValue, removeOptionFromValue } from "../engine/option-operations";
import { DatabaseApp } from "./components/database-app";

export const DATABASE_VIEW_TYPE = "database-view";
const SCHEMA_FILENAME = ".database.json";

export class DatabaseView extends ItemView {
  private readonly plugin: DatabasePlugin;
  private folderPath: string | null = null;
  private schema: DatabaseSchema | null = null;
  private records: readonly DatabaseRecord[] = [];
  private renderRoot: Element | null = null;
  /** Track files we just created to prevent duplicate adds from on('create') event. */
  private recentlyCreated = new Set<string>();
  /** Serialization queue for cell changes — prevents concurrent bidirectional sync races. */
  private cellChangeQueue: Promise<void> = Promise.resolve();
  /** Cached target records for relation columns, keyed by folder path. */
  private targetRecordsCache = new Map<string, readonly DatabaseRecord[]>();
  /** Watched target folder paths to avoid duplicate watchers. */
  private watchedTargetPaths = new Set<string>();

  /** Reload this view if it matches the given folder path. Called by other views for cross-view refresh. */
  public async reloadIfFolder(folderPath: string): Promise<void> {
    if (this.folderPath === folderPath) {
      await this.loadDatabase();
      this.renderApp();
    }
  }

  constructor(leaf: WorkspaceLeaf, plugin: DatabasePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return DATABASE_VIEW_TYPE;
  }

  getDisplayText(): string {
    if (this.schema?.name) return this.schema.name;
    if (this.folderPath) {
      return this.folderPath.split("/").pop() ?? "Database View";
    }
    return "Database View";
  }

  getIcon(): string {
    return "table";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("database-view-container");
    this.renderRoot = container;

    if (!this.folderPath) {
      this.renderPlaceholder(container);
      return;
    }

    await this.loadDatabase();
    this.renderApp();
    this.registerFileEvents();
  }

  async onClose(): Promise<void> {
    if (this.renderRoot) {
      render(null, this.renderRoot);
    }
  }

  getState(): Record<string, unknown> {
    return { folderPath: this.folderPath };
  }

  async setState(
    state: Record<string, unknown>,
    result: Record<string, unknown>
  ): Promise<void> {
    if (typeof state.folderPath === "string") {
      this.folderPath = state.folderPath;
    }
    // When opened via a .dbview file click, derive folderPath from the file path
    if (typeof state.file === "string" && state.file.endsWith(".dbview")) {
      const parts = state.file.split("/");
      parts.pop(); // remove the filename
      this.folderPath = parts.join("/");
    }
    await this.onOpen();
    await super.setState(state, result);
  }

  /** Render the placeholder when no folder is selected. */
  private renderPlaceholder(container: HTMLElement): void {
    const placeholder = container.createDiv({ cls: "database-placeholder" });
    placeholder.createEl("h3", { text: "Database View" });
    placeholder.createEl("p", {
      text: "Select a folder with a .database.json file to view its database.",
    });
  }

  /** Refresh any other open DatabaseView that shows the given folder. */
  private refreshOtherViews(folderPath: string): void {
    // Use setTimeout to ensure the target schema write is flushed before reloading
    setTimeout(() => {
      const leaves = this.app.workspace.getLeavesOfType(DATABASE_VIEW_TYPE);
      for (const leaf of leaves) {
        const view = leaf.view;
        if (view instanceof DatabaseView && view !== this) {
          view.reloadIfFolder(folderPath);
        }
      }
    }, 200);
  }

  /** Load schema and index records from the folder. */
  private async loadDatabase(): Promise<void> {
    if (!this.folderPath) return;

    const schemaPath = `${this.folderPath}/${SCHEMA_FILENAME}`;

    try {
      // Use adapter.read to access dotfiles — Obsidian's getAbstractFileByPath skips them
      const content = await this.app.vault.adapter.read(schemaPath);
      this.schema = parseSchema(content);
      console.log("Database Plugin: Schema loaded", schemaPath, this.schema.columns.length, "columns");
    } catch (err) {
      console.warn("Database Plugin: Schema load failed, using default", schemaPath, err);
      this.schema = createDefaultSchema(this.folderPath.split("/").pop() ?? "Database");
    }

    await this.indexRecords();
    this.ensureDbViewTypeColumn();
    this.syncSchemaOptionsFromRecords();
    await this.syncPropertyTypesToObsidian();
    await this.ensureDbviewFile();
    await this.loadAllTargetRecords();
  }

  /** Ensure db-view-type column exists and is hidden when dbViewType is set. */
  private ensureDbViewTypeColumn(): void {
    if (!this.schema || !this.schema.dbViewType) return;

    let updated = false;
    let schema = this.schema;

    // Add column if missing
    if (!schema.columns.some((c) => c.id === "db-view-type")) {
      schema = {
        ...schema,
        columns: [...schema.columns, { id: "db-view-type", type: "text" as const, label: "db view type" }],
      };
      updated = true;
    }

    // Auto-hide in all views
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
      this.app.vault.adapter.write(schemaPath, JSON.stringify(schema, null, 2));
    }
  }

  /** Discover select/multi-select option values from frontmatter that aren't in schema yet. */
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
          // Skip empty strings, array literals, and non-string values
          if (typeof v !== "string" || !v || v === "[]" || v.startsWith("[")) continue;
          if (!knownValues.has(v)) {
            knownValues.add(v);
            // Pick a color not already used by existing options
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
      // Persist the updated schema
      const schemaPath = `${this.folderPath}/${SCHEMA_FILENAME}`;
      this.app.vault.adapter.write(schemaPath, JSON.stringify(this.schema, null, 2));
    }
  }

  /**
   * Sync column types to Obsidian's .obsidian/types.json so the Properties editor
   * shows the correct type (list, date, number, checkbox, etc.) for each property.
   */
  private async syncPropertyTypesToObsidian(): Promise<void> {
    if (!this.schema) return;

    const typesPath = ".obsidian/types.json";
    let typesData: { types: Record<string, string> } = { types: {} };

    try {
      const content = await this.app.vault.adapter.read(typesPath);
      typesData = JSON.parse(content);
      if (!typesData.types) typesData.types = {};
    } catch {
      // File doesn't exist or is invalid — start fresh
    }

    /** Map our column types to Obsidian's property type strings. */
    const typeMap: Record<string, string> = {
      text: "text",
      number: "number",
      date: "date",
      select: "multitext",
      "multi-select": "multitext",
      checkbox: "checkbox",
      relation: "multitext",
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
      console.log("Database Plugin: Synced property types to .obsidian/types.json");
    }
  }

  /**
   * Remove a property type from .obsidian/types.json only if no other file in the vault uses it.
   * Prevents breaking Obsidian's Properties editor for notes outside this database.
   */
  private async removePropertyTypeIfUnused(propertyId: string): Promise<void> {
    // Check if any other markdown file in the vault has this property in frontmatter
    const allFiles = this.app.vault.getMarkdownFiles();
    const folderPrefix = this.folderPath ? this.folderPath + "/" : "";

    for (const file of allFiles) {
      // Skip files inside this database folder — they are being cleaned up
      if (file.path.startsWith(folderPrefix)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter && propertyId in cache.frontmatter) {
        // Another file uses this property — do not remove from types.json
        return;
      }
    }

    // No other file uses it — safe to remove
    const typesPath = ".obsidian/types.json";
    try {
      const content = await this.app.vault.adapter.read(typesPath);
      const typesData = JSON.parse(content);
      if (typesData.types && propertyId in typesData.types) {
        delete typesData.types[propertyId];
        await this.app.vault.adapter.write(typesPath, JSON.stringify(typesData, null, 2));
        console.log(`Database Plugin: Removed unused property type "${propertyId}" from types.json`);
      }
    } catch {
      // types.json not readable — nothing to clean up
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
        // File may already exist or folder may be read-only — ignore
      }
    }
  }

  /** Index all markdown files in the database folder. */
  private async indexRecords(): Promise<void> {
    if (!this.folderPath) return;

    const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
    if (!(folder instanceof TFolder)) {
      this.records = [];
      return;
    }

    const mdFiles = folder.children.filter(
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

  /** Load target records for all relation columns in the schema. */
  private async loadAllTargetRecords(): Promise<void> {
    if (!this.schema) return;
    const relationColumns = this.schema.columns.filter((c) => c.type === "relation" && c.target);
    for (const col of relationColumns) {
      if (col.target) {
        await this.loadTargetRecords(col.target);
      }
    }
  }

  /**
   * Index .md files in a target folder and apply the target db's dbViewType filter.
   * Results are cached in targetRecordsCache.
   */
  private async loadTargetRecords(folderPath: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      this.targetRecordsCache.set(folderPath, []);
      return;
    }

    const mdFiles = folder.children.filter(
      (f): f is TFile => f instanceof TFile && f.extension === "md"
    );

    const indexed = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await this.app.vault.read(file);
        return indexFile(file, content);
      })
    );

    // Apply target db's dbViewType filter if configured
    let filtered: readonly DatabaseRecord[] = indexed;
    const targetSchemaPath = `${folderPath}/${SCHEMA_FILENAME}`;
    try {
      const schemaContent = await this.app.vault.adapter.read(targetSchemaPath);
      const targetSchema = parseSchema(schemaContent);
      if (targetSchema.dbViewType) {
        filtered = filterByDbViewType(indexed, targetSchema.dbViewType);
      }
    } catch {
      // No target schema — use all records unfiltered
    }

    this.targetRecordsCache.set(folderPath, filtered);
  }

  /** Get all folder paths in the vault for autocomplete inputs. */
  private getVaultFolderPaths(): readonly string[] {
    return this.app.vault.getAllLoadedFiles()
      .filter((f: TAbstractFile): f is TFolder => f instanceof TFolder)
      .map((f) => f.path)
      .filter((p) => p !== "/")
      .sort();
  }

  /** Render the Preact app into the container. */
  private renderApp(): void {
    if (!this.renderRoot || !this.schema) return;

    render(
      h(DatabaseApp, {
        schema: this.schema,
        records: this.records,
        onCellChange: this.handleCellChange,
        onNewRecord: this.handleNewRecord,
        onOpenNote: this.handleOpenNote,
        onSchemaChange: this.handleSchemaChange,
        onAddPropertyToAll: this.handleAddPropertyToAll,
        onRemovePropertyFromAll: this.handleRemovePropertyFromAll,
        onClearPropertyFromAll: this.handleClearPropertyFromAll,
        onRenameOption: this.handleRenameOption,
        onDeleteOption: this.handleDeleteOption,
        onCleanupBidirectionalLinks: this.handleCleanupBidirectionalLinks,
        onNavigateToNote: this.handleNavigateToNote,
        onRenameFile: this.handleRenameFile,
        onCreateRelationRecord: this.handleCreateRelationRecord,
        folderPaths: this.getVaultFolderPaths(),
        targetRecordsByFolder: new Map(this.targetRecordsCache),
      }),
      this.renderRoot
    );
  }

  /** Handle cell edits — serialized through a queue to prevent concurrent bidirectional sync races.
   *  Ensures select values are written as arrays when the Obsidian type is multitext/list. */
  private handleCellChange = (
    recordId: string,
    field: string,
    value: CellValue
  ): void => {
    this.cellChangeQueue = this.cellChangeQueue.then(() =>
      this.executeCellChange(recordId, field, value)
    );
  };

  /** Execute a single cell change — writes frontmatter and syncs bidirectional links. */
  private async executeCellChange(
    recordId: string,
    field: string,
    value: CellValue
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(recordId);
    if (!(file instanceof TFile)) return;

    // Find the column definition to determine how to write the value
    const col = this.schema?.columns.find((c) => c.id === field);
    let writeValue = value;

    if (col) {
      if (col.type === "select") {
        // Select values should be written as single-item arrays for Obsidian list compatibility
        // Empty/null stays as empty array
        if (value === null || value === "") {
          writeValue = [];
        } else if (typeof value === "string") {
          writeValue = [value];
        }
      }
      // multi-select values are already arrays from the component
    }

    // Capture previous value for bidirectional removal detection
    const previousValue = this.records.find((r) => r.id === recordId)?.values[field] ?? null;

    const content = await this.app.vault.read(file);
    const newContent = updateFrontmatter(content, field, writeValue);
    await this.app.vault.modify(file, newContent);

    const updatedRecord = indexFile(file, newContent);
    this.records = this.records.map((r) =>
      r.id === recordId ? updatedRecord : r
    );

    // Bidirectional sync for relation columns
    await this.syncBidirectionalLinks(field, updatedRecord, previousValue);

    this.renderApp();
  }

  /** Sync bidirectional back-links after a relation cell change. */
  private async syncBidirectionalLinks(
    field: string,
    sourceRecord: DatabaseRecord,
    previousValue: CellValue
  ): Promise<void> {
    if (!this.schema) return;

    const col = this.schema.columns.find((c) => c.id === field);
    if (!col || col.type !== "relation" || !col.bidirectional || !col.reverseColumnId || !col.target) return;

    const targetRecords = this.targetRecordsCache.get(col.target);
    if (!targetRecords || targetRecords.length === 0) return;

    // Compute additions — new back-links needed
    const addUpdates = computeBidirectionalUpdates(
      sourceRecord,
      field,
      col.reverseColumnId,
      targetRecords
    );

    // Compute removals — stale back-links to remove
    const previousNames = parseWikilinks(previousValue);
    const currentNames = parseWikilinks(sourceRecord.values[field]);
    const removeUpdates = computeBidirectionalRemovals(
      previousNames,
      currentNames,
      sourceRecord.name,
      col.reverseColumnId,
      targetRecords
    );

    // Apply all updates to target files
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

    // Refresh target cache and other open views if updates were made
    if (allUpdates.length > 0) {
      await this.loadTargetRecords(col.target);
      this.refreshOtherViews(col.target);
    }
  }

  /** Handle new record creation. */
  private handleNewRecord = async (
    templatePath?: string | null
  ): Promise<void> => {
    if (!this.folderPath || !this.schema) return;

    try {
      const baseName = `Untitled`;
      let filePath = `${this.folderPath}/${baseName}.md`;

      // Find a unique name if file already exists
      let counter = 1;
      while (this.app.vault.getAbstractFileByPath(filePath)) {
        filePath = `${this.folderPath}/${baseName} ${counter}.md`;
        counter++;
      }

      // Build initial content with default frontmatter from schema columns
      let content = "---\n";
      // Auto-inject db-view-type when schema has dbViewType configured
      if (this.schema.dbViewType) {
        content += `db-view-type: ${this.schema.dbViewType}\n`;
      }
      for (const col of this.schema.columns) {
        if (col.type === "file" || col.type === "rollup" || col.type === "formula") continue;
        // Skip db-view-type if already injected above
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
      this.renderApp();

      // Open the new note for editing
      this.app.workspace.getLeaf("tab").openFile(newFile);
    } catch (err) {
      console.error("Database Plugin: Failed to create new record", err);
    }
  };

  /** Handle note navigation — open the file in a new tab. */
  private handleOpenNote = (record: DatabaseRecord): void => {
    const file = this.app.vault.getAbstractFileByPath(record.id);
    if (file instanceof TFile) {
      this.app.workspace.getLeaf("tab").openFile(file);
    }
  };

  /** Navigate to a note by name — searches all vault files and opens in a new tab. */
  private handleNavigateToNote = (noteName: string): void => {
    const allFiles = this.app.vault.getMarkdownFiles();
    const file = allFiles.find((f) => f.basename === noteName);
    if (file) {
      this.app.workspace.getLeaf("tab").openFile(file);
    }
  };

  /** Rename a record's file (change the markdown filename). */
  private handleRenameFile = async (
    recordId: string,
    newName: string
  ): Promise<void> => {
    const file = this.app.vault.getAbstractFileByPath(recordId);
    if (!(file instanceof TFile)) return;

    const folder = file.parent?.path ?? "";
    const newPath = folder ? `${folder}/${newName}.md` : `${newName}.md`;

    // Check for name collision
    if (this.app.vault.getAbstractFileByPath(newPath)) {
      console.warn(`Database Plugin: File "${newPath}" already exists, skipping rename`);
      return;
    }

    try {
      await this.app.vault.rename(file, newPath);
      // Records will be updated by the rename event handler
    } catch (err) {
      console.error(`Database Plugin: Failed to rename "${recordId}" to "${newPath}"`, err);
    }
  };

  /** Create a new record in a target relation folder with default frontmatter from its schema. */
  private handleCreateRelationRecord = async (
    targetFolder: string,
    name: string
  ): Promise<void> => {
    const filePath = `${targetFolder}/${name}.md`;
    if (this.app.vault.getAbstractFileByPath(filePath)) return; // already exists

    try {
      // Load target schema to get default frontmatter
      const targetSchemaPath = `${targetFolder}/${SCHEMA_FILENAME}`;
      let content = "---\n";
      try {
        const schemaContent = await this.app.vault.adapter.read(targetSchemaPath);
        const targetSchema = parseSchema(schemaContent);
        // Auto-inject db-view-type if target has dbViewType
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
        // No target schema — create with empty frontmatter
      }
      content += "---\n";

      await this.app.vault.create(filePath, content);
      // Refresh target cache so the new record appears in the picker
      await this.loadTargetRecords(targetFolder);
      this.renderApp();
    } catch (err) {
      console.error(`Database Plugin: Failed to create relation record "${filePath}"`, err);
    }
  };

  /** Handle schema changes — save to .database.json via adapter (dotfile). */
  private handleSchemaChange = async (
    schema: DatabaseSchema
  ): Promise<void> => {
    if (!this.folderPath) return;

    this.schema = schema;
    const schemaPath = `${this.folderPath}/${SCHEMA_FILENAME}`;
    const content = JSON.stringify(schema, null, 2);

    await this.app.vault.adapter.write(schemaPath, content);
    await this.syncPropertyTypesToObsidian();
    // Auto-create reverse columns in target schemas for bidirectional relations
    await this.ensureBidirectionalReverseColumns();
    // Reload target records for any new/changed relation columns
    await this.loadAllTargetRecords();
    this.registerTargetFolderWatchers();
    // Update the tab title to reflect any name change
    this.leaf.updateHeader();
    this.renderApp();
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

        // Check if reverse column already exists
        if (targetSchema.columns.some((c) => c.id === col.reverseColumnId)) continue;

        // Auto-create the reverse relation column in the target schema
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

        // Add the empty property to all existing MD files in the target folder
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

        console.log(`Database Plugin: Auto-created reverse column "${col.reverseColumnId}" in ${col.target}`);
        // Refresh any open view for the target folder
        this.refreshOtherViews(col.target!);
      } catch {
        // Target schema doesn't exist — skip
      }
    }
  }

  /** Add a frontmatter property to all existing records in the database folder. */
  private handleAddPropertyToAll = async (
    field: string,
    defaultValue: CellValue
  ): Promise<void> => {
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
    this.renderApp();
  };

  /** Remove a frontmatter property from all existing records and clean up types.json. */
  private handleRemovePropertyFromAll = async (
    field: string
  ): Promise<void> => {
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
    this.renderApp();
  };

  /** Clear values (set to null) for a property across all records without removing the field. */
  private handleClearPropertyFromAll = async (field: string): Promise<void> => {
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
    this.renderApp();
  };

  /** Rename an option value across all records' frontmatter. */
  private handleRenameOption = async (
    field: string, oldName: string, newName: string
  ): Promise<void> => {
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
    this.renderApp();
  };

  /** Remove an option value from all records' frontmatter. */
  private handleDeleteOption = async (
    field: string, optionName: string
  ): Promise<void> => {
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
    this.renderApp();
  };

  /** Clean up everything in the target database when a bidirectional relation column is deleted:
   *  1. Remove the reverse property from all target files' frontmatter
   *  2. Remove the reverse column from the target schema */
  private handleCleanupBidirectionalLinks = async (
    column: import("../types").ColumnDefinition
  ): Promise<void> => {
    if (!column.target || !column.reverseColumnId || !column.bidirectional) return;

    // 1. Remove the reverse property from all target files
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

    // 2. Remove the reverse column from the target schema
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
      // Target schema doesn't exist — nothing to clean
    }

    // Refresh target cache
    await this.loadTargetRecords(column.target);
    console.log(`Database Plugin: Cleaned up reverse column "${column.reverseColumnId}" from ${column.target}`);
    // Refresh any open view for the target folder
    this.refreshOtherViews(column.target);
  };

  /** Clean up all bidirectional back-links for a deleted record across all relation columns. */
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
        linkedNames,
        [], // current = empty (record is being deleted)
        record.name,
        col.reverseColumnId!,
        targetRecords
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
        this.refreshOtherViews(col.target!);
      }
    }
  }

  /** Register file modification events to auto-refresh records. */
  private registerFileEvents(): void {
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (
          file instanceof TFile &&
          file.extension === "md" &&
          file.parent?.path === this.folderPath
        ) {
          const content = await this.app.vault.read(file);
          const updated = indexFile(file, content);
          this.records = this.records.map((r) =>
            r.id === file.path ? updated : r
          );
          // Discover new option values added via the MD editor
          this.syncSchemaOptionsFromRecords();
          this.renderApp();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        // On delete, file.parent may already be null — match by path prefix instead
        if (file instanceof TFile && this.folderPath) {
          const isInFolder = file.path.startsWith(this.folderPath + "/");
          if (isInFolder) {
            const deletedRecord = this.records.find((r) => r.id === file.path);
            if (deletedRecord) {
              // Clean up bidirectional back-links for the deleted record
              await this.cleanupBacklinksForRecord(deletedRecord);
              this.records = this.records.filter((r) => r.id !== file.path);
              this.renderApp();
            }
          }
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (!(file instanceof TFile) || !this.folderPath) return;

        const wasInFolder = oldPath.startsWith(this.folderPath + "/");
        const isInFolder = file.path.startsWith(this.folderPath + "/") && file.extension === "md";

        if (wasInFolder && !isInFolder) {
          // Moved out of folder — remove
          this.records = this.records.filter((r) => r.id !== oldPath);
          this.renderApp();
        } else if (!wasInFolder && isInFolder) {
          // Moved into folder — add
          const content = await this.app.vault.read(file);
          const record = indexFile(file, content);
          this.records = [...this.records, record];
          this.renderApp();
        } else if (wasInFolder && isInFolder) {
          // Renamed within folder — update the record
          const content = await this.app.vault.read(file);
          const record = indexFile(file, content);
          this.records = this.records.map((r) =>
            r.id === oldPath ? record : r
          );
          this.renderApp();
        }
      })
    );

    // Register watchers for target folders (relation columns)
    this.registerTargetFolderWatchers();

    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (
          file instanceof TFile &&
          file.extension === "md" &&
          file.parent?.path === this.folderPath
        ) {
          // Skip if we just created this file in handleNewRecord
          if (this.recentlyCreated.has(file.path)) {
            this.recentlyCreated.delete(file.path);
            return;
          }
          // Also skip if already in records (safety check)
          if (this.records.some((r) => r.id === file.path)) return;
          const content = await this.app.vault.read(file);
          const record = indexFile(file, content);
          this.records = [...this.records, record];
          this.renderApp();
        }
      })
    );
  }

  /** Register file watchers for target folders used by relation columns. */
  private registerTargetFolderWatchers(): void {
    if (!this.schema) return;

    const relationColumns = this.schema.columns.filter((c) => c.type === "relation" && c.target);
    for (const col of relationColumns) {
      const targetPath = col.target!;
      if (this.watchedTargetPaths.has(targetPath)) continue;
      this.watchedTargetPaths.add(targetPath);

      // Watch for changes in target folders — invalidate cache and re-render
      const handleTargetChange = async (file: TAbstractFile) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        const fileFolder = file.path.substring(0, file.path.lastIndexOf("/"));
        if (fileFolder !== targetPath) return;
        await this.loadTargetRecords(targetPath);
        this.renderApp();
      };

      this.registerEvent(
        this.app.vault.on("modify", handleTargetChange)
      );
      this.registerEvent(
        this.app.vault.on("create", handleTargetChange)
      );
      this.registerEvent(
        this.app.vault.on("delete", async (file) => {
          if (!(file instanceof TFile)) return;
          // On delete, file.parent may be null — match by path prefix
          if (file.path.startsWith(targetPath + "/")) {
            await this.loadTargetRecords(targetPath);
            this.renderApp();
          }
        })
      );
      this.registerEvent(
        this.app.vault.on("rename", async (file, oldPath) => {
          if (!(file instanceof TFile)) return;
          const wasInTarget = oldPath.startsWith(targetPath + "/");
          const isInTarget = file.path.startsWith(targetPath + "/") && file.extension === "md";
          if (wasInTarget || isInTarget) {
            await this.loadTargetRecords(targetPath);
            this.renderApp();
          }
        })
      );
    }
  }
}
