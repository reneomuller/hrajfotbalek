import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "@/lib/content/markdown";

describe("parseInline", () => {
  it("splits bold runs out of plain text", () => {
    expect(parseInline("**The service.** This site lets you book.")).toEqual([
      { text: "The service.", bold: true },
      { text: " This site lets you book.", bold: false },
    ]);
  });

  it("handles several bold runs in one line", () => {
    expect(parseInline("**a** and **b**")).toEqual([
      { text: "a", bold: true },
      { text: " and ", bold: false },
      { text: "b", bold: true },
    ]);
  });

  it("leaves an unmatched marker as literal text", () => {
    // A stray pair should look wrong, not bolden the rest of the clause.
    expect(parseInline("**unclosed and then some")).toEqual([
      { text: "**unclosed and then some", bold: false },
    ]);
  });

  it("emits nothing for an empty line", () => {
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseMarkdown", () => {
  it("reads a heading", () => {
    expect(parseMarkdown("# Terms of Service")).toEqual([
      { type: "heading", level: 1, spans: [{ text: "Terms of Service", bold: false }] },
    ]);
  });

  it("separates blocks on blank lines", () => {
    const blocks = parseMarkdown("# Title\n\nFirst para.\n\nSecond para.");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "paragraph"]);
  });

  it("rejoins a hard-wrapped paragraph with spaces", () => {
    const [block] = parseMarkdown("one two\nthree four");
    expect(block).toEqual({
      type: "paragraph",
      spans: [{ text: "one two three four", bold: false }],
    });
  });

  it("renders unsupported syntax literally rather than dropping it", () => {
    // A silent drop in a legal document is the failure worth avoiding.
    const [block] = parseMarkdown("- a list item");
    expect(block).toMatchObject({ type: "paragraph" });
    expect(block.spans[0].text).toContain("- a list item");
  });

  it("ignores trailing and leading whitespace", () => {
    expect(parseMarkdown("\n\n  # Title  \n\n")).toEqual([
      { type: "heading", level: 1, spans: [{ text: "Title", bold: false }] },
    ]);
  });

  it("produces no blocks for an empty document", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n   \n")).toEqual([]);
  });
});

/**
 * The documents themselves, parsed. These are the actual files shipped to
 * players, so a parser that copes with invented examples but not with the real
 * text would pass every test above and still render a broken contract.
 */
describe("the shipped terms documents", () => {
  const read = (file: string) =>
    readFileSync(path.resolve(process.cwd(), "content", file), "utf8");

  for (const [locale, file, heading] of [
    ["en", "terms.en.md", "Terms of Service"],
    ["cs", "terms.cs.md", "Obchodní podmínky"],
  ] as const) {
    it(`parses the ${locale} terms into a title, eight clauses and a version line`, () => {
      const blocks = parseMarkdown(read(file));

      expect(blocks[0]).toEqual({
        type: "heading",
        level: 1,
        spans: [{ text: heading, bold: false }],
      });

      // Eight bold-led clauses, plus the unbolded version line at the end.
      // Both counts are asserted so that losing a clause to a parsing change
      // shows up here rather than as a shorter page nobody re-reads.
      const paragraphs = blocks.filter((b) => b.type === "paragraph");
      expect(paragraphs).toHaveLength(9);

      const boldLed = paragraphs.filter((p) => p.spans[0]?.bold);
      expect(boldLed).toHaveLength(8);

      expect(paragraphs.at(-1)?.spans[0]?.bold).toBe(false);
    });

    it(`states its version in the ${locale} document`, () => {
      // The version in the text and the version stamped on the acceptance have
      // to be the same string, or the consent record points at nothing.
      expect(read(file)).toContain("1.0");
      expect(read(file)).toContain("01.08.2026");
    });
  }

  it("keeps the Czech document in Czech", () => {
    // Cheap guard against a copy-paste that ships the English text twice.
    const cs = read("terms.cs.md");
    expect(cs).toContain("Obchodní podmínky");
    expect(cs).not.toContain("Terms of Service");
  });
});
