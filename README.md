<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/wordmark-dark.svg">
  <img src="./docs/wordmark-light.svg" alt="emailens / cli" width="444">
</picture>

**The email rendering linter for terminal and CI**

[![CI](https://github.com/emailens/cli/actions/workflows/ci.yml/badge.svg)](https://github.com/emailens/cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@emailens/cli)](https://www.npmjs.com/package/@emailens/cli)
[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://github.com/emailens/mcp)

</div>

```text
$ emailens lint emails/welcome.html --fail-on-warning
emails/welcome.html
  warn   6:17  outlook-windows-legacy  display:flex            Outlook Classic receives this flex box. The MSO branch needs a table.
  warn   6:30  outlook-windows-legacy,yahoo-mail,yahoo-mail-android+2  gap                     Outlook Classic does not support "gap".
  warn   6:39  outlook-windows-legacy,outlook-windows-legacy  padding                 Outlook Classic drops this padding. Put it on a table cell, or set mso-padding-alt on one.
  warn         inboxPreview        preheader-too-short     Preheader is only 22 characters, so email clients may backfill with body text (recommended: 30+).
  9 info: safe fallbacks, not problems. --info lists them.

1 file | 4 warnings

Failed: 4 warnings found (--failOnWarning)
See it rendered in Gmail, Outlook and Apple Mail, no signup: https://app.emailens.dev/try?utm_source=cli&utm_medium=lint
```

That is a flex row with a rounded button, checked against 21 email clients.
Each finding has its line:column, and the exit code (here 2) fails the build.
The rounded corners are among the 9 info findings: Outlook Classic draws them
square, a safe fallback rather than a problem. The last line appears only when
the check fails; `--quiet` drops it, and `--json` never has it.

## Install

```bash
npm install -g @emailens/cli
```

## Run

```bash
emailens lint 'emails/*.html'
```

Or without installing: `npx @emailens/cli lint email.html`. HTML, React Email
(`.tsx`/`.jsx`), MJML and Maizzle are detected from the extension and compiled
first, so the check runs on the HTML that would be sent. No account and no
network: the analysis runs locally.

Exit codes: `0` clean, `1` errors, `2` warnings with `--fail-on-warning`, or
more than `--max-warnings`.

## Why not caniemail, or React Email's own checker?

[Can I email](https://www.caniemail.com) is the support table: one feature,
every client. It does not read your email. This CLI's support data is generated
from caniemail's (synced 2026-10-27), plus the cells a real-device screenshot
contradicted, each marked "Observed" with its date. What the CLI adds is the
reading: it finds the features your file uses, points at the line, scores each
client, and exits non-zero.

[React Email 4](https://resend.com/blog/react-email-4) added a compatibility
checker, also powered by Can I email, to its preview. Its CLI (`email dev`,
`build`, `start`, `export`) has no check command and no exit code for CI, per
[its docs](https://react.email/docs/cli). This CLI reads React Email files as
well as MJML, Maizzle and plain HTML, and fails the build.

Beyond CSS support, `lint` checks what neither covers: spam signals, links,
accessibility, images, the inbox preview text, size, template variables,
overflow, dark-mode and mobile contrast, Outlook VML, styles a client drops, and
client-targeting hacks.

## Extras

### `lint` options

| Flag | Alias | Description |
|------|-------|-------------|
| `--format` | `-f` | Input format: `html`, `jsx`, `mjml`, `maizzle`. `.vue` is `maizzle`. A pasted Vue file with no flag is detected. |
| `--json` | | Output as JSON, one line, every finding including info |
| `--info` | | List info findings too. By default they are counted, not listed: they are safe fallbacks, not problems |
| `--fail-on-warning` | | Exit 2 if warnings found |
| `--max-warnings` | | Fail if more than n warnings |
| `--reporter github` | | Also print GitHub Actions annotations, so each finding shows on its line in the pull request. Not with `--json` |
| `--quiet` | `-q` | No line about the hosted preview after a failure |
| `--skip` | | Comma-separated checks to skip: `spam,links,accessibility,images,compatibility,inboxPreview,size,templateVariables,overflow,visual,darkContrast,mobileContrast,design,vml,styleSurvival,targeting` |
| `--targeting-policy` | | `progressive` (default), `strict`, or `lenient` |

A `.emailensrc` in the project, the file the VS Code extension reads, can set
rule severities and skips; `--skip` on the command line wins.

Maizzle HTML needs `@maizzle/framework@5` installed beside the CLI. A `.vue`
file needs `@maizzle/framework@6`. One install is one major.

### Other commands

```bash
emailens analyze email.html                    # score per client, findings by client
emailens analyze email.html --clients gmail-web,outlook-windows --json
emailens audit email.html                      # compatibility plus every other check
emailens preview email.html --dark-mode        # transforms, analysis, dark mode simulation
emailens preview email.html --screenshots --out ./shots  # needs BROWSERLESS_URL and playwright-core
emailens export email.html -o ./report         # self-contained HTML report (--json for JSON)
emailens fix email.html -o fixed.html          # AI fix, needs ANTHROPIC_API_KEY (--estimate: tokens only)
emailens clients                               # the 21 clients
cat email.html | emailens analyze -            # stdin
```

### `emailens inbox wait`

The CI step for what your app actually sends. Make your app send a real email
(sign-up, reset, receipt) to your Emailens test inbox, then wait for it. It
fails when the email is no longer the one you checked in Emailens, or changed
since it last arrived: a link moved to staging, an emptied variable, a new
line, an image gone, a size jump, signing that stopped passing. Codes, tokens
and tracking ids differ on every send and do not count. It needs an API key.

```bash
export EMAILENS_API_KEY=...            # app.emailens.dev/dashboard/api
SINCE=$(date +%s000)                   # before the send
npm run send-signup-email              # your app sends it
emailens inbox wait --subject "Welcome" --since "$SINCE"
```

Options: `--subject`, `--sender`, `--inbox <id>`, `--since` (ISO time, epoch
ms, or a duration such as `5m`; default 2 minutes back), `--timeout` (seconds,
default 60, at most 600), `--fail-on all|check|drift|none` (default `all`),
`--json`. Exit codes: `0` pass, `1` changed, `2` nothing arrived or Emailens
could not be reached.

### In your tests

The same check as `lint`, as an assertion. It throws with every failing
finding and its line, reads your `.emailensrc`, and works in Vitest, Jest and
bun:test.

```ts
import { render } from "@react-email/render";
import { expectEmailToPass } from "@emailens/cli/test";

test("welcome email passes", async () => {
  expectEmailToPass(await render(<Welcome name="Ada" />));
});
```

Options: `failOnWarning`, `skip` (the `--skip` names), `framework`.

### In GitHub Actions

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx -y @emailens/cli lint 'emails/*.html' --fail-on-warning --reporter github
```

`--reporter github` puts each finding on its line in the pull request's
changed files.

`**` globs are not supported: use a single-level wildcard or list the files.
For scores per client in a pull request comment, use the
[Action](https://github.com/emailens/action).

### Hosted

[app.emailens.dev/try](https://app.emailens.dev/try?utm_source=cli&utm_medium=readme)
renders the email per client: five clients with no account, all 21 with a free
one. The + Real plans add real-device screenshots: Outlook on Windows and Mac,
Apple Mail on Mac and iPad, and Gmail, Yahoo and Proton on the web.

## Ecosystem

| Project | What it is |
|---|---|
| [@emailens/engine](https://github.com/emailens/engine) | The analysis engine this CLI runs, as a library |
| [@emailens/mcp](https://github.com/emailens/mcp) | The same checks for coding agents: `claude mcp add emailens -- npx -y @emailens/mcp` |
| [emailens/action](https://github.com/emailens/action) | GitHub Action: fails the build, and can comment the scores per client on the pull request |
| [emailens/vscode](https://github.com/emailens/vscode) | VS Code extension: findings and preview in the editor |

## License

MIT
