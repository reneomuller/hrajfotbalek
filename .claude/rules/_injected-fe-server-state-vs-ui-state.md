<!-- letco:injected-rule begin slug="fe-server-state-vs-ui-state" scope="system" content-hash="d230f15fcaa5852ded2833ed27a1c51137f0c2f4eb3be7d2e80d4145962451a0" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Separate server state from UI state

The two are different problems with different tools. Mixing them produces brittle
code with manual cache invalidation and stale-data bugs.

## Server state (data fetched from API):
- **Owned by the server**, can become stale, needs cache / invalidation / retry /
  optimistic updates
- **Use a server-state library** appropriate to your stack:

| Stack / API style | Library |
|-------------------|---------|
| React + REST | TanStack Query, SWR, RTK Query |
| Vue + REST | Vue Query (TanStack), Pinia Colada |
| Svelte + REST | TanStack Query (Svelte adapter), `@tanstack/svelte-query` |
| Solid | `@tanstack/solid-query` |
| Apollo Client (GraphQL) | Apollo Cache (already a server-state library) |
| Relay (GraphQL) | Relay store (already a server-state library) |
| urql (GraphQL) | urql cache exchanges |
| tRPC | `@trpc/react-query` (TanStack under the hood) |

**Whichever library is already in the project IS the right one** — don't
migrate to a different one without a real reason. Apollo / Relay / urql are
NOT inferior to TanStack Query for GraphQL; they're purpose-built for it.

## UI state (modal open, selected tab, form draft):
- **Owned by the user**, synchronous, transient
- **Tools**: `useState` (local), Zustand / Jotai / Pinia / Svelte stores
  (cross-component), URL params (shareable / linkable state)

## Decision tree
- "Where does this data come from?"
  - From an API → server-state library (TanStack Query, Apollo, Relay, urql, …)
  - From the user → `useState` → cross-component store if reused
  - From the URL → router params (filters, pagination, tabs that should be
    shareable)
  - Computed from above → derive on the fly, don't store

## Required
- API responses go through the project's server-state library — never plain
  `fetch` + `useState` for app data (that re-implements caching badly)
- Mutations use the library's mutation primitive (cache invalidation /
  optimistic updates / refetch)
- UI state defaults to `useState` until ≥ 2 unrelated components need it (then
  promote to a store)

## Forbidden
- `const [data, setData] = useState([])` followed by `useEffect(() => fetch(...))`
  for application data — re-implements caching, missing invalidation
- API responses cached in a generic store (Redux / Zustand / Pinia) WITHOUT
  proper invalidation logic
- Single store with both `modalOpen` and `users` arrays — different concerns
- Migrating from Apollo to TanStack Query "to follow this rule" — Apollo IS
  the server-state library for GraphQL projects

<!-- letco:injected-rule end slug="fe-server-state-vs-ui-state" -->