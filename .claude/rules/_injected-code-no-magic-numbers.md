<!-- letco:injected-rule begin slug="code-no-magic-numbers" scope="system" content-hash="724e51425225c5b4742ef098ca3373346ec57b22728fcbde49af3013d07a9a60" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Magic numbers are named constants

## Bad:
```ts
if (retries > 3) { … }
setTimeout(fn, 86400000);
if (user.role === 2) { … }
```

## Good:
```ts
const MAX_RETRIES = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ROLE_ADMIN = 2;

if (retries > MAX_RETRIES) { … }
setTimeout(fn, ONE_DAY_MS);
if (user.role === ROLE_ADMIN) { … }
```

## When numbers are OK without naming:
- 0, 1, -1 used in obvious idioms (`array.length - 1`, `Math.max(0, x)`)
- Index in a literal array `arr[0]`, `arr[2]`
- Truly trivial constants in test fixtures

## Required:
- Constants live near where they're used; module-scoped `const`
- Group related constants (`const TIMEOUTS = { connect: 5000, read: 30000 }`)
- Prefer enums for closed sets (`enum UserRole { Admin, Editor, Viewer }`)
- Use `const` not `let` for genuine constants

## Anti-patterns:
- Re-declaring the same constant in 5 files (DRY: move to shared module)
- Constants with names like `THE_NUMBER`, `X`, `CONFIG_VALUE` (uninformative)
- Defining `const ZERO = 0` (over-correction)

<!-- letco:injected-rule end slug="code-no-magic-numbers" -->