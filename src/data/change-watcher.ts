/** Change watcher — monitors file system events and debounces rapid changes. */

/** Callback signatures for file events. */
export interface WatcherCallbacks {
  readonly onModify: (path: string) => void;
  readonly onCreate: (path: string) => void;
  readonly onDelete: (path: string) => void;
  readonly onRename: (oldPath: string, newPath: string) => void;
}

/** Default debounce delay in milliseconds. */
const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Watches folders for file changes, filtering to .md files only.
 * Debounces rapid changes to avoid excessive processing.
 */
export class ChangeWatcher {
  /** Set of folder paths being watched. */
  private watchedFolders: ReadonlySet<string>;

  /** User-provided callbacks for file events. */
  private readonly callbacks: WatcherCallbacks;

  /** Debounce delay in milliseconds. */
  private readonly debounceMs: number;

  /** Map of pending debounced timers keyed by file path. */
  private readonly pendingTimers: Map<string, ReturnType<typeof setTimeout>>;

  /** Whether this watcher has been destroyed. */
  private destroyed: boolean;

  /**
   * Create a new ChangeWatcher.
   * @param callbacks - Event handlers for file changes
   * @param debounceMs - Debounce delay (defaults to 300ms)
   */
  constructor(callbacks: WatcherCallbacks, debounceMs: number = DEFAULT_DEBOUNCE_MS) {
    this.callbacks = callbacks;
    this.debounceMs = debounceMs;
    this.watchedFolders = new Set();
    this.pendingTimers = new Map();
    this.destroyed = false;
  }

  /**
   * Start watching a folder for changes.
   * @param path - Folder path to watch
   */
  watchFolder(path: string): void {
    if (this.destroyed) return;

    const normalized = normalizePath(path);
    this.watchedFolders = new Set([...this.watchedFolders, normalized]);
  }

  /**
   * Stop watching a folder.
   * @param path - Folder path to stop watching
   */
  unwatchFolder(path: string): void {
    const normalized = normalizePath(path);
    const updated = new Set(this.watchedFolders);
    updated.delete(normalized);
    this.watchedFolders = updated;
  }

  /**
   * Handle a file modification event from Obsidian's vault events.
   * Filters to .md files in watched folders only. Debounces rapid changes.
   * @param path - Path of the modified file
   */
  handleModify(path: string): void {
    if (!this.shouldProcess(path)) return;
    this.debounce(path, () => this.callbacks.onModify(path));
  }

  /**
   * Handle a file creation event.
   * @param path - Path of the created file
   */
  handleCreate(path: string): void {
    if (!this.shouldProcess(path)) return;
    this.debounce(path, () => this.callbacks.onCreate(path));
  }

  /**
   * Handle a file deletion event.
   * @param path - Path of the deleted file
   */
  handleDelete(path: string): void {
    if (!this.shouldProcess(path)) return;
    // Deletes are not debounced — they should fire immediately
    this.clearPending(path);
    this.callbacks.onDelete(path);
  }

  /**
   * Handle a file rename event.
   * @param oldPath - Previous file path
   * @param newPath - New file path
   */
  handleRename(oldPath: string, newPath: string): void {
    const oldRelevant = this.shouldProcess(oldPath);
    const newRelevant = this.shouldProcess(newPath);

    if (!oldRelevant && !newRelevant) return;

    this.clearPending(oldPath);

    if (oldRelevant && newRelevant) {
      this.callbacks.onRename(oldPath, newPath);
    } else if (oldRelevant) {
      // Moved out of watched folder — treat as delete
      this.callbacks.onDelete(oldPath);
    } else {
      // Moved into watched folder — treat as create
      this.callbacks.onCreate(newPath);
    }
  }

  /**
   * Clean up all pending timers and mark watcher as destroyed.
   */
  destroy(): void {
    this.destroyed = true;
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
    this.watchedFolders = new Set();
  }

  /**
   * Check whether a file path should be processed.
   * Must be a .md file inside a watched folder, and watcher must not be destroyed.
   * @param path - File path to check
   * @returns True if the event should be processed
   */
  private shouldProcess(path: string): boolean {
    if (this.destroyed) return false;
    if (!path.endsWith(".md")) return false;

    return [...this.watchedFolders].some(
      (folder) => path === folder || path.startsWith(folder + "/"),
    );
  }

  /**
   * Debounce a callback for a given file path.
   * @param path - File path key for the debounce timer
   * @param callback - Function to call after debounce delay
   */
  private debounce(path: string, callback: () => void): void {
    this.clearPending(path);
    const timer = setTimeout(() => {
      this.pendingTimers.delete(path);
      callback();
    }, this.debounceMs);
    this.pendingTimers.set(path, timer);
  }

  /**
   * Clear a pending debounce timer for a path.
   * @param path - File path whose timer to clear
   */
  private clearPending(path: string): void {
    const existing = this.pendingTimers.get(path);
    if (existing) {
      clearTimeout(existing);
      this.pendingTimers.delete(path);
    }
  }
}

/**
 * Normalize a folder path by removing trailing slashes.
 * @param path - Raw folder path
 * @returns Normalized path
 */
function normalizePath(path: string): string {
  return path.replace(/\/+$/, "");
}
