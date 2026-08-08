<!-- letco:injected-rule begin slug="fe-error-boundary" scope="system" content-hash="47d41da1b1d6d06469b960386c95968f87e08be720baed60d6f8d62962e67140" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Every route has an Error Boundary

## Required:
- Top-level route layout has `<ErrorBoundary>` with a fallback UI
- The fallback shows: short error description, "Try again" button, link to support
- The boundary logs the error with stack + request ID to the observability backend

## Pattern (React):
```tsx
<Routes>
  <Route element={<RootErrorBoundary />}>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/projects" element={<Projects />} />
  </Route>
</Routes>
```

Or per route — for finer-grained recovery:
```tsx
<Route element={<ProjectErrorBoundary />}>
  <Route path="/projects/:id" element={<ProjectDetail />} />
</Route>
```

## Why:
- Without a boundary, a single render error blanks the whole app (`<div id="root"/>`
  becomes empty)
- The fallback gives users an action and the support team a request id

## Required logging:
- The boundary's `componentDidCatch` / `onError` calls the observability client
- Includes: error name, stack, route, build hash, user id (if any), request id
  (if available)

## Forbidden:
- Logging `console.error` only — production observability won't see it
- A boundary that swallows the error silently (must always show *something*)
- Catching errors only in event handlers — render errors still slip through

## React 19+: also handle `onUncaughtError` and `onCaughtError` callbacks at the
`createRoot` level for the truly top-level catch.

<!-- letco:injected-rule end slug="fe-error-boundary" -->