/** Tests for InMemoryCache — CRUD operations and event emission. */

import { describe, it, expect, vi } from "vitest";
import { InMemoryCache } from "../cache";
import type { DatabaseRecord, RecordChangeEvent } from "../../types";
import type { TFile } from "obsidian";

/** Create a minimal mock record for testing. */
function makeRecord(
  id: string,
  values: Record<string, unknown> = {},
  mtime: number = Date.now(),
): DatabaseRecord {
  return {
    id,
    name: id.replace(".md", ""),
    file: { path: id, basename: id.replace(".md", ""), stat: { mtime } } as unknown as TFile,
    values: values as DatabaseRecord["values"],
    mtime,
  };
}

describe("InMemoryCache", () => {
  describe("get / getAll", () => {
    it("returns undefined for unknown ID", () => {
      const cache = new InMemoryCache();
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("returns empty array when no records", () => {
      const cache = new InMemoryCache();
      expect(cache.getAll()).toEqual([]);
    });

    it("returns a frozen array from getAll", () => {
      const cache = new InMemoryCache();
      expect(Object.isFrozen(cache.getAll())).toBe(true);
    });
  });

  describe("set", () => {
    it("adds a new record and returns new cache", () => {
      const cache = new InMemoryCache();
      const record = makeRecord("a.md", { title: "A" });

      const next = cache.set(record);

      expect(next).not.toBe(cache);
      expect(next.get("a.md")).toBe(record);
      expect(cache.get("a.md")).toBeUndefined(); // original unchanged
    });

    it("updates an existing record", () => {
      const r1 = makeRecord("a.md", { title: "Old" });
      const r2 = makeRecord("a.md", { title: "New" });

      const cache = new InMemoryCache();
      const c1 = cache.set(r1);
      const c2 = c1.set(r2);

      expect(c2.get("a.md")?.values.title).toBe("New");
      expect(c1.get("a.md")?.values.title).toBe("Old"); // immutable
    });

    it("emits create event for new record", () => {
      const handler = vi.fn();
      const cache = new InMemoryCache();
      cache.subscribe(handler);

      const record = makeRecord("a.md");
      cache.set(record);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: "create", record }),
      );
    });

    it("emits update event with changed fields", () => {
      const handler = vi.fn();
      const cache = new InMemoryCache();
      cache.subscribe(handler);

      const r1 = makeRecord("a.md", { title: "Old", count: 1 });
      const c1 = cache.set(r1);

      const r2 = makeRecord("a.md", { title: "New", count: 1 });
      c1.set(r2);

      const updateCall = handler.mock.calls[1][0] as RecordChangeEvent;
      expect(updateCall.type).toBe("update");
      expect(updateCall.changedFields).toContain("title");
      expect(updateCall.changedFields).not.toContain("count");
    });
  });

  describe("remove", () => {
    it("removes a record and returns new cache", () => {
      const record = makeRecord("a.md");
      const cache = new InMemoryCache().set(record);

      const next = cache.remove("a.md");

      expect(next).not.toBe(cache);
      expect(next.get("a.md")).toBeUndefined();
      expect(cache.get("a.md")).toBe(record); // original unchanged
    });

    it("returns same cache when removing nonexistent ID", () => {
      const cache = new InMemoryCache();
      expect(cache.remove("nope")).toBe(cache);
    });

    it("emits delete event", () => {
      const handler = vi.fn();
      const cache = new InMemoryCache();
      cache.subscribe(handler);

      const record = makeRecord("a.md");
      const c1 = cache.set(record);
      c1.remove("a.md");

      const deleteCall = handler.mock.calls[1][0] as RecordChangeEvent;
      expect(deleteCall.type).toBe("delete");
      expect(deleteCall.record).toBe(record);
    });
  });

  describe("invalidate", () => {
    it("removes record without emitting events", () => {
      const handler = vi.fn();
      const cache = new InMemoryCache();
      cache.subscribe(handler);

      const record = makeRecord("a.md");
      const c1 = cache.set(record);
      handler.mockClear(); // clear the create event

      const c2 = c1.invalidate("a.md");

      expect(c2.get("a.md")).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
    });

    it("returns same cache when ID not found", () => {
      const cache = new InMemoryCache();
      expect(cache.invalidate("nope")).toBe(cache);
    });
  });

  describe("subscribe", () => {
    it("returns an unsubscribe function", () => {
      const handler = vi.fn();
      const cache = new InMemoryCache();
      const unsub = cache.subscribe(handler);

      cache.set(makeRecord("a.md"));
      expect(handler).toHaveBeenCalledTimes(1);

      unsub();
      cache.set(makeRecord("b.md"));
      expect(handler).toHaveBeenCalledTimes(1); // not called again
    });

    it("supports multiple subscribers", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const cache = new InMemoryCache();
      cache.subscribe(h1);
      cache.subscribe(h2);

      cache.set(makeRecord("a.md"));

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAll", () => {
    it("returns all records", () => {
      const cache = new InMemoryCache()
        .set(makeRecord("a.md", { title: "A" }))
        .set(makeRecord("b.md", { title: "B" }));

      const all = cache.getAll();
      expect(all).toHaveLength(2);
    });
  });
});
