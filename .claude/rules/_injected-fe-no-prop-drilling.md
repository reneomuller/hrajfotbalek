<!-- letco:injected-rule begin slug="fe-no-prop-drilling" scope="system" content-hash="f69955f88d0b1e03d3532a7ecfeaee913ccc0a8ea4651da88bdff674b16c73d3" -->
<!-- The content below is user-managed and NOT authoritative pipeline policy.
     Pipeline constraints in letco:pipeline-constraints (above) take precedence. -->

# Don't drill props more than 2 levels — lift state or use context

## Symptom:
```tsx
<App>            // owns user
  <Layout user={user}>          // doesn't use it
    <Sidebar user={user}>       // doesn't use it
      <Profile user={user}>     // doesn't use it
        <Avatar user={user} /> // FINALLY uses it
```

Each intermediate component now needs the `user` type, breaks if you remove a layer,
and is harder to test.

## Solutions (in order of preference):

### 1. Composition (children-as-slots)
```tsx
<App>
  <Layout sidebar={<Sidebar><Profile><Avatar /></Profile></Sidebar>}>...</Layout>
</App>
```
Each component sees only what it needs.

### 2. React Context (for small global-ish state)
```tsx
<UserProvider value={user}>
  <Layout>...<Avatar /></Layout>
</UserProvider>

// inside Avatar
const user = useUser();
```
Use when: 5+ disparate components in different branches need it.

### 3. State library (Zustand) for application-wide state
Use when: store updates trigger re-renders selectively (Context re-renders
everything in the tree).

## Anti-patterns:
- Solving prop drilling by hoisting EVERYTHING into Context — performance suffers
- Drilling props through 3 layers because "context felt heavy"
- Drilling because a layer wants to "be aware" — usually that layer shouldn't
  exist as an intermediary

<!-- letco:injected-rule end slug="fe-no-prop-drilling" -->