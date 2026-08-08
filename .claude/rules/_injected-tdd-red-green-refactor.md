<!-- letco:injected-rule begin slug="tdd-red-green-refactor" scope="system" content-hash="1c0177d6dc248acee90098f1f7ab253f0793883fa7c6e4fd66a4ca51ccaf7bf5" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# TDD red-green-refactor cycle is mandatory for new logic

For new business logic (services, validators, parsers, state machines, calculators):

## The cycle
1. **Red** — Write the smallest test that captures the next behavior. It MUST fail
   (run it; see red). Don't write tests against code that doesn't exist yet, **then**
   write the code; the test must run and fail first.
2. **Green** — Write the simplest possible implementation that makes the test pass.
   No premature generalization. Don't anticipate the next test.
3. **Refactor** — Clean up the implementation AND the test. Tests stay green.
   Refactor is mandatory; skipping it is technical debt acceleration.

## When TDD applies:
- Service methods with business rules
- Pure functions / utilities
- State machine transitions
- Parsers, validators, transformers
- Bug fixes — write the regression test first (red), then fix (green)

## When TDD is overhead and may be skipped:
- Trivial getters/setters / type aliases
- One-line wrappers around library calls (test the library's interface, not yours)
- UI layout / styling (test interaction behavior instead)
- Glue code with no decisions (just plumbing)

## Anti-patterns:
- Writing all tests first, then all code → the tests aren't really testing the design
- "I'll add tests later" → never happens
- Refactor + new test in the same step → can't tell which broke

<!-- letco:injected-rule end slug="tdd-red-green-refactor" -->