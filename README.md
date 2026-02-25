# @emailens/cli

CLI tool for email compatibility analysis — preview how HTML emails render across 12 email clients (Gmail, Outlook, Apple Mail, Yahoo, Samsung, Thunderbird, HEY, Superhuman).

## Install

```bash
npm install -g @emailens/cli
```

Or use with npx:

```bash
npx @emailens/cli analyze email.html
```

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
emailens export email.html --dark-mode --screenshots -o ./report
```

### `emailens clients`

List all 12 supported email clients.

```bash
emailens clients
emailens clients --json
```

## Options

All file-processing commands share:

| Flag | Alias | Description |
|------|-------|-------------|
| `--format` | `-f` | Input format: `html`, `jsx`, `mjml`, `maizzle` |
| `--clients` | `-c` | Comma-separated client IDs to filter |
| `--json` | | Output JSON instead of terminal table |
| `--quiet` | `-q` | Suppress spinners and decorations |

Preview and export add:

| Flag | Alias | Description |
|------|-------|-------------|
| `--dark-mode` | `-d` | Include dark mode simulation |
| `--screenshots` | | Capture screenshots (requires `BROWSERLESS_URL`) |
| `--out` | `-o` | Output directory |

## Framework Support

The CLI can compile React Email (JSX/TSX), MJML, and Maizzle templates to HTML before analysis. Format is auto-detected from file extension, or specify with `--format`.

```bash
emailens analyze newsletter.tsx              # Auto-detected as JSX
emailens analyze template.mjml               # Auto-detected as MJML
emailens preview email.html --format maizzle # Explicit format
```

Framework compilers are optional peer dependencies — install only what you need:

```bash
npm install sucrase react @react-email/components @react-email/render  # For JSX
npm install mjml                                                        # For MJML
npm install @maizzle/framework                                          # For Maizzle
```

## Screenshots

Screenshots require a [Browserless](https://www.browserless.io/) instance and `playwright-core`:

```bash
npm install playwright-core
export BROWSERLESS_URL=ws://localhost:3000
emailens preview email.html --screenshots --out ./screenshots
```

## Piping

Read from stdin with `-`:

```bash
cat email.html | emailens analyze -
echo '<html><body>Hello</body></html>' | emailens preview - --json
```

## License

MIT
