/** Main entry point for the Obsidian Database Plugin. */

import { Plugin, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { DATABASE_VIEW_TYPE, DatabaseView } from "./views/database-view";

/** File extension for database view entry points visible in the file explorer. */
const DBVIEW_EXTENSION = "dbview";

export default class DatabasePlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(
      DATABASE_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new DatabaseView(leaf, this)
    );

    // Register .dbview extension so clicking it in the explorer opens our view
    this.registerExtensions([DBVIEW_EXTENSION], DATABASE_VIEW_TYPE);

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle("Open as database")
              .setIcon("table")
              .onClick(() => this.openDatabaseView(file.path));
          });
        }
      })
    );

    this.addRibbonIcon("table", "Open database view", () => {
      this.activateDatabaseView();
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(DATABASE_VIEW_TYPE);
  }

  /** Opens a database view for a specific folder path. */
  async openDatabaseView(folderPath: string): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: DATABASE_VIEW_TYPE,
      state: { folderPath },
    });
    this.app.workspace.revealLeaf(leaf);
  }

  /** Activates the database view in the current workspace. */
  private async activateDatabaseView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(DATABASE_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: DATABASE_VIEW_TYPE });
    this.app.workspace.revealLeaf(leaf);
  }
}
