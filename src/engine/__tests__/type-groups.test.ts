/** Tests for YAML group classifier — determines migrate vs clear on type change. */

import { describe, it, expect } from "vitest";
import { getYamlGroup, isSameGroup } from "../type-groups";

describe("getYamlGroup", () => {
  it("returns 'array-options' for select", () => {
    expect(getYamlGroup("select")).toBe("array-options");
  });
  it("returns 'array-options' for multi-select", () => {
    expect(getYamlGroup("multi-select")).toBe("array-options");
  });
  it("returns 'string' for text", () => {
    expect(getYamlGroup("text")).toBe("string");
  });
  it("returns 'number' for number", () => {
    expect(getYamlGroup("number")).toBe("number");
  });
  it("returns 'boolean' for checkbox", () => {
    expect(getYamlGroup("checkbox")).toBe("boolean");
  });
  it("returns 'date' for date", () => {
    expect(getYamlGroup("date")).toBe("date");
  });
  it("returns 'wikilinks' for relation", () => {
    expect(getYamlGroup("relation")).toBe("wikilinks");
  });
  it("returns 'computed' for rollup", () => {
    expect(getYamlGroup("rollup")).toBe("computed");
  });
  it("returns 'computed' for formula", () => {
    expect(getYamlGroup("formula")).toBe("computed");
  });
  it("returns 'computed' for file", () => {
    expect(getYamlGroup("file")).toBe("computed");
  });
});

describe("isSameGroup", () => {
  it("returns true for select -> multi-select", () => {
    expect(isSameGroup("select", "multi-select")).toBe(true);
  });
  it("returns false for select -> text", () => {
    expect(isSameGroup("select", "text")).toBe(false);
  });
  it("returns false for relation -> select", () => {
    expect(isSameGroup("relation", "select")).toBe(false);
  });
  it("returns true for same type", () => {
    expect(isSameGroup("text", "text")).toBe(true);
  });
  it("returns true for multi-select -> select", () => {
    expect(isSameGroup("multi-select", "select")).toBe(true);
  });
  it("returns false for checkbox -> number", () => {
    expect(isSameGroup("checkbox", "number")).toBe(false);
  });
});
