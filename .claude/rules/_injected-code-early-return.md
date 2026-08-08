<!-- letco:injected-rule begin slug="code-early-return" scope="system" content-hash="0bfcd0f0d921b0f2016a38c691a3e3730421b0e3941c647bff1a099470581ef5" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Use early returns to keep the happy path indented at level 1

## Bad (arrow / pyramid of doom):
```ts
function process(input) {
  if (input) {
    if (input.valid) {
      if (input.user) {
        if (input.user.active) {
          // … real work, indented 4 levels deep
        }
      }
    }
  }
}
```

## Good (early returns / guard clauses):
```ts
function process(input) {
  if (!input)         throw new Error('input required');
  if (!input.valid)   throw new ValidationError('invalid input');
  if (!input.user)    throw new Error('user required');
  if (!input.user.active) throw new ForbiddenError('user inactive');

  // … real work, indented 1 level
}
```

## Heuristics:
- Max 3 levels of nesting for any branch
- Else after return / throw is unnecessary — drop it
- Multi-clause boolean: name it (`const canEdit = …; if (canEdit) …`)

## Anti-patterns:
- Returning at the *end* of every branch ("structured programming purity") — makes
  the structure unreadable for non-trivial functions
- Nested ternary with > 2 levels — extract to `if/else` or lookup table
- `return; // implicit undefined` without comment — looks like a bug

<!-- letco:injected-rule end slug="code-early-return" -->