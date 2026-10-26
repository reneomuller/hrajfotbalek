import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import substitutions from "@/content/legal/substitutions.json";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { parseLegalHtml } from "@/lib/content/legalHtml";
import {
  LEGAL_DOCUMENT_ORIGINAL,
  TERMS_RULES_ANCHOR,
  legalDocumentHtml,
  loadLegalDocument,
  type LegalDocumentName,
} from "@/lib/content/legalDocuments";
import { LEGAL_ORIGINALS } from "@/lib/content/legalOriginals.generated";
import { applyLegalSubstitutions } from "@/lib/content/legalSubstitutions";
import { COOKIES_VERSION, OPERATOR_CONTACT, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { strings } from "@/lib/strings";

/**
 * THE WORDS ON THE PAGE ARE THE LAWYER'S WORDS.
 *
 * The comparison runs on TEXT, not markup: the site draws the documents in its
 * own components, so the tags differ by design, and what must not differ is
 * any letter, digit or punctuation mark a reader sees. Inline tags vanish and
 * block tags become a space on both sides, so spacing between words is
 * compared too.
 *
 * THE EXPECTED EDITS ARE RESTATED HERE AS TEXT, not read back from
 * `substitutions.json`. If a rule in that file ever matched more than its
 * blank — a whole clause, say — a test that applied the same rule to both
 * sides would agree with itself and pass.
 */

const NAMES: LegalDocumentName[] = ["terms", "privacy", "cookies"];

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(span|strong|a|em|b|i)(\s[^>]*)?>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|nbsp|#x27|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

function originalFile(id: string): string {
  return readFileSync(path.resolve(process.cwd(), "content", "legal", "original", `${id}.html`), "utf8");
}

function originalBody(id: string): string {
  const html = originalFile(id);
  return html.slice(html.indexOf('<main class="doc">'), html.lastIndexOf("</main>") + "</main>".length);
}

/** The owner's rulings of 2026-10-19, as the reader sees them. */
function withPublishedEdits(text: string): string {
  return text
    .replaceAll("[●] 2026", "19. 10. 2026")
    .replaceAll(", telefon [●]", "")
    // Owner, 2026-10-26: playllu.com receives no mail; the contact is Seznam's.
    .replaceAll("info@playllu.com", "support@hrajfotbal.com");
}

function rendered(name: LegalDocumentName): string {
  return renderToStaticMarkup(
    <LegalDocumentView document={loadLegalDocument(name)} annexAnchor={TERMS_RULES_ANCHOR} />,
  );
}

describe("the published legal documents", () => {
  it.each(Object.values(LEGAL_DOCUMENT_ORIGINAL))(
    "embeds %s byte for byte, so a forgotten rebuild cannot ship stale text",
    (id) => {
      // Arrange
      const onDisk = originalFile(id);

      // Act
      const embedded = LEGAL_ORIGINALS[id];

      // Assert
      expect(embedded).toBe(onDisk);
    },
  );

  it.each(NAMES)("renders %s with the lawyer's text and only the documented edits", (name) => {
    // Arrange
    const expected = withPublishedEdits(visibleText(originalBody(LEGAL_DOCUMENT_ORIGINAL[name])));

    // Act
    const actual = visibleText(rendered(name));

    // Assert
    expect(actual).toBe(expected);
  });

  it.each(NAMES)("leaves no unfilled blank in %s", (name) => {
    // Act
    const text = visibleText(rendered(name));

    // Assert
    expect(text).not.toContain("[●]");
    expect(text).toContain("19. 10. 2026");
  });

  it("publishes the terms without a phone number", () => {
    // Act
    const text = visibleText(rendered("terms"));

    // Assert
    expect(text).not.toMatch(/telefon/i);
  });

  it.each([
    ["terms", TERMS_VERSION],
    ["privacy", PRIVACY_VERSION],
    ["cookies", COOKIES_VERSION],
  ] as const)("stamps %s with the version its header prints", (name, version) => {
    // Arrange
    const meta = loadLegalDocument(name).main.header.meta ?? [];

    // Act
    const printed = meta.map((node) => (node.kind === "text" ? node.text : "")).join("");

    // Assert
    expect(printed).toContain(`verze ${version}`);
  });

  it("anchors the rules attachment where signup links to it", () => {
    // Act
    const markup = rendered("terms");

    // Assert
    expect(markup).toMatch(new RegExp(`<h2 id="${TERMS_RULES_ANCHOR}"[^>]*>Příloha 1 – Pravidla komunity a hry</h2>`));
  });
});

describe("guards on the lawyer's files", () => {
  it("refuses a substitution that no longer matches as often as it says", () => {
    // Arrange
    const rule = { document: "doc", find: "[x]", replace: "y", count: 2, why: "test" };

    // Act
    const apply = () => applyLegalSubstitutions("doc", "one [x] only", [rule]);

    // Assert
    expect(apply).toThrow(/matched 1 times, expected 2/);
  });

  it("refuses to render a document whose blank was never filled", () => {
    // Arrange
    const unfilled = LEGAL_ORIGINALS["zasady-pouzivani-cookies"];

    // Act
    const parse = () => parseLegalHtml(unfilled);

    // Assert
    expect(parse).toThrow(/unfilled \[●\] placeholder/);
  });

  it("refuses markup it has never seen rather than dropping it", () => {
    // Arrange
    const html = '<main class="doc"><header class="title"><p class="kicker">K</p><h1>T</h1></header><ul><li>x</li></ul></main>';

    // Act
    const parse = () => parseLegalHtml(html);

    // Assert
    expect(parse).toThrow(/unexpected block <ul>/);
  });

  it("applies every rule to a document that exists", () => {
    // Arrange
    const ids = new Set<string>(Object.values(LEGAL_DOCUMENT_ORIGINAL));

    // Act
    const stray = substitutions.rules.filter((rule) => !ids.has(rule.document));

    // Assert
    expect(stray).toEqual([]);
  });
});

describe("the operator's address", () => {
  it("is the same address in the contact fallback and the legal constants", () => {
    // Assert
    expect(strings.siteFooter.contactEmail).toBe(OPERATOR_CONTACT.email);
  });
});

/**
 * ROUND 40 — the analytics and marketing cookies join the table only while a
 * GTM container is configured (Texty pro web 9.2: "doplnit tabulku"). Restated
 * as TEXT, like the edits above, so a rule that matched more than the table
 * cannot agree with itself.
 */
const ANALYTICS_ROWS =
  "Analytické _ga, _ga_* – Google Ireland Limited analytika, měření návštěvnosti 2 roky ano " +
  "Marketingové _fbp, fr – Meta Platforms Ireland Limited měření a cílení reklamy 90 dní ano";

/**
 * Article 2.2, owner-approved (2026-10-26): its first three sentences describe a
 * site WITHOUT optional cookies ("pouze nezbytné… Pokud je začneme používat"),
 * so while a container is configured they become the present-tense account of
 * the banner, and the fourth moves from "bude možné" to "můžete".
 */
const ARTICLE_2_2_BEFORE =
  "Platforma v současnosti používá pouze nezbytné Cookies. Analytické, preferenční ani marketingové Cookies nepoužíváme. Pokud je začneme používat, doplníme je do tabulky v Článku 3 (Jaké Cookies používáme) a před jejich použitím si vyžádáme váš souhlas prostřednictvím lišty, kde bude možné všechny volitelné Cookies přijmout, všechny odmítnout nebo vybrat jednotlivé kategorie. Udělený souhlas bude možné kdykoli stejně snadno odvolat přes odkaz „Nastavení cookies“ v patičce každé stránky.";
const ARTICLE_2_2_AFTER =
  "Vedle nezbytných Cookies používáme s vaším souhlasem analytické a marketingové Cookies uvedené v Článku 3 (Jaké Cookies používáme). Preferenční Cookies nepoužíváme. Souhlas udělujete prostřednictvím lišty, kde lze všechny volitelné Cookies přijmout, všechny odmítnout nebo vybrat jednotlivé kategorie. Udělený souhlas můžete kdykoli stejně snadno odvolat přes odkaz „Nastavení cookies“ v patičce každé stránky.";

describe("the cookie table and analytics", () => {
  it("lists only the necessary cookies while no tag container is configured", () => {
    // Arrange
    const html = legalDocumentHtml("cookies", false);

    // Act
    const text = visibleText(html);

    // Assert
    expect(text).not.toContain("_ga");
    expect(text).not.toContain("_fbp");
    expect(text).toContain(ARTICLE_2_2_BEFORE);
  });

  it("adds exactly the Google and Meta rows and the new article 2.2, once one is", () => {
    // Arrange
    const original = withPublishedEdits(
      visibleText(originalBody(LEGAL_DOCUMENT_ORIGINAL.cookies)),
    );
    expect(original).toContain(ARTICLE_2_2_BEFORE);
    const expected = original
      .replace("30 minut ne", `30 minut ne ${ANALYTICS_ROWS}`)
      .replace(ARTICLE_2_2_BEFORE, ARTICLE_2_2_AFTER);

    // Act
    const actual = visibleText(
      renderToStaticMarkup(
        <LegalDocumentView
          document={parseLegalHtml(legalDocumentHtml("cookies", true))}
          annexAnchor={TERMS_RULES_ANCHOR}
        />,
      ),
    );

    // Assert
    expect(actual).toBe(expected);
  });
});
