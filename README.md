<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/wordmark-dark.svg">
  <img src="./docs/wordmark-light.svg" alt="emailens / cli" width="444">
</picture>

**The email rendering linter for terminal and CI**

[![CI](https://github.com/emailens/cli/actions/workflows/ci.yml/badge.svg)](https://github.com/emailens/cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@emailens/cli)](https://www.npmjs.com/package/@emailens/cli)
[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://github.com/emailens/mcp)
[![GitHub stars](https://img.shields.io/github/stars/emailens/cli?style=flat)](https://github.com/emailens/cli/stargazers)

</div>

Your email looks perfect in Apple Mail. Gmail strips half the CSS. Outlook renders it in Word.

`@emailens/cli` checks HTML, React Email, MJML, and Maizzle against real client behavior across 21 email clients. It flags compatibility issues before they ship, in your terminal, in CI, or in your AI workflow.

The quickest way to try it:

```bash
npx @emailens/cli lint email.html
```

If you want a hosted preview, screenshots, and team workflows, see [emailens.dev](https://emailens.dev).

## Why Emailens

Email clients are the hardest frontend target in existence. Every client has different CSS support, different rendering engines, and different failure modes.

Emailens gives you:

- per-client compatibility scoring across 21 clients
- file:line reporting for HTML inputs
- CI-safe exit codes for build pipelines
- support for React Email, MJML, Maizzle, and raw HTML
- local/offline usage with no account required

## The ecosystem

| Project | Purpose | Start here |
|---|---|---|
| [@emailens/engine](https://github.com/emailens/engine) | Core analysis engine and library API | If you want to build on top of it |
| [@emailens/cli](https://github.com/emailens/cli) | Terminal linting and CI checks | Best first stop |
| [@emailens/mcp](https://github.com/emailens/mcp) | Claude/Cursor/AI agent integration | If you want AI-assisted email QA |
| [emailens/action](https://github.com/emailens/action) | GitHub Action quality gate | If you want PR blocking |
| [emailens/vscode](https://github.com/emailens/vscode) | VS Code linting and preview | If you want editor feedback |
| [emailens.dev](https://emailens.dev) | Hosted previews, screenshots, team workflows | If you want team-grade QA and shareable reports |

## Install

```bash
npm install -g @emailens/cli
```

Or use it without installing:

```bash
npx @emailens/cli lint email.html
```

Maizzle HTML needs `@maizzle/framework@5` installed beside the CLI. A `.vue` file needs `@maizzle/framework@6`. One install is one major.

## Quick start

### Check a single file

```bash
emailens analyze email.html
emailens analyze email.html --clients gmail-web,outlook-windows
emailens analyze email.html --json
```

### Lint in CI

```bash
npx @emailens/cli lint 'emails/**/*.{html,tsx,mjml}' --fail-on-warning
```

### Preview a render

```bash
emailens preview email.html
emailens preview email.html --dark-mode
emailens preview email.html --screenshots --out ./screenshots
```

### Fix common issues

```bash
emailens fix email.html
emailens fix email.html -o fixed.html
```

## What the output looks like

```text
src/emails/welcome.html
  error  12:8  outlook-windows     border-radius     Not supported in Outlook Windows
  warn          spam               caps-ratio        20%+ of words are ALL CAPS

2 files | 1 error | 1 warning
```

This is intentionally readable in a terminal and structured enough for CI, editors, and agents.

## Supported formats

Point it at:

- HTML
- JSX / React Email
- MJML
- Maizzle

Format is detected from the file extension, and the CLI compiles your template before it analyzes the actual HTML that would be sent.

## Commands

### `emailens analyze <file>`

Analyze CSS compatibility and get per-client scores.

```bash
emailens analyze email.html
emailens analyze email.html --clients gmail-web,outlook-windows
emailens analyze email.html --json
cat email.html | emailens analyze -
```

### `emailens preview <file>`

Full preview pipeline: transforms, analysis, dark mode simulation, and optional screenshots.

```bash
emailens preview email.html
emailens preview email.html --dark-mode
emailens preview email.html --screenshots --out ./screenshots
emailens preview email.html --json
```

### `emailens export <file>`

Export a self-contained HTML or JSON report.

```bash
emailens export email.html -o ./report
emailens export email.html --json -o ./report
```

### `emailens lint <file|glob>`

CI-friendly linting with structured exit codes.

```bash
emailens lint email.html
emailens lint src/*.html
emailens lint email.html --json
emailens lint email.html --fail-on-warning
emailens lint email.html --max-warnings 5
```

| Flag | Alias | Description |
|------|-------|-------------|
| `--format` | `-f` | Input format: `html`, `jsx`, `mjml`, `maizzle`. `.vue` is `maizzle`. A pasted Vue file with no flag is detected. |
| `--json` | | Output as JSON |
| `--fail-on-warning` | | Exit 2 if warnings found |
| `--skip` | | Comma-separated checks to skip: `spam,links,accessibility,images,compatibility,inboxPreview,size,templateVariables,overflow,visual,darkContrast,mobileContrast,design,vml,styleSurvival,targeting` |
| `--targeting-policy` | | `progressive` (default), `strict`, or `lenient` |
| `--max-warnings` | | Fail if more than n warnings |

Exit codes:

- `0`: clean
- `1`: errors found
- `2`: warnings only (with `--fail-on-warning` or `--max-warnings` exceeded)

### `emailens clients`

List all 21 supported clients.

```bash
emailens clients
emailens clients --json
```

## GitHub Actions

Add a PR gate to fail builds when email regressions appear:

```yaml
name: Email lint

on:
  pull_request:
    paths:
      - 'emails/**'
      - 'src/emails/**'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Lint emails
        run: npx -y @emailens/cli lint 'emails/**/*.{html,tsx,mjml}' --fail-on-warning
```

## AI and MCP

Prefer AI? Use the [MCP server](https://github.com/emailens/mcp). It gives your coding agent access to the same analysis engine and lets it preview, audit, fix, and diff email templates.

```bash
claude mcp add emailens -- npx -y @emailens/mcp
```

## Why not just use the hosted app?

You can. But the open-source tools are what let developers:

- validate before a push
- fail CI before a broken email ships
- run audits offline
- keep email QA in their editor and terminal
- build local automation without signing up for a platform

The hosted SaaS adds screenshot previews, shared reports, and team workflows. The OSS tools give you the developer-first layer.

## License

MIT

---

If this saved you from an Outlook surprise, [a star](https://github.com/emailens/cli) helps other email developers find it.

