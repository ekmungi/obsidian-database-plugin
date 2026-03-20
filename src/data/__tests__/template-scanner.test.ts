/** Tests for template scanner — discovering .md templates in folders. */

import { describe, it, expect } from "vitest";
import { scanTemplateFolder, scanTemplateFolders, scanSingleFolder } from "../template-scanner";

/** Helper: build a mock App whose vault resolves abstract files by path. */
function mockApp(pathMap: Record<string, unknown>) {
  return {
    vault: { getAbstractFileByPath: (p: string) => pathMap[p] ?? null },
  } as Parameters<typeof scanTemplateFolder>[0];
}

/** Shorthand: mock App that always returns the same result. */
function mockAppSingle(result: unknown) {
  return {
    vault: { getAbstractFileByPath: () => result },
  } as Parameters<typeof scanTemplateFolder>[0];
}

/** Helper: build a mock folder with children array (duck-typed as TFolder). */
function mockFolder(path: string, children: unknown[]) {
  return { path, name: path.split("/").pop(), children };
}

/** Helper: build a mock .md file (duck-typed as TFile). */
function mockFile(path: string, ext: string = "md") {
  const name = path.split("/").pop() ?? path;
  return { path, name, basename: name.replace(`.${ext}`, ""), extension: ext };
}

describe("scanTemplateFolder (legacy)", () => {
  it("returns empty array when folder does not exist", async () => {
    const result = await scanTemplateFolder(mockAppSingle(null), "nonexistent");
    expect(result).toEqual([]);
  });

  it("returns empty array when path points to a file (no children)", async () => {
    const result = await scanTemplateFolder(mockAppSingle(mockFile("t/Note.md")), "t/Note.md");
    expect(result).toEqual([]);
  });

  it("returns sorted list of .md files with folderPath", async () => {
    const folder = mockFolder("templates", [
      mockFile("templates/Zettel.md"),
      mockFile("templates/Article.md"),
    ]);
    const result = await scanTemplateFolder(mockAppSingle(folder), "templates");
    expect(result).toEqual([
      { name: "Article", path: "templates/Article.md", folderPath: "templates" },
      { name: "Zettel", path: "templates/Zettel.md", folderPath: "templates" },
    ]);
  });
});

describe("scanSingleFolder", () => {
  it("returns empty templates for non-existent folder", async () => {
    const result = await scanSingleFolder(mockAppSingle(null), { path: "missing" });
    expect(result).toEqual({ folderPath: "missing", templates: [] });
  });

  it("returns all templates enabled by default", async () => {
    const folder = mockFolder("tpl", [
      mockFile("tpl/Note.md"),
      mockFile("tpl/Task.md"),
    ]);
    const result = await scanSingleFolder(mockAppSingle(folder), { path: "tpl" });
    expect(result.templates).toEqual([
      { name: "Note", path: "tpl/Note.md", enabled: true },
      { name: "Task", path: "tpl/Task.md", enabled: true },
    ]);
  });

  it("marks disabled templates correctly", async () => {
    const folder = mockFolder("tpl", [
      mockFile("tpl/Note.md"),
      mockFile("tpl/Task.md"),
    ]);
    const result = await scanSingleFolder(mockAppSingle(folder), {
      path: "tpl",
      disabledTemplates: ["Task"],
    });
    expect(result.templates[0]).toEqual({ name: "Note", path: "tpl/Note.md", enabled: true });
    expect(result.templates[1]).toEqual({ name: "Task", path: "tpl/Task.md", enabled: false });
  });

  it("excludes non-.md files", async () => {
    const folder = mockFolder("tpl", [
      mockFile("tpl/Note.md"),
      mockFile("tpl/photo.jpg", "jpg"),
    ]);
    const result = await scanSingleFolder(mockAppSingle(folder), { path: "tpl" });
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe("Note");
  });
});

describe("scanTemplateFolders", () => {
  it("returns empty array when no folders configured", async () => {
    const result = await scanTemplateFolders(mockAppSingle(null), []);
    expect(result).toEqual([]);
  });

  it("merges templates from multiple folders sorted by name", async () => {
    const folder1 = mockFolder("tpl1", [mockFile("tpl1/Zettel.md")]);
    const folder2 = mockFolder("tpl2", [mockFile("tpl2/Article.md")]);
    const app = mockApp({ tpl1: folder1, tpl2: folder2 });
    const result = await scanTemplateFolders(app, [{ path: "tpl1" }, { path: "tpl2" }]);
    expect(result).toEqual([
      { name: "Article", path: "tpl2/Article.md", folderPath: "tpl2" },
      { name: "Zettel", path: "tpl1/Zettel.md", folderPath: "tpl1" },
    ]);
  });

  it("excludes disabled templates from results", async () => {
    const folder = mockFolder("tpl", [
      mockFile("tpl/Note.md"),
      mockFile("tpl/Task.md"),
    ]);
    const app = mockAppSingle(folder);
    const result = await scanTemplateFolders(app, [
      { path: "tpl", disabledTemplates: ["Task"] },
    ]);
    expect(result).toEqual([
      { name: "Note", path: "tpl/Note.md", folderPath: "tpl" },
    ]);
  });
});
