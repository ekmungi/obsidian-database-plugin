/** Tests for DatabaseController logic — isFileInDatabase pure logic tested via extracted function. */

import { describe, it, expect } from "vitest";

/**
 * Extracted pure logic from DatabaseController.isFileInDatabase for testing
 * without importing the obsidian package.
 */
function isFileInDatabase(
  filePath: string,
  folderPath: string | null,
  recursive: boolean
): boolean {
  if (!folderPath) return false;
  if (recursive) {
    return filePath.startsWith(folderPath + "/");
  }
  const lastSlash = filePath.lastIndexOf("/");
  const parentPath = lastSlash >= 0 ? filePath.substring(0, lastSlash) : "";
  return parentPath === folderPath;
}

describe("isFileInDatabase", () => {
  it("returns false when folderPath is null", () => {
    expect(isFileInDatabase("any/path.md", null, false)).toBe(false);
  });

  it("matches direct children in non-recursive mode", () => {
    expect(isFileInDatabase("Projects/note.md", "Projects", false)).toBe(true);
    expect(isFileInDatabase("Projects/sub/note.md", "Projects", false)).toBe(false);
    expect(isFileInDatabase("Other/note.md", "Projects", false)).toBe(false);
  });

  it("matches nested files in recursive mode", () => {
    expect(isFileInDatabase("Projects/note.md", "Projects", true)).toBe(true);
    expect(isFileInDatabase("Projects/sub/note.md", "Projects", true)).toBe(true);
    expect(isFileInDatabase("Projects/sub/deep/note.md", "Projects", true)).toBe(true);
    expect(isFileInDatabase("Other/note.md", "Projects", true)).toBe(false);
  });

  it("does not match folder path prefix without slash", () => {
    expect(isFileInDatabase("Projects/note.md", "Pro", true)).toBe(false);
    expect(isFileInDatabase("Pro/note.md", "Pro", true)).toBe(true);
  });

  it("returns false for empty folderPath (falsy guard)", () => {
    // Empty string is falsy — the guard returns false immediately
    expect(isFileInDatabase("note.md", "", false)).toBe(false);
    expect(isFileInDatabase("sub/note.md", "", false)).toBe(false);
  });

  it("handles folder paths with spaces", () => {
    expect(isFileInDatabase("My Projects/note.md", "My Projects", false)).toBe(true);
    expect(isFileInDatabase("My Projects/sub/note.md", "My Projects", true)).toBe(true);
  });

  it("rejects exact folder path (no filename)", () => {
    // A path that equals the folder exactly is not a file inside it
    expect(isFileInDatabase("Projects", "Projects", true)).toBe(false);
    expect(isFileInDatabase("Projects", "Projects", false)).toBe(false);
  });
});
