/** Tests for file indexer — creating DatabaseRecords from markdown files. */

import { describe, it, expect, vi } from "vitest";
import { indexFile, indexFolder } from "../file-indexer";
import type { TFile } from "obsidian";

/** Create a mock TFile for testing. */
function makeMockFile(path: string, mtime: number = Date.now()): TFile {
  const basename = path.split("/").pop()?.replace(".md", "") ?? path;
  return {
    path,
    basename,
    stat: { mtime, ctime: mtime, size: 100 },
    vault: {} as TFile["vault"],
    name: basename + ".md",
    parent: null,
    extension: "md",
  } as unknown as TFile;
}

describe("indexFile", () => {
  it("creates a record with parsed frontmatter", () => {
    const file = makeMockFile("projects/alpha.md", 1000);
    const content = "---\ntitle: Alpha\nstatus: active\n---\n# Alpha Project";

    const record = indexFile(file, content);

    expect(record.id).toBe("projects/alpha.md");
    expect(record.name).toBe("alpha");
    expect(record.file).toBe(file);
    expect(record.values.title).toBe("Alpha");
    expect(record.values.status).toBe("active");
    expect(record.mtime).toBe(1000);
  });

  it("creates a record with empty values when no frontmatter", () => {
    const file = makeMockFile("notes/bare.md", 2000);
    const content = "# Just a heading\nSome text.";

    const record = indexFile(file, content);

    expect(record.id).toBe("notes/bare.md");
    expect(record.name).toBe("bare");
    expect(record.values).toEqual({ name: "bare" });
    expect(record.mtime).toBe(2000);
  });

  it("returns a frozen record", () => {
    const file = makeMockFile("test.md");
    const record = indexFile(file, "---\na: 1\n---\n");

    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.values)).toBe(true);
  });

  it("handles complex frontmatter values", () => {
    const file = makeMockFile("complex.md");
    const content = "---\ntags: [foo, bar]\ncount: 42\ndone: true\n---\n";

    const record = indexFile(file, content);

    expect(record.values.tags).toEqual(["foo", "bar"]);
    expect(record.values.count).toBe(42);
    expect(record.values.done).toBe(true);
  });
});

describe("indexFolder", () => {
  it("indexes all markdown files", async () => {
    const files = [
      makeMockFile("db/one.md", 100),
      makeMockFile("db/two.md", 200),
    ];

    const readContent = vi.fn()
      .mockResolvedValueOnce("---\ntitle: One\n---\n")
      .mockResolvedValueOnce("---\ntitle: Two\n---\n");

    const records = await indexFolder(files, readContent);

    expect(records).toHaveLength(2);
    expect(records[0].values.title).toBe("One");
    expect(records[1].values.title).toBe("Two");
    expect(readContent).toHaveBeenCalledTimes(2);
  });

  it("filters out non-markdown files", async () => {
    const files = [
      makeMockFile("db/note.md", 100),
      { path: "db/image.png", basename: "image", stat: { mtime: 100 } } as unknown as TFile,
    ];

    const readContent = vi.fn().mockResolvedValue("---\ntitle: Note\n---\n");

    const records = await indexFolder(files, readContent);

    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("note");
    expect(readContent).toHaveBeenCalledTimes(1);
  });

  it("returns empty array for empty file list", async () => {
    const readContent = vi.fn();
    const records = await indexFolder([], readContent);

    expect(records).toHaveLength(0);
    expect(readContent).not.toHaveBeenCalled();
  });

  it("returns a frozen array", async () => {
    const files = [makeMockFile("db/test.md")];
    const readContent = vi.fn().mockResolvedValue("---\na: 1\n---\n");

    const records = await indexFolder(files, readContent);

    expect(Object.isFrozen(records)).toBe(true);
  });
});
