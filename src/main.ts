/** Main entry point for the Obsidian Database Plugin. */

import { Plugin, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { DATABASE_VIEW_TYPE, DatabaseView } from "./views/database-view";
import { registerDatabaseCodeblock } from "./views/codeblock-renderer";

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

    // Register ```database``` codeblock processor for inline embedding
    registerDatabaseCodeblock(this);

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

    // Deduplicate: when a .dbview click opens a new tab for a folder that's already open,
    // close the duplicate and reveal the existing one instead.
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        const leaves = this.app.workspace.getLeavesOfType(DATABASE_VIEW_TYPE);
        if (leaves.length <= 1) return;

        const seen = new Map<string, WorkspaceLeaf>();
        for (const leaf of leaves) {
          const fp = (leaf.view as DatabaseView).getFolderPath?.();
          if (!fp) continue;
          if (seen.has(fp)) {
            // Duplicate — close this one and reveal the original
            leaf.detach();
            this.app.workspace.revealLeaf(seen.get(fp)!);
            return;
          }
          seen.set(fp, leaf);
        }
      })
    );
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(DATABASE_VIEW_TYPE);
  }

  /** Opens a database view for a specific folder path, reusing an existing tab if open. */
  async openDatabaseView(folderPath: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(DATABASE_VIEW_TYPE)
      .find((l) => (l.view as DatabaseView).getFolderPath?.() === folderPath);
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      return;
    }
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
