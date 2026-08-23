# Changelog

## 0.4.3 — 2026-08-23

### Added

- **`.emailensrc`, the project file the VS Code extension already reads.** At the repo root, or as an `emailens` key in `package.json`. `lint` now reads `skip` and `rules` from it, so the editor and CI stop disagreeing — a rule demoted in the Problems panel that still fails the build is the worst of both, because one says it does not matter and the other says it does.

- **`rules`: severity per rule.** Keyed by the code `lint` prints — a CSS property (`border-radius`) or a rule id (`insecure-link`) — and set to `error`, `warning`, `info` or `off`. Promoting one to `error` makes it exit 1, which is the point of the feature. Without it the only control was `--skip`, so a team that cared about one Outlook property had to keep the entire compatibility check at warning level, and a team that could not fix every `info` today had to switch accessibility off rather than demote a rule.

  A severity that is not one of the four is named on stderr and ignored rather than dropped in silence: a rule someone believes is off but is not is worse than no setting at all. Those warnings go to stderr, so `lint --json | jq` stays parseable. A malformed file is linted without rather than being fatal.

  A command-line flag wins over the file, because it is an explicit choice for one invocation. In the editor it is the other way round: the repo's file wins over personal settings, because those are ambient.

  `clients` in the file is read by the extension and not yet by `lint`, which has no client filter. Tracked separately.

  A patch, not a minor: nothing an existing invocation does changes. `lint` reads a file it did not read before, and only where one exists — and where one does, it was written to say exactly this. A command-line flag still wins, so no pipeline's behaviour moves without someone adding a file that asks it to.

## 0.4.2 — 2026-08-23

### Changed

- **A position now points at the declaration, not the whole `style="…"` attribute.** `border-radius (2:8)` becomes `border-radius (2:15)` — the column of `border-radius:8px` inside the attribute rather than the column of `style=`. Same for `loc` and `locs` in `--json`. Comes from `@emailens/engine` 0.10.3, and the dependency is pinned there because these positions are what the suite asserts.

  Worth knowing if you were already on 0.4.1: its range was `^0.10.2`, so anyone installing it after the engine's release already got this. This release is the version that tests against it.

## 0.4.1 — 2026-08-23

### Added

- **`file:line:col` on every issue that has one.** `lint` prints the position ahead of the rule, so an editor's terminal link or an `awk` pipeline can jump straight to the character that caused it, and `--json` carries `loc`, `locs` and `locsTruncated` for a tool to read. Where one property breaks in several places the first is shown with `+N more` — `+N+ more` when the engine capped the list. The column is only reserved when the file has positions to put in it, so nothing shifts for output that has none.

- **Positions are asked for only when they would mean something.** JSX, MJML and Maizzle are compiled before analysis, so a line number would point into generated output rather than the file you wrote. For those formats no positions are requested and none are printed. A position that looks authoritative and is wrong is worse than no position.

### Changed

- **Requires `@emailens/engine` 0.10.2**, which is where the positions come from — and which also made partial-support warnings value-aware for eight more properties. Expect **fewer `info` lines**: `font-size: 14px`, `display: block`, `background: #ffffff` and `text-align: center` no longer report, because no client renders them differently. Errors and warnings are unchanged, and so is every exit code: `info` has never affected them.

- **The per-line client roster shrinks with it.** A line that read `display … +51` now reads `display … +15`, naming the clients the value actually breaks in.

### Notes

Releases before 0.4.1 predate this file; see the commit history.
