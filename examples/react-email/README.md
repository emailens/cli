# React Email + Emailens

A React Email template with a test that fails when the email would break in
an inbox: the same checks as `emailens lint`, as an assertion.

```bash
npm install
npm test
```

`emails/welcome.test.tsx` is the whole integration:

```tsx
expectEmailToPass(await render(<Welcome name="Ada" />));
```

In CI, lint the exported HTML too and put findings on the pull request's lines:

```yaml
- run: npx -y @emailens/cli lint 'out/*.html' --reporter github
```
