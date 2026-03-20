/**
 * Codeblock processor that renders interactive DatabaseApp views inline in markdown notes.
 * Usage: ```database\nsource: My Folder/Sub\nview: Main\nmaxHeight: 400\n```
 */

import { MarkdownRenderChild, Plugin, EventRef } from "obsidian";
import { h, render } from "preact";
import { DatabaseController } from "./database-controller";
import { DatabaseApp } from "./components/database-app";
import type { DatabaseSchema, ViewConfig } from "../types";

/** Parsed configuration from a database codeblock's YAML body. */
export interface CodeblockConfig {
  /** Folder path containing the .database.json schema. */
  readonly source: string;
  /** Optional view specifier — a view name (case-sensitive) or view type. */
  readonly view?: string;
  /** Optional max height in pixels for the embedded container. */
  readonly maxHeight?: number;
}

/** Parse the YAML-like content of a database codeblock into a config object. */
export function parseCodeblockConfig(source: string): CodeblockConfig | null {
  const lines = source.trim().split("\n");
  const config: Record<string, string> = {};

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.substring(0, colonIdx).trim();
    const val = line.substring(colonIdx + 1).trim();
    if (key && val) {
      config[key] = val;
    }
  }

  if (!config.source) return null;

  return {
    source: config.source,
    view: config.view || undefined,
    maxHeight: config.maxHeight ? parseInt(config.maxHeight, 10) || undefined : undefined,
  };
}

/**
 * Resolve a view specifier to a concrete view ID.
 * Resolution order: (1) exact name match, (2) type match, (3) default view, (4) first view.
 */
export function resolveView(
  schema: DatabaseSchema,
  viewSpec?: string
): ViewConfig | undefined {
  if (!schema.views.length) return undefined;

  if (viewSpec) {
    // Try exact name match first (case-sensitive)
    const byName = schema.views.find((v) => v.name === viewSpec);
    if (byName) return byName;

    // Try type match (case-insensitive)
    const lowerSpec = viewSpec.toLowerCase();
    const byType = schema.views.find((v) => v.type === lowerSpec);
    if (byType) return byType;
  }

  // Fallback: default view, then first view
  return schema.views.find((v) => v.isDefault) ?? schema.views[0];
}

/**
 * MarkdownRenderChild that manages cleanup for a single codeblock instance.
 * Unmounts Preact, destroys the controller, and detaches vault event listeners.
 */
class CodeblockCleanupChild extends MarkdownRenderChild {
  private readonly ctrl: DatabaseController;
  private readonly eventRefs: EventRef[];

  constructor(el: HTMLElement, ctrl: DatabaseController, eventRefs: EventRef[]) {
    super(el);
    this.ctrl = ctrl;
    this.eventRefs = eventRefs;
  }

  onunload(): void {
    render(null, this.containerEl);
    this.ctrl.destroy();
    for (const ref of this.eventRefs) {
      this.ctrl["app"].vault.offref(ref);
    }
    this.eventRefs.length = 0;
  }
}

/** Register the `database` codeblock processor on the plugin. */
export function registerDatabaseCodeblock(plugin: Plugin): void {
  plugin.registerMarkdownCodeBlockProcessor("database", async (source, el, ctx) => {
    const config = parseCodeblockConfig(source);

    if (!config) {
      el.createEl("div", {
        cls: "database-codeblock-error",
        text: "Database codeblock error: missing 'source' property.",
      });
      return;
    }

    // Create container with optional max-height
    const wrapper = el.createDiv({ cls: "database-codeblock-container" });
    if (config.maxHeight) {
      wrapper.style.maxHeight = `${config.maxHeight}px`;
    }

    // Track EventRefs manually since we don't have ItemView.registerEvent
    const eventRefs: EventRef[] = [];
    const registerFn = (ref: EventRef): void => {
      eventRefs.push(ref);
    };

    // Render function that mounts/updates the Preact tree
    const renderApp = (ctrl: DatabaseController): void => {
      if (!ctrl.schema) return;

      const resolved = resolveView(ctrl.schema, config.view);

      render(
        h(DatabaseApp, {
          schema: ctrl.schema,
          records: ctrl.records,
          initialViewId: resolved?.id,
          onCellChange: ctrl.handleCellChange,
          onNewRecord: ctrl.handleNewRecord,
          onOpenNote: ctrl.handleOpenNote,
          onSchemaChange: ctrl.handleSchemaChange,
          onAddPropertyToAll: ctrl.handleAddPropertyToAll,
          onRemovePropertyFromAll: ctrl.handleRemovePropertyFromAll,
          onClearPropertyFromAll: ctrl.handleClearPropertyFromAll,
          onRenameOption: ctrl.handleRenameOption,
          onDeleteOption: ctrl.handleDeleteOption,
          onCleanupBidirectionalLinks: ctrl.handleCleanupBidirectionalLinks,
          onNavigateToNote: ctrl.handleNavigateToNote,
          onRenameFile: ctrl.handleRenameFile,
          onCreateRelationRecord: ctrl.handleCreateRelationRecord,
          onDeleteRecords: ctrl.handleDeleteRecords,
          folderPaths: ctrl.getVaultFolderPaths(),
          targetRecordsByFolder: new Map(ctrl.targetRecordsCache),
          templates: ctrl.templates,
          folderTemplates: ctrl.folderTemplates,
        }),
        wrapper
      );
    };

    const controller = new DatabaseController(plugin.app, {
      onStateChange: () => renderApp(controller),
      onRefreshFolder: undefined,
      onHeaderUpdate: undefined,
    });

    try {
      await controller.loadDatabase(config.source);

      // Check if the source folder actually exists in the vault
      const folder = plugin.app.vault.getAbstractFileByPath(config.source);
      if (!folder) {
        wrapper.createEl("div", {
          cls: "database-codeblock-error",
          text: `Database error: folder "${config.source}" not found.`,
        });
        controller.destroy();
        return;
      }

      renderApp(controller);
      controller.registerFileEvents(registerFn);
    } catch (err) {
      wrapper.createEl("div", {
        cls: "database-codeblock-error",
        text: `Database codeblock error: could not load "${config.source}".`,
      });
      console.error("Database Plugin: Codeblock load failed", err);
    }

    // Register cleanup child so Obsidian calls onunload when the codeblock is removed
    const cleanup = new CodeblockCleanupChild(wrapper, controller, eventRefs);
    ctx.addChild(cleanup);
  });
}
