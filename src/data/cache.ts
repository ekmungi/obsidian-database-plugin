/** In-memory cache for DatabaseRecords with immutable updates and event subscriptions. */

import type { DatabaseRecord, RecordChangeEvent, RecordChangeHandler } from "../types";

/**
 * Immutable in-memory cache for database records.
 * Every mutation returns a new InMemoryCache instance.
 * Subscribers are notified of changes via RecordChangeEvent.
 */
export class InMemoryCache {
  /** Internal record map keyed by record ID. */
  private readonly records: ReadonlyMap<string, DatabaseRecord>;

  /** Set of active change handlers. */
  private readonly handlers: ReadonlySet<RecordChangeHandler>;

  /**
   * Create a new InMemoryCache.
   * @param records - Initial record map (defaults to empty)
   * @param handlers - Initial handler set (defaults to empty)
   */
  constructor(
    records: ReadonlyMap<string, DatabaseRecord> = new Map(),
    handlers: ReadonlySet<RecordChangeHandler> = new Set(),
  ) {
    this.records = records;
    this.handlers = handlers;
  }

  /**
   * Get a record by ID.
   * @param id - The record identifier (file path)
   * @returns The record, or undefined if not found
   */
  get(id: string): DatabaseRecord | undefined {
    return this.records.get(id);
  }

  /**
   * Get all cached records as a frozen array.
   * @returns Readonly array of all records
   */
  getAll(): readonly DatabaseRecord[] {
    return Object.freeze([...this.records.values()]);
  }

  /**
   * Add or update a record. Returns a new cache instance.
   * Emits a "create" or "update" event to subscribers.
   * @param record - The record to set
   * @returns New InMemoryCache with the record added/updated
   */
  set(record: DatabaseRecord): InMemoryCache {
    const existing = this.records.get(record.id);
    const eventType = existing ? "update" : "create";

    const changedFields = existing
      ? findChangedFields(existing, record)
      : undefined;

    const newMap = new Map(this.records);
    newMap.set(record.id, record);

    const newCache = new InMemoryCache(newMap, this.handlers);

    this.emit({
      type: eventType,
      record,
      changedFields,
    });

    return newCache;
  }

  /**
   * Remove a record by ID. Returns a new cache instance.
   * Emits a "delete" event if the record existed.
   * @param id - The record identifier to remove
   * @returns New InMemoryCache without the record
   */
  remove(id: string): InMemoryCache {
    const existing = this.records.get(id);
    if (!existing) return this;

    const newMap = new Map(this.records);
    newMap.delete(id);

    const newCache = new InMemoryCache(newMap, this.handlers);

    this.emit({
      type: "delete",
      record: existing,
    });

    return newCache;
  }

  /**
   * Invalidate a record (remove it without emitting delete).
   * Useful for forcing re-index without triggering UI updates.
   * @param id - The record identifier to invalidate
   * @returns New InMemoryCache without the record
   */
  invalidate(id: string): InMemoryCache {
    if (!this.records.has(id)) return this;

    const newMap = new Map(this.records);
    newMap.delete(id);

    return new InMemoryCache(newMap, this.handlers);
  }

  /**
   * Subscribe to record change events.
   * @param handler - Callback invoked on each change
   * @returns Unsubscribe function
   */
  subscribe(handler: RecordChangeHandler): () => void {
    const newHandlers = new Set(this.handlers);
    newHandlers.add(handler);

    // Mutate handlers in-place for subscriptions — this is intentional
    // since subscription management is a side-effect by nature.
    (this as { handlers: ReadonlySet<RecordChangeHandler> }).handlers = newHandlers;

    return () => {
      const updated = new Set(this.handlers);
      updated.delete(handler);
      (this as { handlers: ReadonlySet<RecordChangeHandler> }).handlers = updated;
    };
  }

  /**
   * Emit a change event to all subscribers.
   * @param event - The change event to broadcast
   */
  private emit(event: RecordChangeEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}

/**
 * Compare two records and return the list of changed field keys.
 * @param prev - Previous record state
 * @param next - Next record state
 * @returns Array of keys whose values differ
 */
function findChangedFields(
  prev: DatabaseRecord,
  next: DatabaseRecord,
): readonly string[] {
  const allKeys = new Set([
    ...Object.keys(prev.values),
    ...Object.keys(next.values),
  ]);

  const changed: string[] = [];
  for (const key of allKeys) {
    if (JSON.stringify(prev.values[key]) !== JSON.stringify(next.values[key])) {
      changed.push(key);
    }
  }

  return Object.freeze(changed);
}
