<!-- letco:injected-rule begin slug="react-no-direct-dom" scope="system" content-hash="8c6f10a4a47e7d8d83ff422b0bfb6bddb906ce1a9ae69764b63cf968b6c0457c" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# No direct DOM manipulation in React

React components MUST NOT directly query or mutate the DOM.

## Prohibited
- `document.querySelector`, `document.getElementById`
- `element.innerHTML = ...` (also XSS risk)
- `element.style.X = ...` outside refs
- `element.classList.add(...)` instead of state

## Required pattern
- State for "what should be visible" → render conditionally
- `useRef` for *imperative* DOM access (focus, scroll, measure)
- `useEffect` for side effects that can't be expressed in render
- Refs flow down via `forwardRef` for child components

## Exceptions
- Integrating with a third-party non-React widget (use a wrapper component)
- Performance-critical animations (RAF + ref + style for transient values)

<!-- letco:injected-rule end slug="react-no-direct-dom" -->