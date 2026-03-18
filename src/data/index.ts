/** Re-exports all data layer modules for convenient imports. */

export { parseFrontmatter, updateFrontmatter, removeFrontmatterField } from "./frontmatter-io";
export { indexFile, indexFolder } from "./file-indexer";
export { InMemoryCache } from "./cache";
export { ChangeWatcher } from "./change-watcher";
export type { WatcherCallbacks } from "./change-watcher";
