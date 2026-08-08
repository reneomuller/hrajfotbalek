<!-- letco:injected-rule begin slug="semantic-html" scope="system" content-hash="b7484c617aaa7b65d3ce4b5c98cf7eaf140d2e067092573abe82e2aaa14a88ba" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Use semantic HTML elements

The first choice for every UI element MUST be the most semantically correct
HTML element — only fall back to `<div>` when no semantic element fits.

## Common substitutions
- `<button>` over `<div onClick>` (free keyboard + accessibility)
- `<a href>` for navigation (vs. button + JS routing)
- `<nav>` for primary nav, `<main>` for main content
- `<header>`, `<footer>`, `<aside>`
- `<article>` for self-contained content, `<section>` for thematic groups
- `<ul>` / `<ol>` / `<li>` for lists (not `<div>`s with bullets)
- `<table>` / `<th>` / `<td>` for tabular data
- `<form>` + `<label htmlFor>` for inputs
- `<dialog>` for modals — supported in all evergreen browsers; pair with the
  `showModal()` API for proper focus trap and `Escape` handling

## Why
- Free accessibility (screen readers, keyboard, semantic landmarks)
- Free SEO (search engines understand structure)
- Free defaults (link clicks, form submission, button focus)
- Less custom code

## Test
- Tab through your UI — every interactive element is reachable
- Open a screen reader (VoiceOver, NVDA) — page structure is announced

<!-- letco:injected-rule end slug="semantic-html" -->