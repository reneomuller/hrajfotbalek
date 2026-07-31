/**
 * A deliberately small Markdown subset, parsed to structure rather than HTML.
 *
 * WHY NOT A LIBRARY. The documents this renders are two legal texts committed
 * to this repository. They use headings, paragraphs and bold runs, and nothing
 * else. A general Markdown library would bring a parser, an HTML serialiser and
 * a sanitiser for a job that needs none of them, and every one of those is a
 * dependency sitting on the page where someone accepts a contract.
 *
 * WHY STRUCTURE AND NOT HTML. Returning blocks means the page renders them as
 * React elements, so there is no `dangerouslySetInnerHTML` in the codebase and
 * no escaping question to get wrong. Text is text; the renderer decides what is
 * a heading. That is the whole XSS story for this feature, and it is over
 * before it starts.
 *
 * Anything the subset does not recognise — a list, a link, a table — renders as
 * the literal characters that were typed. That is a visible, obvious failure
 * rather than a silent drop, which is the right direction for a document whose
 * words are the point.
 */

export interface InlineSpan {
  text: string;
  bold: boolean;
}

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] };

/**
 * Splits a line into bold and plain runs on `**`.
 *
 * An unmatched `**` is left as literal text rather than swallowing the rest of
 * the paragraph — a stray asterisk pair in a legal document should look wrong,
 * not silently bolden three clauses.
 */
export function parseInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let rest = line;

  while (rest.length > 0) {
    const open = rest.indexOf("**");
    if (open === -1) {
      spans.push({ text: rest, bold: false });
      break;
    }

    const close = rest.indexOf("**", open + 2);
    if (close === -1) {
      // No closing pair: the rest is plain, asterisks and all.
      spans.push({ text: rest, bold: false });
      break;
    }

    if (open > 0) spans.push({ text: rest.slice(0, open), bold: false });
    const inner = rest.slice(open + 2, close);
    if (inner.length > 0) spans.push({ text: inner, bold: true });
    rest = rest.slice(close + 2);
  }

  return spans.filter((span) => span.text.length > 0);
}

/**
 * Parses a document into blocks.
 *
 * Blank lines separate blocks; a wrapped paragraph is rejoined with spaces, so
 * the source can be hard-wrapped without that showing up as line breaks in the
 * rendered text.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];

  for (const chunk of source.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;

    const first = lines[0];

    if (first.startsWith("## ")) {
      blocks.push({ type: "heading", level: 2, spans: parseInline(first.slice(3).trim()) });
      // A heading is its own block; anything after a blank-line-free heading is
      // treated as the next paragraph rather than folded into the title.
      const rest = lines.slice(1).join(" ");
      if (rest) blocks.push({ type: "paragraph", spans: parseInline(rest) });
      continue;
    }

    if (first.startsWith("# ")) {
      blocks.push({ type: "heading", level: 1, spans: parseInline(first.slice(2).trim()) });
      const rest = lines.slice(1).join(" ");
      if (rest) blocks.push({ type: "paragraph", spans: parseInline(rest) });
      continue;
    }

    blocks.push({ type: "paragraph", spans: parseInline(lines.join(" ")) });
  }

  return blocks;
}
