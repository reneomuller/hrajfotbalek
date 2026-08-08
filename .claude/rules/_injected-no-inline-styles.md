<!-- letco:injected-rule begin slug="no-inline-styles" scope="system" content-hash="8dfc1fe067bbfdab249d9fcf7b78e509b348e2d8880d30e2ee44e2600138542e" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Avoid inline styles for static values

Static styling MUST go through the project's styling system, not inline `style={…}` props.

## Why
- Inline styles bypass the design system
- Can't be overridden by CSS, can't use pseudo-classes/media queries
- Performance: re-creates the style object on every render

## Use instead — match the project's styling system
- TailwindCSS: `className="px-4 py-2 bg-blue-500"`
- CSS Modules: `className={styles.button}`
- styled-components / Emotion: `const Button = styled.button`
- Vanilla Extract / Panda CSS / other CSS-in-TS
- Vue / Svelte / Astro: scoped `<style>` blocks
- React Native: `StyleSheet.create({...})` then `style={styles.button}` —
  this rule is the equivalent of "no ad-hoc inline objects" for RN
- SwiftUI / Jetpack Compose: native modifiers (`.padding(.horizontal, 16)`,
  `Modifier.padding(horizontal = 16.dp)`)

## Inline IS appropriate for
- Truly dynamic values (e.g. `style={{ width: \`${pct}%\` }}`)
- Animation transient values (RAF + ref)
- Third-party component props that require style objects

## Anti-patterns
- `style={{ marginTop: '8px' }}` in a Tailwind project → use `mt-2`
- `style={{ display: 'flex' }}` → use `flex` class
- React Native: ad-hoc `style={{ marginTop: 8 }}` repeated everywhere → extract
  into `StyleSheet.create` for caching

<!-- letco:injected-rule end slug="no-inline-styles" -->