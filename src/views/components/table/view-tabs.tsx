/** Notion-style view tabs with add, rename, context menu, and default indicator. */

import { h, render as preactRender } from "preact";
import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import type { ViewConfig, ViewType } from "../../../types/schema";

/** SVG icon components for each view type — monochrome, inherits currentColor. */
const VIEW_ICONS: Record<ViewType, () => h.JSX.Element> = {
  table: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),
  kanban: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="5" height="16" rx="1" />
      <rect x="10" y="3" width="5" height="10" rx="1" />
      <rect x="17" y="3" width="5" height="13" rx="1" />
    </svg>
  ),
  calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  timeline: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="6" x2="3" y2="18" />
      <rect x="5" y="6" width="8" height="3" rx="1" />
      <rect x="5" y="11" width="12" height="3" rx="1" />
      <rect x="5" y="16" width="6" height="3" rx="1" />
    </svg>
  ),
};

/** Human-readable labels for the add-view dropdown. */
const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  table: "Table",
  kanban: "Kanban",
  calendar: "Calendar",
  timeline: "Timeline",
};

/** Props for the ViewTabs component. */
export interface ViewTabsProps {
  readonly views: readonly ViewConfig[];
  readonly activeViewId: string;
  readonly onViewChange: (viewId: string) => void;
  readonly onAddView?: (type: ViewType) => void;
  readonly onDeleteView?: (viewId: string) => void;
  readonly onRenameView?: (viewId: string, name: string) => void;
  readonly onSetDefaultView?: (viewId: string) => void;
}

/** Notion-style flat tabs for switching between database views. */
export function ViewTabs({
  views,
  activeViewId,
  onViewChange,
  onAddView,
  onDeleteView,
  onRenameView,
  onSetDefaultView,
}: ViewTabsProps): h.JSX.Element {
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ viewId: string; x: number; y: number } | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  /** Start inline rename for a tab. */
  const startRename = useCallback((viewId: string, currentName: string) => {
    setEditingViewId(viewId);
    setEditingName(currentName);
    setContextMenu(null);
  }, []);

  /** Commit the inline rename. */
  const commitRename = useCallback(() => {
    if (editingViewId && editingName.trim()) {
      onRenameView?.(editingViewId, editingName.trim());
    }
    setEditingViewId(null);
    setEditingName("");
  }, [editingViewId, editingName, onRenameView]);

  /** Cancel inline rename without saving. */
  const cancelRename = useCallback(() => {
    setEditingViewId(null);
    setEditingName("");
  }, []);

  /** Auto-focus the rename input when it appears. */
  useEffect(() => {
    if (editingViewId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingViewId]);

  /** Close add menu on click-outside or Escape. */
  useEffect(() => {
    if (!showAddMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setShowAddMenu(false); }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [showAddMenu]);

  /** Handle right-click on a view tab. */
  const handleContextMenu = useCallback((e: MouseEvent, viewId: string) => {
    e.preventDefault();
    setContextMenu({ viewId, x: e.clientX, y: e.clientY });
  }, []);

  /** Handle double-click on a view tab to start inline rename. */
  const handleDoubleClick = useCallback((viewId: string, currentName: string) => {
    startRename(viewId, currentName);
  }, [startRename]);

  /** Handle add view selection. */
  const handleAddViewType = useCallback((type: ViewType) => {
    onAddView?.(type);
    setShowAddMenu(false);
  }, [onAddView]);

  return (
    <div class="database-view-tabs">
      {views.map((view) => {
        const isActive = view.id === activeViewId;
        const isEditing = editingViewId === view.id;
        const IconComponent = VIEW_ICONS[view.type];
        const displayName = view.name ?? view.type;

        return (
          <div
            key={view.id}
            class={`database-view-tab ${isActive ? "database-view-tab--active" : ""}`}
            onClick={() => { if (!isEditing) onViewChange(view.id); }}
            onDblClick={() => handleDoubleClick(view.id, displayName)}
            onContextMenu={(e: MouseEvent) => handleContextMenu(e, view.id)}
            title={displayName}
          >
            <span class="database-view-tab__icon">
              {IconComponent ? <IconComponent /> : null}
            </span>
            {isEditing ? (
              <input
                ref={editInputRef}
                class="database-view-tab__rename-input"
                type="text"
                value={editingName}
                onInput={(e) => setEditingName((e.target as HTMLInputElement).value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelRename(); }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span class="database-view-tab__name">{displayName}</span>
            )}
            {view.isDefault && (
              <span class="database-view-tab__default-badge" title="Default view">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
            )}
          </div>
        );
      })}

      {/* Add view button */}
      {onAddView && (
        <div ref={addMenuRef} style={{ position: "relative" }}>
          <button
            class="database-view-tab database-view-tab--add"
            onClick={() => setShowAddMenu(!showAddMenu)}
            title="Add view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          {showAddMenu && (
            <div class="database-view-tabs__add-dropdown">
              {(Object.keys(VIEW_TYPE_LABELS) as ViewType[]).map((type) => {
                const TypeIcon = VIEW_ICONS[type];
                return (
                  <div
                    key={type}
                    class="database-view-tabs__add-option"
                    onClick={() => handleAddViewType(type)}
                  >
                    <span style={{ display: "inline-flex" }}>{TypeIcon ? <TypeIcon /> : null}</span>
                    <span>{VIEW_TYPE_LABELS[type]}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Context menu — rendered as body-level portal */}
      {contextMenu && (
        <ContextMenuPortal
          contextMenu={contextMenu}
          views={views}
          onStartRename={startRename}
          onSetDefaultView={onSetDefaultView}
          onDeleteView={onDeleteView}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

/** Body-level context menu portal — avoids CSS transform containment issues in Obsidian. */
function ContextMenuPortal({
  contextMenu,
  views,
  onStartRename,
  onSetDefaultView,
  onDeleteView,
  onClose,
}: {
  readonly contextMenu: { viewId: string; x: number; y: number };
  readonly views: readonly ViewConfig[];
  readonly onStartRename: (viewId: string, name: string) => void;
  readonly onSetDefaultView?: (viewId: string) => void;
  readonly onDeleteView?: (viewId: string) => void;
  readonly onClose: () => void;
}): null {
  useEffect(() => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const view = views.find((v) => v.id === contextMenu.viewId);
    if (!view) { document.body.removeChild(container); return; }

    const canDelete = !view.isDefault && views.length > 1;
    const isAlreadyDefault = view.isDefault === true;

    const menu = h("div", {
      class: "database-view-tabs__context-menu",
      style: { left: `${contextMenu.x}px`, top: `${contextMenu.y}px` },
    },
      h("div", {
        class: "database-view-tabs__context-item",
        onClick: () => { onStartRename(view.id, view.name ?? view.type); onClose(); },
      }, "Rename"),
      h("div", {
        class: `database-view-tabs__context-item ${isAlreadyDefault ? "database-view-tabs__context-item--disabled" : ""}`,
        onClick: () => { if (!isAlreadyDefault) { onSetDefaultView?.(view.id); onClose(); } },
      }, "Set as Default"),
      h("div", {
        class: `database-view-tabs__context-item database-view-tabs__context-item--danger ${!canDelete ? "database-view-tabs__context-item--disabled" : ""}`,
        onClick: () => { if (canDelete) { onDeleteView?.(view.id); onClose(); } },
      }, "Delete"),
    );

    preactRender(menu, container);

    /** Close on click-outside or Escape. */
    const handleClick = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    document.addEventListener("mousedown", handleClick, true);
    document.addEventListener("keydown", handleKey, true);

    return () => {
      document.removeEventListener("mousedown", handleClick, true);
      document.removeEventListener("keydown", handleKey, true);
      preactRender(null, container);
      document.body.removeChild(container);
    };
  }, [contextMenu, views, onStartRename, onSetDefaultView, onDeleteView, onClose]);

  return null;
}
