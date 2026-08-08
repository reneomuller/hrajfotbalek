<!-- letco:injected-rule begin slug="react-key-prop" scope="system" content-hash="1675424e108ed6bc862716e1e3f3dd87da3b338f5feea0c2ff7f6a7297e0d43a" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# List items have stable, unique key prop

When rendering arrays in JSX, each element MUST have a `key` prop that is:
1. **Unique** within the array
2. **Stable** across re-renders (same item = same key)

## Required pattern
- Use the item's database ID: `{items.map(i => <Row key={i.id} {...i} />)}`
- For ad-hoc lists without IDs, generate stable IDs once (`crypto.randomUUID()` in state, not in render)

## Prohibited
- `key={index}` — breaks reconciliation when the list reorders
- `key={Math.random()}` — every render makes a new key, defeats memoization
- Missing `key` (React warns, but it's a real bug)

## Why
React uses keys to match elements between renders. Wrong keys cause:
- Unnecessary unmount + remount (lost state, lost focus, lost animations)
- Wrong components getting wrong props during reconciliation

<!-- letco:injected-rule end slug="react-key-prop" -->