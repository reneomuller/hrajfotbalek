<!-- letco:injected-rule begin slug="code-strict-typescript" scope="system" content-hash="b72fc2755f4432f8077861b26e2edb91ab39b4cdf5c078fb191bc72d7b32f7da" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# TypeScript is strict — no any, no implicit any, no @ts-ignore

## Required `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

## Optional but recommended (case-by-case):
- `exactOptionalPropertyTypes: true` — strictest correctness, but introduces
  friction with many libraries (`undefined` vs missing key distinction). Many
  teams in 2026 keep it off in app code and on in shared / library packages.
  Decide per-package, document in the team's TS conventions.
- `verbatimModuleSyntax: true` — explicit type-only imports, useful with ESM
- `isolatedModules: true` — required for Vite / esbuild / SWC pipelines

## Forbidden in production code:
- `any` — always replaceable with `unknown`, generics, or a discriminated union
- `as Foo` cast without a runtime check immediately adjacent
- `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error` without a comment + bug ticket
- `Function`, `Object` types — use `(...args: unknown[]) => unknown` or
  `Record<string, unknown>`
- Empty interface (`interface Foo {}`) — use `type Foo = unknown`

## When `any` is grudgingly OK:
- Third-party library has no types and you've added a one-line comment with an
  issue link
- Migration from JS — `any` allowed during the transition, with a tracking ticket

## Type narrowing:
- Use `unknown` for parsed JSON, then validate with Zod / runtime guard
- Use type predicates (`function isUser(v): v is User`) to communicate intent
- Discriminated unions for state machines (`{ status: 'idle' } | { status: 'loading' } | { status: 'error', error }`)

## Why:
- Most "AI bugs" are silent type drift; `strict` catches them at the type level
- `unknown` forces validation at boundaries, which is where bugs come from
- Refactors with strict types fail the build instead of failing in production

<!-- letco:injected-rule end slug="code-strict-typescript" -->