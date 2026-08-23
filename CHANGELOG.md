# Changelog

## 0.4.1 — 2026-08-23

### Added

- **`file:line:col` on every issue that has one.** `lint` prints the position ahead of the rule, so an editor's terminal link or an `awk` pipeline can jump straight to the character that caused it, and `--json` carries `loc`, `locs` and `locsTruncated` for a tool to read. Where one property breaks in several places the first is shown with `+N more` — `+N+ more` when the engine capped the list. The column is only reserved when the file has positions to put in it, so nothing shifts for output that has none.

- **Positions are asked for only when they would mean something.** JSX, MJML and Maizzle are compiled before analysis, so a line number would point into generated output rather than the file you wrote. For those formats no positions are requested and none are printed. A position that looks authoritative and is wrong is worse than no position.

### Changed

- **Requires `@emailens/engine` 0.10.2**, which is where the positions come from — and which also made partial-support warnings value-aware for eight more properties. Expect **fewer `info` lines**: `font-size: 14px`, `display: block`, `background: #ffffff` and `text-align: center` no longer report, because no client renders them differently. Errors and warnings are unchanged, and so is every exit code: `info` has never affected them.

- **The per-line client roster shrinks with it.** A line that read `display … +51` now reads `display … +15`, naming the clients the value actually breaks in.

### Notes

Releases before 0.4.1 predate this file; see the commit history.
