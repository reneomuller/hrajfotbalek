<!-- letco:injected-rule begin slug="test-aaa-structure" scope="system" content-hash="1a34e629afb31b0d565f3d42c1b62ec72b349dd11b1958dc4e3e0fd2e62e0448" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Tests follow Arrange-Act-Assert

Every test must have three visually distinct sections.

## TypeScript / JS (Jest, Vitest, Mocha)
```ts
it('rejects email already in use', async () => {
  // Arrange
  await createUser({ email: 'maria.j.muniz@example.com' });

  // Act
  const result = await registerUser({ email: 'maria.j.muniz@example.com', password: 'Tr0ub4dor&3' });

  // Assert
  expect(result.error).toBe('email_in_use');
  expect(result.userId).toBeUndefined();
});
```

## Python (pytest)
```python
def test_rejects_email_already_in_use(db):
    # Arrange
    create_user(email="maria.j.muniz@example.com")

    # Act
    result = register_user(email="maria.j.muniz@example.com", password="Tr0ub4dor&3")

    # Assert
    assert result.error == "email_in_use"
    assert result.user_id is None
```

## Go (testing + table tests)
```go
func TestRegisterUser_RejectsEmailAlreadyInUse(t *testing.T) {
    // Arrange
    _, _ = createUser("maria.j.muniz@example.com")

    // Act
    result, err := registerUser("maria.j.muniz@example.com", "Tr0ub4dor&3")

    // Assert
    if err == nil || err.Error() != "email_in_use" { t.Fatalf("expected email_in_use, got %v", err) }
    if result != nil { t.Fatalf("expected nil result, got %+v", result) }
}
```

## Rust (#[test])
```rust
#[test]
fn rejects_email_already_in_use() {
    // Arrange
    create_user("maria.j.muniz@example.com");

    // Act
    let result = register_user("maria.j.muniz@example.com", "Tr0ub4dor&3");

    // Assert
    assert!(matches!(result, Err(Error::EmailInUse)));
}
```

## Rules (every stack):
- One logical concept per test (multiple assertions on the same outcome are OK;
  multiple unrelated assertions are not — split into two tests)
- Test name reads as a sentence: "subject + verb + condition"
- Arrange uses meaningful fixture names, not `a`, `b`, `c`
- No unrelated setup in Arrange — only what this test needs
- No assertions in Arrange/Act sections (use `beforeEach` / fixture / setup func)

## Forbidden:
- One mega-test that covers 10 cases (split them)
- Asserting in setup (`beforeEach` / pytest fixture / TestMain) — it's setup, not verification
- Tests that mutate shared module state (reset between tests)

<!-- letco:injected-rule end slug="test-aaa-structure" -->