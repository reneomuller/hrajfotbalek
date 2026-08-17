<!-- letco:injected-rule begin slug="arch-no-circular-deps" scope="system" content-hash="07d6f376ec15df13000a3edcfa78353357abcd19f93898f1363a7fb9bc59af26" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Modules form a DAG — no circular dependencies

## Why:
- Circular deps break tree-shaking, lazy loading, partial initialisation order
- Indicate that two "modules" are conceptually one (or that a third should exist
  to host the shared concept)
- Cause tools to fall back to runtime resolution, hiding bugs

## Detection:
- TypeScript / JavaScript: `madge --circular`, `dpdm`, or
  `eslint-plugin-import/no-cycle` — fail CI on any cycle
- Python: `import-linter` (declarative contracts) or `tach` (modern, fast).
  Pylint's `cyclic-import` check is weaker; prefer `import-linter` or `tach`.
- Java / Kotlin: `ArchUnit` (architecture tests), JDeps, or jQAssistant
- C# / .NET: `NetArchTest` or `ArchUnitNET`
- Rust / Go: the compiler / linker enforces this at the crate / package level
  (you'll fail to build); enforce intra-crate / intra-module patterns with
  `cargo-modules` (Rust) or a custom analyzer if needed

## Resolution patterns:
1. **Extract** — move the shared code into a new module that both depend on
2. **Invert** — define an interface in module A, module B implements it
3. **Inline** — sometimes A and B are really one module; merge them
4. **Event** — use an event bus / observer pattern instead of direct call

## Allowed exception:
- Type-only circular import (`import type { X } from './b'` in TS) is sometimes
  necessary and is harmless if the cycle is types-only

## Forbidden:
- Resolving a runtime cycle by sprinkling `require()` inside functions
- "Just one cycle, it's fine" — once allowed, more accumulate

<!-- letco:injected-rule end slug="arch-no-circular-deps" -->