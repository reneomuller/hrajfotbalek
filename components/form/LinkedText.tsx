import { Fragment } from "react";
import Link from "next/link";
import { splitTemplate } from "@/lib/i18n/template";

/**
 * A translated sentence with links inside it — "I agree to the {terms}."
 *
 * The translation owns the word order, so the link can land anywhere in the
 * sentence; see `lib/i18n/template.ts`. Links open in a new tab because every
 * caller is a form, and following a link must not throw away what was typed.
 */
export function LinkedText({
  template,
  links,
}: {
  template: string;
  links: Record<string, { href: string; label: string }>;
}) {
  return (
    <>
      {splitTemplate(template).map((part) => {
        if (part.kind === "text") return <Fragment key={part.at}>{part.text}</Fragment>;
        const link = links[part.name];
        if (!link) return <Fragment key={part.at}>{`{${part.name}}`}</Fragment>;
        return (
          <Link
            key={part.at}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
