import { Fragment, type ReactNode } from "react";
import type {
  LegalBlock,
  LegalHeader,
  LegalInline,
  LegalPart,
  ParsedLegalDocument,
} from "@/lib/content/legalHtml";

/**
 * A lawyer's document, drawn in the site's own tokens.
 *
 * EVERY WORD ON IT COMES FROM THE PARSED DOCUMENT, and nothing else is added
 * inside the `<article>`: no labels, no separators, no spacing characters.
 * `lib/content/__tests__/legalDocuments.test.ts` renders this component and
 * compares its text with the lawyer's file, which only holds while gaps are
 * drawn by CSS rather than typed. Page furniture (the language notice, the PDF
 * link) belongs to `LegalPage`, outside the article.
 *
 * `lang="cs"` because the documents are Czech in every locale, so a screen
 * reader on an English page switches voice for them.
 */

function Inline({ nodes }: { nodes: LegalInline[] }): ReactNode {
  return nodes.map((node) => {
    if (node.kind === "text") return <Fragment key={node.key}>{node.text}</Fragment>;
    if (node.kind === "strong") {
      return (
        <strong key={node.key} className="font-semibold text-bone">
          <Inline nodes={node.children} />
        </strong>
      );
    }
    const external = node.href.startsWith("http");
    return (
      <a
        key={node.key}
        href={node.href}
        className="text-volt underline-offset-4 hover:underline"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        <Inline nodes={node.children} />
      </a>
    );
  });
}

function Header({
  header,
  level,
  anchor,
}: {
  header: LegalHeader;
  level: "document" | "annex";
  anchor?: string;
}) {
  const Title = level === "document" ? "h1" : "h2";
  return (
    <header className="flex flex-col gap-2 border-b border-hairline-strong pb-5">
      <p className="m-0 text-eyebrow uppercase text-volt">
        <Inline nodes={header.kicker} />
      </p>
      <Title
        id={anchor}
        className="m-0 scroll-mt-24 font-display text-title uppercase text-bone"
      >
        <Inline nodes={header.title} />
      </Title>
      {header.sub ? (
        <p className="m-0 text-small italic text-muted">
          <Inline nodes={header.sub} />
        </p>
      ) : null}
      {header.meta ? (
        <p className="m-0 text-small text-faint">
          <Inline nodes={header.meta} />
        </p>
      ) : null}
    </header>
  );
}

type Item = Extract<LegalBlock, { kind: "item" }>;

/** A heading and everything up to the next one, with consecutive items gathered into a list. */
interface Section {
  key: string;
  heading: Extract<LegalBlock, { kind: "heading" }> | null;
  body: (Exclude<LegalBlock, { kind: "heading" | "item" }> | { kind: "items"; key: string; items: Item[] })[];
}

function sections(blocks: LegalBlock[]): Section[] {
  const out: Section[] = [];
  for (const block of blocks) {
    if (block.kind === "heading") {
      out.push({ key: block.key, heading: block, body: [] });
      continue;
    }
    if (out.length === 0) out.push({ key: `${block.key}-lead`, heading: null, body: [] });
    const current = out[out.length - 1];
    if (!current) continue;
    if (block.kind !== "item") {
      current.body.push(block);
      continue;
    }
    const last = current.body[current.body.length - 1];
    if (last && last.kind === "items") last.items.push(block);
    else current.body.push({ kind: "items", key: `${block.key}-list`, items: [block] });
  }
  return out;
}

const NUMBERED_ROW = "grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2";

function Body({ section }: { section: Section }) {
  return section.body.map((block) => {
    if (block.kind === "clause") {
      return (
        <p key={block.key} className={`m-0 ${NUMBERED_ROW}`}>
          <span className="font-semibold text-bone">{block.number}</span>
          <span>
            <Inline nodes={block.content} />
          </span>
        </p>
      );
    }
    if (block.kind === "items") {
      return (
        <ol key={block.key} className="m-0 flex list-none flex-col gap-1 p-0 pl-12">
          {block.items.map((item) => (
            <li key={item.key} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
              <span>{item.number}</span>
              <span>
                <Inline nodes={item.content} />
              </span>
            </li>
          ))}
        </ol>
      );
    }
    return (
      <div key={block.key} className="overflow-x-auto rounded-card border border-hairline">
        <table className="w-full min-w-[34rem] border-collapse text-left text-small">
          <thead>
            <tr>
              {block.head.map((cell) => (
                <th
                  key={cell.key}
                  scope="col"
                  className="bg-surface-raised px-3 py-2 align-bottom font-semibold text-bone"
                >
                  <Inline nodes={cell.content} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.key} className="border-t border-hairline">
                {row.cells.map((cell) => (
                  <td key={cell.key} className="px-3 py-2 align-top">
                    <Inline nodes={cell.content} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  });
}

function Part({
  part,
  level,
  anchor,
}: {
  part: LegalPart;
  level: "document" | "annex";
  anchor?: string;
}) {
  const Heading = level === "document" ? "h2" : "h3";
  return (
    <>
      <Header header={part.header} level={level} anchor={anchor} />
      {sections(part.blocks).map((section) => (
        <section key={section.key} className="flex flex-col gap-2">
          {section.heading ? (
            <Heading className="m-0 mt-4 flex items-baseline gap-3 text-body-lg font-semibold text-bone">
              <span className="inline-flex min-w-7 justify-center rounded-chip bg-volt px-1 text-small font-bold text-ink">
                {section.heading.number}
              </span>
              <span>
                <Inline nodes={section.heading.title} />
              </span>
            </Heading>
          ) : null}
          <Body section={section} />
        </section>
      ))}
    </>
  );
}

export function LegalDocumentView({
  document,
  annexAnchor,
}: {
  document: ParsedLegalDocument;
  /** The id given to the first annex's title, so it can be linked to. */
  annexAnchor?: string;
}) {
  return (
    <article
      lang="cs"
      data-testid="legal-document"
      className="flex flex-col gap-4 text-body text-white/80"
    >
      <Part part={document.main} level="document" />
      {document.annexes.map((annex, index) => (
        <section
          key={annex.key}
          className="mt-10 flex flex-col gap-4"
          data-testid="legal-annex"
        >
          <Part part={annex} level="annex" anchor={index === 0 ? annexAnchor : undefined} />
        </section>
      ))}
    </article>
  );
}
