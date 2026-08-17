<!-- letco:injected-rule begin slug="arch-single-responsibility" scope="system" content-hash="c833e977ed4c6561ab78df9468482c3acbe0b5294bddef0ed67d3101f7edc432" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Each class / module has one reason to change

## Heuristic:
- File > 300 lines → smell. Investigate split.
- Class > 200 lines → smell.
- Function > 50 lines → smell.
- (These are not hard limits, but cross-checks)

## SRP test:
"Why would this file change?"
- One answer = good
- "Either when the user form changes OR when the payment validation changes" =
  two reasons → split

## Common splits:
- `UserService` doing CRUD + email + audit → `UserService`, `UserNotifier`,
  `UserAuditLog`
- React component with data fetching + UI → custom hook + presentational component
- Route handler with parsing + business + persistence → handler delegates to service

## What's NOT a violation:
- 50-line config file (config IS one concern)
- Generated code (don't split your code generator's output)
- Pure data shapes / type definitions (one logical group is one file)

## Anti-patterns:
- `utils.ts` — what utils? for what? Ever-growing dumping ground
- `Manager`, `Handler`, `Helper` suffix without specifics — SRP-violating naming
- "I split it" by mechanically extracting 50 lines into another file with no
  conceptual cohesion

<!-- letco:injected-rule end slug="arch-single-responsibility" -->