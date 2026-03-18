/** Obsidian ItemView subclass that hosts the database UI (Preact root). */

import { ItemView, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { h, render } from "preact";
import type DatabasePlugin from "../main";
import type { DatabaseSchema, CellValue } from "../types";
import type { DatabaseRecord } from "../types/record";
import { updateFrontmatter, removeFrontmatterField } from "../data/frontmatter-io";
import { indexFile } from "../data/file-indexer";
import { parseSchema, createDefaultSchema } from "../engine/schema-manager";
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

  constructor(leaf: WorkspaceLeaf, plugin: DatabasePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return DATABASE_VIEW_TYPE;
  }

  getDisplayText(): string {
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
    this.syncSchemaOptionsFromRecords();
    await this.syncPropertyTypesToObsidian();
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
      }),
      this.renderRoot
    );
  }

  /** Handle cell edits — write updated frontmatter to the file.
   *  Ensures select values are written as arrays when the Obsidian type is multitext/list. */
  private handleCellChange = async (
    recordId: string,
    field: string,
    value: CellValue
  ): Promise<void> => {
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

    const content = await this.app.vault.read(file);
    const newContent = updateFrontmatter(content, field, writeValue);
    await this.app.vault.modify(file, newContent);

    const updatedRecord = indexFile(file, newContent);
    this.records = this.records.map((r) =>
      r.id === recordId ? updatedRecord : r
    );
    this.renderApp();
  };

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
      for (const col of this.schema.columns) {
        if (col.type === "file" || col.type === "rollup" || col.type === "formula") continue;
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
    this.renderApp();
  };

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
      this.app.vault.on("delete", (file) => {
        // On delete, file.parent may already be null — match by path prefix instead
        if (file instanceof TFile && this.folderPath) {
          const isInFolder = file.path.startsWith(this.folderPath + "/");
          if (isInFolder && this.records.some((r) => r.id === file.path)) {
            this.records = this.records.filter((r) => r.id !== file.path);
            this.renderApp();
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
}
