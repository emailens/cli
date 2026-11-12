<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/wordmark-dark.svg">
  <img src="./docs/wordmark-light.svg" alt="emailens / cli" width="444">
</picture>

**The email rendering linter for terminal and CI**

[![CI](https://github.com/emailens/cli/actions/workflows/ci.yml/badge.svg)](https://github.com/emailens/cli/actions/workflows/ci.yml)
[![npm](https://badgen.net/npm/v/@emailens/cli)](https://www.npmjs.com/package/@emailens/cli)
[![MCP](https://badgen.net/badge/MCP/Server/blue)](https://github.com/emailens/mcp)

</div>

```text
$ emailens lint emails/welcome.html --fail-on-warning
emails/welcome.html
  warn   7:10  outlook-windows-legacy  display:flex            Outlook Classic receives this flex box. The MSO branch needs a table.
  warn   7:25  outlook-windows-legacy,yahoo-mail,yahoo-mail-android+2  gap                     Outlook Classic does not support "gap".
  warn   8:32  gmail-web,outlook-windows-legacy,yahoo-mail-android+2  box-shadow              Gmail does not support "box-shadow".
  warn   14:5  yahoo-mail          font-family             Yahoo Mail drops an inline font-family that names a quoted font, like 'Courier New': that text shows in Yahoo's own font instead.
  warn         inboxPreview        preheader-too-short     Preheader is only 21 characters, so email clients may backfill with body text (recommended: 30+).
  12 info: safe fallbacks, not problems. --info lists them.

1 file | 5 warnings

Failed: 5 warnings found (--failOnWarning)
See it rendered in Gmail, Outlook and Apple Mail, no signup: https://app.emailens.dev/try?utm_source=cli&utm_medium=lint
```

That is a welcome email with a flex row and a card shadow, checked against 21
email clients. Each finding has its line:column, and the exit code (here 2)
fails the build. The card's rounded corners are among the 12 info findings:
Outlook Classic draws them square, a safe fallback rather than a problem. The
last line appears only when the check fails; `--quiet` drops it, and `--json`
never has it.

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

### In a React Email project

```bash
npx @emailens/cli react-email
```

Finds the emails folder `email dev` uses (`emails/`, `src/emails/`), renders
every template with your project's own React Email, `PreviewProps` included,
and checks the HTML. Local imports, any npm package and tsconfig paths work,
subfolders are included, and `_components`-style folders and files without a
default export are skipped. No export step. `--watch` re-checks on save.

Pass `--email-type transactional` (or set `"emailType": "transactional"` in
`.emailensrc`) when the folder holds sign-in, receipt and alert emails, which
need no unsubscribe link. `emailens lint emails/` does the same as the command
above on a folder you name.

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
| `--email-type` | | `transactional` drops the unsubscribe requirement; `marketing` keeps it. Default: `emailType` in `.emailensrc` |
| `--gate` | | Also send each email to the hosted pre-send gate, which fails on a regression against the last version of that file that passed. Pro plan, needs `EMAILENS_API_KEY` |

A `.emailensrc` in the project, the file the VS Code extension reads, can set
rule severities and skips; `--skip` on the command line wins.

Maizzle HTML needs `@maizzle/framework@5` installed beside the CLI. A `.vue`
file needs `@maizzle/framework@6`. One install is one major.

### `emailens design`: does it still look like your design?

`lint` reads the code. `design` reads the render: it draws the email as each
client's live preview shows it and as you designed it, then compares the two
layouts element by element. Every element is compared on its position, size,
colours, corners, fonts and spacing. It gives the verdict the Emailens email
page shows: **Ready**, **Needs work** or **Broken**, with the reasons.

```text
$ emailens design emails/welcome.html --clients outlook-windows-legacy,gmail-web
✗ Outlook Classic            Broken
    Outlook Classic breaks your design.
    - Columns that sit side by side in your design stack on top of each other.
    - The email is drawn at a very different width from your design (54% of it).
    - “Track your parcel” is moved (centre at 25% → 50% across the email) and 1107px wide instead of 300px.
    - “Manage your order” is moved (centre at 75% → 50% across the email) and 1107px wide instead of 300px.
    - Layout differs in 4 places. For example, “Hello, your order has shipped.” has width 600px instead of 552px.
    and 1 more
✓ Gmail                      Ready
```

That email puts two buttons side by side with `display:flex`. Classic Outlook
has no flexbox, so the buttons stack at full width. Gmail sets its own line
height and text colour, but the screenshots of the two pages differ by under
2.5% of their pixels, so the design reads as kept.

Layout needs a browser, so this command needs one too. `sharp` adds the pixel
comparison:

```bash
npm install -g @emailens/cli playwright-core sharp
npx playwright-core install chromium   # a local Chromium, or:
export BROWSERLESS_URL=wss://...        # your Browserless instance
emailens design email.html
```

Or without installing: `npx -p @emailens/cli -p playwright-core -p sharp emailens design email.html`.

| Flag | Alias | Description |
|------|-------|-------------|
| `--clients` | `-c` | Comma-separated client IDs. Default: all 21 |
| `--format` | `-f` | Input format: `html`, `jsx`, `mjml`, `maizzle` |
| `--strict` | | Fail on Needs work too, not only on Broken |
| `--json` | | Output as JSON |
| `--quiet` | `-q` | No spinner |

Exit codes: `0` when no client breaks the design, `1` when one does (or, with
`--strict`, when one changes it).

**What it covers and what it doesn't:**
- It runs in light mode, against our live preview of each client. It doesn't
  screenshot real inboxes: real-device screenshots are on the hosted plans.
- With `sharp` installed, it also screenshots both pages and compares them
  pixel by pixel, as the hosted check on saved emails does. That agrees more
  often with a human reviewer. Without `sharp`, it compares page structure
  only, as the email page in your browser does, and the JSON has no `diff`.
- On Browserless, the session has to stay open for the whole run. A short
  session timeout closes the browser midway: raise its `TIMEOUT`, or pass
  fewer `--clients`.
- Scripts are off in both pages. The email's own images and fonts load from
  their addresses.
- Both pages draw with the same font stand-ins (Arimo for Arial and
  Helvetica, and faces for Segoe, Aptos and the Apple and Android system
  fonts), so the verdict is the same on a Mac, on Windows and on a bare Linux
  runner. They are downloaded once from app.emailens.dev into
  `~/.cache/emailens/fonts`. If that fails, the command says so on stderr:
  text then draws in this machine's fonts and can read as a change.

### Other commands

```bash
emailens analyze email.html                    # score per client, findings by client
emailens analyze email.html --clients gmail-web,outlook-windows --json
emailens audit email.html                      # compatibility plus every other check
emailens preview email.html --dark-mode        # transforms, analysis, dark mode simulation
emailens preview email.html --screenshots --out ./shots  # needs BROWSERLESS_URL and playwright-core
emailens design email.html --clients gmail-web # still looks like the design? needs playwright-core (+ sharp)
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

To fail the build when a client breaks the design, add `design`. It needs a
Chromium on the runner:

```yaml
- run: npm install -g @emailens/cli playwright-core sharp
- run: npx playwright-core install --with-deps chromium
- run: emailens design emails/welcome.html --clients outlook-windows-legacy,gmail-web,apple-mail-macos
```

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
