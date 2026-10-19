/**
 * Parses the lawyer's HTML documents into blocks the pages render.
 *
 * WHY A PARSER AND NOT `dangerouslySetInnerHTML`. The documents arrive as
 * styled HTML with their own fonts, colours and print rules. Injecting them
 * would bring that styling along and put raw markup on the page; parsing them
 * into a handful of block types lets the site draw them in its own tokens while
 * every word stays the lawyer's.
 *
 * IT ACCEPTS EXACTLY THE SHAPES THE DOCUMENTS USE AND THROWS ON ANYTHING ELSE.
 * A revised document with a construct this file has never seen (a list, an
 * image, an unfilled `[●]` placeholder) fails loudly at load time instead of
 * rendering with a clause silently missing. Supporting it is then a deliberate
 * edit here.
 *
 * The documents are authored by one known hand and live in the repository, so
 * this is a strict reader of a closed format, not a general HTML parser.
 */

/*
 * EVERY NODE CARRIES A `key`, assigned in document order at parse time. The
 * documents never reorder, so a sequence is stable for the life of a parse,
 * and it spares every renderer from inventing keys out of array positions.
 */
export type LegalInline =
  | { key: string; kind: "text"; text: string }
  | { key: string; kind: "strong"; children: LegalInline[] }
  | { key: string; kind: "link"; href: string; children: LegalInline[] };

export interface LegalHeader {
  kicker: LegalInline[];
  title: LegalInline[];
  sub: LegalInline[] | null;
  meta: LegalInline[] | null;
}

export interface LegalCell {
  key: string;
  content: LegalInline[];
}

export interface LegalRow {
  key: string;
  cells: LegalCell[];
}

export type LegalBlock =
  | { key: string; kind: "heading"; number: string; title: LegalInline[] }
  | { key: string; kind: "clause"; number: string; content: LegalInline[] }
  | { key: string; kind: "item"; number: string; content: LegalInline[] }
  | { key: string; kind: "table"; head: LegalCell[]; rows: LegalRow[] };

export interface LegalPart {
  key: string;
  header: LegalHeader;
  blocks: LegalBlock[];
}

export interface ParsedLegalDocument {
  main: LegalPart;
  /** Attachments such as the terms' Příloha 1, in document order. */
  annexes: LegalPart[];
}

interface ElementNode {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}

interface TextNode {
  type: "text";
  text: string;
}

type HtmlNode = ElementNode | TextNode;

const VOID_TAGS = new Set(["hr", "br", "meta", "link", "img"]);

const TOKEN =
  /<!--[\s\S]*?-->|<\/([a-z0-9]+)\s*>|<([a-z0-9]+)((?:\s+[a-z-]+="[^"]*")*)\s*\/?>|([^<]+)/gi;

const ATTRIBUTE = /([a-z-]+)="([^"]*)"/gi;

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(ATTRIBUTE)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) attrs[name.toLowerCase()] = value;
  }
  return attrs;
}

function buildTree(html: string): ElementNode {
  const root: ElementNode = { type: "element", tag: "#root", attrs: {}, children: [] };
  const stack: ElementNode[] = [root];

  for (const match of html.matchAll(TOKEN)) {
    const [whole, closing, opening, rawAttrs, text] = match;
    const parent = stack[stack.length - 1];
    if (!parent) throw new Error("legal document: unbalanced markup");

    if (text !== undefined) {
      parent.children.push({ type: "text", text });
      continue;
    }
    if (closing !== undefined) {
      const tag = closing.toLowerCase();
      if (parent.tag !== tag) {
        throw new Error(`legal document: </${tag}> closes <${parent.tag}>`);
      }
      stack.pop();
      continue;
    }
    if (opening === undefined) continue; // a comment

    const tag = opening.toLowerCase();
    const element: ElementNode = {
      type: "element",
      tag,
      attrs: parseAttributes(rawAttrs ?? ""),
      children: [],
    };
    parent.children.push(element);
    if (!VOID_TAGS.has(tag) && !whole.endsWith("/>")) stack.push(element);
  }

  if (stack.length !== 1) throw new Error("legal document: unclosed element");
  return root;
}

function describe(node: ElementNode): string {
  return node.attrs.class ? `<${node.tag} class="${node.attrs.class}">` : `<${node.tag}>`;
}

function isBlank(node: HtmlNode): boolean {
  return node.type === "text" && node.text.trim() === "";
}

/** The element children of a block, refusing stray text between them. */
function elementChildren(node: ElementNode): ElementNode[] {
  return node.children.flatMap((child) => {
    if (child.type === "element") return [child];
    if (isBlank(child)) return [];
    throw new Error(`legal document: loose text inside ${describe(node)}`);
  });
}

function hasClass(node: ElementNode, name: string): boolean {
  return (node.attrs.class ?? "").split(/\s+/).includes(name);
}

interface Keys {
  next(): string;
}

function inline(keys: Keys, nodes: HtmlNode[]): LegalInline[] {
  return nodes.map((node): LegalInline => {
    const key = keys.next();
    if (node.type === "text") return { key, kind: "text", text: node.text };
    if (node.tag === "strong") return { key, kind: "strong", children: inline(keys, node.children) };
    if (node.tag === "a" && node.attrs.href) {
      return { key, kind: "link", href: node.attrs.href, children: inline(keys, node.children) };
    }
    if (node.tag === "span" && hasClass(node, "ph")) {
      throw new Error("legal document: an unfilled [●] placeholder reached the page");
    }
    throw new Error(`legal document: unexpected inline ${describe(node)}`);
  });
}

function plainText(node: ElementNode): string {
  return node.children
    .map((child) => {
      if (child.type === "text") return child.text;
      throw new Error(`legal document: expected plain text in ${describe(node)}`);
    })
    .join("");
}

/** `<span class="n">1.1</span><span class="t">…</span>`, the shape of a clause and an item. */
function numbered(keys: Keys, node: ElementNode): { number: string; content: LegalInline[] } {
  const [n, t, ...rest] = elementChildren(node);
  if (!n || !t || rest.length > 0 || !hasClass(n, "n") || !hasClass(t, "t")) {
    throw new Error(`legal document: malformed numbered paragraph ${describe(node)}`);
  }
  return { number: plainText(n), content: inline(keys, t.children) };
}

function heading(keys: Keys, node: ElementNode): LegalBlock {
  const [num, title, ...rest] = elementChildren(node);
  if (!num || !title || rest.length > 0 || !hasClass(num, "num")) {
    throw new Error("legal document: malformed <h2>");
  }
  return {
    key: keys.next(),
    kind: "heading",
    number: plainText(num),
    title: inline(keys, title.children),
  };
}

function header(keys: Keys, node: ElementNode): LegalHeader {
  const parts: Partial<Record<"kicker" | "title" | "sub" | "meta", LegalInline[]>> = {};
  for (const child of elementChildren(node)) {
    const content = () => inline(keys, child.children);
    if (child.tag === "h1") parts.title = content();
    else if (child.tag === "p" && hasClass(child, "kicker")) parts.kicker = content();
    else if (child.tag === "p" && hasClass(child, "sub")) parts.sub = content();
    else if (child.tag === "p" && hasClass(child, "meta")) parts.meta = content();
    else throw new Error(`legal document: unexpected ${describe(child)} in the header`);
  }
  if (!parts.kicker || !parts.title) throw new Error("legal document: header without a title");
  return {
    kicker: parts.kicker,
    title: parts.title,
    sub: parts.sub ?? null,
    meta: parts.meta ?? null,
  };
}

function cells(keys: Keys, row: ElementNode, tag: "th" | "td"): LegalCell[] {
  return elementChildren(row).map((cell) => {
    if (cell.tag !== tag) throw new Error(`legal document: expected <${tag}>, found ${describe(cell)}`);
    return { key: keys.next(), content: inline(keys, cell.children) };
  });
}

function table(keys: Keys, node: ElementNode): LegalBlock {
  const [thead, tbody, ...rest] = elementChildren(node);
  if (!thead || !tbody || rest.length > 0 || thead.tag !== "thead" || tbody.tag !== "tbody") {
    throw new Error("legal document: a table needs exactly <thead> and <tbody>");
  }
  const [headRow, ...extraHead] = elementChildren(thead);
  if (!headRow || extraHead.length > 0) throw new Error("legal document: one header row expected");
  return {
    key: keys.next(),
    kind: "table",
    head: cells(keys, headRow, "th"),
    rows: elementChildren(tbody).map((row) => ({ key: keys.next(), cells: cells(keys, row, "td") })),
  };
}

function block(keys: Keys, node: ElementNode): LegalBlock | null {
  if (node.tag === "h2") return heading(keys, node);
  if (node.tag === "p" && hasClass(node, "cl")) {
    return { key: keys.next(), kind: "clause", ...numbered(keys, node) };
  }
  if (node.tag === "p" && hasClass(node, "it")) {
    return { key: keys.next(), kind: "item", ...numbered(keys, node) };
  }
  if (node.tag === "table") return table(keys, node);
  // The source hides its rule (`hr{display:none}`); the annex break is a page break in print.
  if (node.tag === "hr") return null;
  throw new Error(`legal document: unexpected block ${describe(node)}`);
}

function part(keys: Keys, children: ElementNode[]): LegalPart {
  const [first, ...rest] = children;
  if (!first || first.tag !== "header" || !hasClass(first, "title")) {
    throw new Error("legal document: a document starts with its title header");
  }
  return {
    key: keys.next(),
    header: header(keys, first),
    blocks: rest.flatMap((child) => {
      const parsed = block(keys, child);
      return parsed ? [parsed] : [];
    }),
  };
}

export function parseLegalHtml(html: string): ParsedLegalDocument {
  const start = html.indexOf('<main class="doc">');
  const end = html.lastIndexOf("</main>");
  if (start < 0 || end < start) throw new Error('legal document: no <main class="doc">');

  const [main] = elementChildren(buildTree(html.slice(start, end + "</main>".length)));
  if (!main) throw new Error("legal document: empty <main>");

  const body = elementChildren(main);
  const annexAt = body.findIndex((node) => node.tag === "section");
  const own = annexAt < 0 ? body : body.slice(0, annexAt);
  const annexes = annexAt < 0 ? [] : body.slice(annexAt);

  let sequence = 0;
  const keys: Keys = { next: () => `n${sequence++}` };

  return {
    main: part(keys, own),
    annexes: annexes.map((section) => {
      if (section.tag !== "section" || !hasClass(section, "annex")) {
        throw new Error(`legal document: unexpected ${describe(section)} after an annex`);
      }
      return part(keys, elementChildren(section));
    }),
  };
}
