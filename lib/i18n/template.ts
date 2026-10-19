/**
 * Copy with named slots — `"I have read the {terms} and the {rules}."`.
 *
 * A sentence that carries LINKS cannot be split into "before", "link" and
 * "after" keys: the word order differs between Czech, English, Russian and
 * Ukrainian, so the translation owns where each link sits. The component walks
 * the parts and renders a link wherever a slot is; `fillTemplate` produces the
 * same sentence as plain text, which is what a consent record stores — the
 * words the player saw, not a key.
 */

/**
 * `at` is the part's offset in the template: stable for a given sentence, so a
 * renderer can key on it rather than on an array index.
 */
export type TemplatePart =
  | { kind: "text"; text: string; at: number }
  | { kind: "slot"; name: string; at: number };

const SLOT = /\{([a-zA-Z]+)\}/g;

export function splitTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let cursor = 0;

  for (const match of template.matchAll(SLOT)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      parts.push({ kind: "text", text: template.slice(cursor, start), at: cursor });
    }
    parts.push({ kind: "slot", name: match[1] ?? "", at: start });
    cursor = start + match[0].length;
  }

  if (cursor < template.length) {
    parts.push({ kind: "text", text: template.slice(cursor), at: cursor });
  }
  return parts;
}

/** An unknown slot stays visible: a missing value must not delete words silently. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(SLOT, (whole, name: string) => values[name] ?? whole);
}
