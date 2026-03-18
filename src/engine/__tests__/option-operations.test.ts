/** Tests for option operations — rename and remove helpers for frontmatter values. */

import { describe, it, expect } from "vitest";
import { renameOptionInValue, removeOptionFromValue } from "../option-operations";

describe("renameOptionInValue", () => {
  it("renames string value", () => {
    expect(renameOptionInValue("old", "old", "new")).toBe("new");
  });

  it("renames value in array", () => {
    expect(renameOptionInValue(["old", "keep"], "old", "new")).toEqual(["new", "keep"]);
  });

  it("returns unchanged if no match (string)", () => {
    expect(renameOptionInValue("other", "old", "new")).toBe("other");
  });

  it("returns unchanged if no match (array)", () => {
    expect(renameOptionInValue(["keep", "stay"], "old", "new")).toEqual(["keep", "stay"]);
  });

  it("handles null value", () => {
    expect(renameOptionInValue(null, "old", "new")).toBe(null);
  });

  it("handles empty array", () => {
    expect(renameOptionInValue([], "old", "new")).toEqual([]);
  });

  it("renames multiple occurrences in array", () => {
    expect(renameOptionInValue(["old", "mid", "old"], "old", "new")).toEqual(["new", "mid", "new"]);
  });
});

describe("removeOptionFromValue", () => {
  it("clears string value if matches", () => {
    expect(removeOptionFromValue("doomed", "doomed")).toEqual([]);
  });

  it("removes from array", () => {
    expect(removeOptionFromValue(["keep", "doomed"], "doomed")).toEqual(["keep"]);
  });

  it("returns unchanged if no match (array)", () => {
    expect(removeOptionFromValue(["keep"], "doomed")).toEqual(["keep"]);
  });

  it("handles null value", () => {
    expect(removeOptionFromValue(null, "doomed")).toEqual([]);
  });

  it("handles empty array", () => {
    expect(removeOptionFromValue([], "doomed")).toEqual([]);
  });

  it("removes all occurrences from array", () => {
    expect(removeOptionFromValue(["doomed", "keep", "doomed"], "doomed")).toEqual(["keep"]);
  });
});
