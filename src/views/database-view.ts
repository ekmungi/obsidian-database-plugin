/** Obsidian ItemView subclass that hosts the database UI — thin wrapper around DatabaseController. */

import { ItemView, WorkspaceLeaf } from "obsidian";
import { h, render } from "preact";
import type DatabasePlugin from "../main";
import { DatabaseController } from "./database-controller";
import { DatabaseApp } from "./components/database-app";

export const DATABASE_VIEW_TYPE = "database-view";

/**
 * DatabaseView — an ItemView that delegates all data operations to DatabaseController
 * and renders a Preact DatabaseApp component.
 */
export class DatabaseView extends ItemView {
  private readonly plugin: DatabasePlugin;
  private readonly controller: DatabaseController;
  private renderRoot: Element | null = null;

  /** Get the folder path this view is displaying. */
  getFolderPath(): string | undefined {
    return this.controller.folderPath;
  }

  /** Reload this view if it matches the given folder path. Called by other views for cross-view refresh. */
  public async reloadIfFolder(folderPath: string): Promise<void> {
    if (this.controller.folderPath === folderPath) {
      await this.controller.loadDatabase(folderPath);
      this.renderApp();
    }
  }

  constructor(leaf: WorkspaceLeaf, plugin: DatabasePlugin) {
    super(leaf);
    this.plugin = plugin;
    this.controller = new DatabaseController(this.app, {
      onStateChange: () => this.renderApp(),
      onRefreshFolder: (path) => this.refreshOtherViews(path),
      onHeaderUpdate: () => this.leaf.updateHeader(),
    });
  }

  getViewType(): string {
    return DATABASE_VIEW_TYPE;
  }

  getDisplayText(): string {
    if (this.controller.schema?.name) return this.controller.schema.name;
    if (this.controller.folderPath) {
      return this.controller.folderPath.split("/").pop() ?? "Database view";
    }
    return "Database view";
  }

  getIcon(): string {
    return "table";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("database-view-container");
    this.renderRoot = container;

    if (!this.controller.folderPath) {
      this.renderPlaceholder(container);
      return;
    }

    await this.controller.loadDatabase(this.controller.folderPath);
    this.leaf.updateHeader();
    this.renderApp();
    this.controller.registerFileEvents(this.registerEvent.bind(this));
  }

  onClose(): void {
    if (this.renderRoot) {
      render(null, this.renderRoot);
    }
    this.controller.destroy();
  }

  getState(): Record<string, unknown> {
    return { folderPath: this.controller.folderPath };
  }

  async setState(
    state: Record<string, unknown>,
    result: Record<string, unknown>
  ): Promise<void> {
    if (typeof state.folderPath === "string") {
      this.controller.folderPath = state.folderPath;
    }
    // When opened via a .dbview file click, derive folderPath from the file path
    if (typeof state.file === "string" && state.file.endsWith(".dbview")) {
      const parts = state.file.split("/");
      parts.pop();
      this.controller.folderPath = parts.join("/");
    }
    await this.onOpen();
    await super.setState(state, result);
    // Update header after a tick so Obsidian doesn't overwrite with the old display text
    requestAnimationFrame(() => this.leaf.updateHeader());
  }

  /** Render the placeholder when no folder is selected. */
  private renderPlaceholder(container: HTMLElement): void {
    const placeholder = container.createDiv({ cls: "database-placeholder" });
    placeholder.createEl("h3", { text: "Database view" });
    placeholder.createEl("p", {
      text: "Select a folder with a .database.json file to view its database.",
    });
  }

  /** Refresh any other open DatabaseView that shows the given folder. */
  private refreshOtherViews(folderPath: string): void {
    setTimeout(() => {
      const leaves = this.app.workspace.getLeavesOfType(DATABASE_VIEW_TYPE);
      for (const leaf of leaves) {
        const view = leaf.view;
        if (view instanceof DatabaseView && view !== this) {
          void view.reloadIfFolder(folderPath);
        }
      }
    }, 200);
  }

  /** Render the Preact app with current controller state. */
  private renderApp(): void {
    if (!this.renderRoot || !this.controller.schema) return;

    render(
      h(DatabaseApp, {
        schema: this.controller.schema,
        records: this.controller.records,
        onCellChange: this.controller.handleCellChange,
        onNewRecord: this.controller.handleNewRecord,
        onOpenNote: this.controller.handleOpenNote,
        onSchemaChange: this.controller.handleSchemaChange,
        onAddPropertyToAll: this.controller.handleAddPropertyToAll,
        onRemovePropertyFromAll: this.controller.handleRemovePropertyFromAll,
        onClearPropertyFromAll: this.controller.handleClearPropertyFromAll,
        onRenameOption: this.controller.handleRenameOption,
        onDeleteOption: this.controller.handleDeleteOption,
        onCleanupBidirectionalLinks: this.controller.handleCleanupBidirectionalLinks,
        onNavigateToNote: this.controller.handleNavigateToNote,
        onRenameFile: this.controller.handleRenameFile,
        onCreateRelationRecord: this.controller.handleCreateRelationRecord,
        onDeleteRecords: this.controller.handleDeleteRecords,
        folderPaths: this.controller.getVaultFolderPaths(),
        targetRecordsByFolder: new Map(this.controller.targetRecordsCache),
        templates: this.controller.templates,
        folderTemplates: this.controller.folderTemplates,
      }),
      this.renderRoot
    );
  }
}
