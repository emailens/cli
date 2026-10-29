---
name: emailens
description: Check HTML email before it ships. Use whenever you write or edit an email template (raw HTML, React Email, MJML, Maizzle) or the code that sends one: run emailens lint on the built HTML and fix every error before you call the work done. Catches what a browser preview hides, such as Gmail dropping a whole style block, Outlook ignoring flex and rem, Yahoo dropping quoted fonts, dark mode inversion and missing unsubscribe links.
---

# Emailens: lint email HTML before it ships

A browser preview is not an inbox. Gmail, Outlook and Yahoo strip or rewrite CSS
that renders fine in Chrome, so an email that looks right locally can arrive
broken. Check the HTML the client will actually receive.

## When

After any change to an email template or to the HTML an app sends, before you
say the task is done.

## How

1. Build the email to HTML with the project's own step (React Email export,
   `mjml in.mjml -o out.html`, `maizzle build`). Lint the output, not the
   source: it is what the inbox gets, and it needs no compiler installed
   beside the CLI.
2. Run, from the project root:

   ```bash
   npx -y @emailens/cli lint path/to/email.html --json
   ```

   Several files: `'out/*.html'` (one level, no `**`).
3. Read the JSON. Each file has `issues`: `severity`, `category` (the clients,
   or a check such as `spam` or `accessibility`), `rule`, `message`, and `loc`
   (line and column) for HTML input.
4. Fix every `error`. Fix `warning`s that apply to clients the project targets;
   the message says which client breaks and how. `info` is a safe fallback,
   not a problem: leave it.
5. Re-run until there are no errors. Exit code `0` is clean, `1` means errors,
   `2` means a warning limit was hit.

## Rules

- Keep the design. Fix the cause the message names (add the Outlook fallback,
  unquote the font, inline the style) rather than deleting the styling.
- Do not silence a finding by skipping its check. If a finding is wrong for
  this project, say so to the user; a project `.emailensrc` can set rule
  severities.
- Report what you fixed and anything left, with the lint summary line.

## More

- `--fail-on-warning` or `--max-warnings n` for stricter CI.
- In GitHub Actions add `--reporter github` to put findings on their lines in
  the pull request.
- In tests: `import { expectEmailToPass } from "@emailens/cli/test"`.
- MCP server with the same checks: `npx -y @emailens/mcp`.
- Rendered per client, no signup: https://app.emailens.dev/try
