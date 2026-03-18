/** Tests for frontmatter I/O — parsing, updating, and removing YAML frontmatter fields. */

import { describe, it, expect } from "vitest";
import { parseFrontmatter, updateFrontmatter, removeFrontmatterField } from "../frontmatter-io";

describe("parseFrontmatter", () => {
  it("returns empty object when no frontmatter exists", () => {
    const content = "# Hello\nSome content";
    expect(parseFrontmatter(content)).toEqual({});
  });

  it("returns empty object for empty frontmatter", () => {
    const content = "---\n\n---\nContent";
    expect(parseFrontmatter(content)).toEqual({});
  });

  it("parses string values", () => {
    const content = "---\ntitle: My Note\nauthor: John\n---\n";
    expect(parseFrontmatter(content)).toEqual({
      title: "My Note",
      author: "John",
    });
  });

  it("parses number values", () => {
    const content = "---\ncount: 42\nprice: 9.99\n---\n";
    expect(parseFrontmatter(content)).toEqual({ count: 42, price: 9.99 });
  });

  it("parses boolean values", () => {
    const content = "---\npublished: true\ndraft: false\n---\n";
    expect(parseFrontmatter(content)).toEqual({ published: true, draft: false });
  });

  it("parses null values", () => {
    const content = "---\nempty: null\ntilde: ~\nblank:\n---\n";
    expect(parseFrontmatter(content)).toEqual({
      empty: null,
      tilde: null,
      blank: null,
    });
  });

  it("parses inline arrays", () => {
    const content = "---\ntags: [alpha, beta, gamma]\n---\n";
    expect(parseFrontmatter(content)).toEqual({
      tags: ["alpha", "beta", "gamma"],
    });
  });

  it("parses multiline arrays", () => {
    const content = "---\ntags:\n  - one\n  - two\n  - three\n---\n";
    expect(parseFrontmatter(content)).toEqual({
      tags: ["one", "two", "three"],
    });
  });

  it("parses wikilinks", () => {
    const content = "---\nproject: \"[[Website Redesign]]\"\n---\n";
    expect(parseFrontmatter(content)).toEqual({
      project: "[[Website Redesign]]",
    });
  });

  it("parses quoted strings", () => {
    const content = "---\ntitle: \"Hello: World\"\n---\n";
    expect(parseFrontmatter(content)).toEqual({ title: "Hello: World" });
  });

  it("handles mixed value types", () => {
    const content = "---\ntitle: My Note\ncount: 5\ndone: true\ntags: [a, b]\n---\nBody";
    const result = parseFrontmatter(content);
    expect(result.title).toBe("My Note");
    expect(result.count).toBe(5);
    expect(result.done).toBe(true);
    expect(result.tags).toEqual(["a", "b"]);
  });

  it("handles keys with hyphens", () => {
    const content = "---\ndue-date: 2024-01-15\n---\n";
    expect(parseFrontmatter(content)).toEqual({ "due-date": "2024-01-15" });
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\ntitle: Test\r\n---\r\nBody";
    expect(parseFrontmatter(content)).toEqual({ title: "Test" });
  });

  it("does not mutate input", () => {
    const content = "---\ntitle: Test\n---\n";
    const original = content;
    parseFrontmatter(content);
    expect(content).toBe(original);
  });
});

describe("updateFrontmatter", () => {
  it("creates frontmatter when none exists", () => {
    const content = "# Hello";
    const result = updateFrontmatter(content, "title", "New Title");
    expect(result).toBe("---\ntitle: New Title\n---\n# Hello");
  });

  it("updates an existing field", () => {
    const content = "---\ntitle: Old\ncount: 1\n---\nBody";
    const result = updateFrontmatter(content, "title", "New");
    expect(result).toContain("title: New");
    expect(result).toContain("count: 1");
  });

  it("adds a new field to existing frontmatter", () => {
    const content = "---\ntitle: Test\n---\nBody";
    const result = updateFrontmatter(content, "status", "done");
    expect(result).toContain("title: Test");
    expect(result).toContain("status: done");
  });

  it("serializes arrays", () => {
    const content = "---\ntitle: Test\n---\nBody";
    const result = updateFrontmatter(content, "tags", ["a", "b"]);
    expect(result).toContain("tags: [a, b]");
  });

  it("serializes booleans", () => {
    const content = "---\ntitle: Test\n---\nBody";
    const result = updateFrontmatter(content, "done", true);
    expect(result).toContain("done: true");
  });

  it("serializes null", () => {
    const content = "---\ntitle: Test\n---\nBody";
    const result = updateFrontmatter(content, "cleared", null);
    expect(result).toContain("cleared: null");
  });

  it("serializes numbers", () => {
    const content = "---\ntitle: Test\n---\n";
    const result = updateFrontmatter(content, "count", 42);
    expect(result).toContain("count: 42");
  });

  it("replaces multiline array with inline value", () => {
    const content = "---\ntags:\n  - a\n  - b\ntitle: Test\n---\nBody";
    const result = updateFrontmatter(content, "tags", "single");
    expect(result).toContain("tags: single");
    expect(result).toContain("title: Test");
    expect(result).not.toContain("  - a");
  });

  it("preserves body content", () => {
    const content = "---\ntitle: Test\n---\n# Hello\nWorld";
    const result = updateFrontmatter(content, "title", "Updated");
    expect(result).toContain("# Hello\nWorld");
  });

  it("does not mutate original content string", () => {
    const content = "---\ntitle: Test\n---\n";
    const original = content;
    updateFrontmatter(content, "title", "New");
    expect(content).toBe(original);
  });
});

describe("removeFrontmatterField", () => {
  it("returns content unchanged when no frontmatter", () => {
    const content = "# Hello";
    expect(removeFrontmatterField(content, "title")).toBe(content);
  });

  it("removes an existing field", () => {
    const content = "---\ntitle: Test\ncount: 5\n---\nBody";
    const result = removeFrontmatterField(content, "title");
    expect(result).not.toContain("title");
    expect(result).toContain("count: 5");
  });

  it("removes a multiline array field", () => {
    const content = "---\ntags:\n  - a\n  - b\ntitle: Test\n---\nBody";
    const result = removeFrontmatterField(content, "tags");
    expect(result).not.toContain("tags");
    expect(result).not.toContain("  - a");
    expect(result).toContain("title: Test");
  });

  it("returns content unchanged when key not found", () => {
    const content = "---\ntitle: Test\n---\nBody";
    const result = removeFrontmatterField(content, "missing");
    expect(result).toContain("title: Test");
  });

  it("preserves body content", () => {
    const content = "---\ntitle: Test\n---\n# Hello\nParagraph";
    const result = removeFrontmatterField(content, "title");
    expect(result).toContain("# Hello\nParagraph");
  });

  it("does not mutate original content string", () => {
    const content = "---\ntitle: Test\n---\n";
    const original = content;
    removeFrontmatterField(content, "title");
    expect(content).toBe(original);
  });
});
