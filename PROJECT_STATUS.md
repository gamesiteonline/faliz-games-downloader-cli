# Faliz Games Downloader — Project Status

**Repository:** `gamesiteonline/faliz-games-downloader-cli`
**Current version:** `0.5.6`
**Last updated:** 2026-11-26

## v0.5.1 unified implementation

- Compared the two supplied ZIP implementations and retained the current catalog/download safety layer while merging the alternate implementation's stronger queue and terminal-testing ideas.
- `DownloadQueue` now supports per-item progress, pause/resume/cancel/retry, concurrency changes, duplicate protection, clear-finished, and global controls.
- Downloader controls are reusable through an explicit cancellation type and pause/resume control object; partial files remain resumable and files are never auto-executed.
- Added a dependency-free terminal capability/lifecycle layer for NO_COLOR, dumb terminals, Termux, SSH, tmux, resize, alternate-screen, cursor, background, and signal cleanup.
- Added regression coverage for key parsing, terminal capability detection, queue progress, and cancellation semantics.

## v0.5.2 navigation fix

- Termux arrow sequences are now buffered across separate stdin events, fixing dashboards where navigation appeared to work only through Enter or letter commands.
- Application-cursor and modified arrow sequences are recognized as navigation rather than discarded fragments.

## v0.5.3 Grok comparison merge

- Compared the supplied v0.5.3 archive against the current v0.5.2 tree.
- Merged its two substantive improvements: restored TUI colors and environment-based Termux detection.
- Kept the current buffered navigation parser, secure downloader, queue controls, and terminal lifecycle unchanged.

## v0.5.4 Termux download and ANSI fix

- Termux TUI styling is now plain-safe, preventing visible ANSI fragments such as `[36m` and `[39m`.
- Download actions report unavailable links and exact transfer failures, and always restore stdin/raw mode afterward.

## v0.5.5 narrow detail-card fix

- Responsive detail-card sizing keeps the action footer visible on small Termux screens.
- Status, progress, and saved-file information are prioritized ahead of long descriptions so download activity is not hidden.

## v0.5.6 selectable card actions

- Game cards now expose Download game, Add to favorites, Add to wishlist, and Back to games as visible arrow-selectable actions.
- Enter confirms the highlighted action; users no longer need to remember D/F/W shortcuts to operate a selected game.
- Downloading stays within the dashboard and returns to the same card with status and progress visible.

## Completed in v0.5.0

### Phase 1 — reliability and safety

- Persistent settings, favorites, wishlist, recent history, download history, and local library are available under `~/.faliz-games/`.
- Catalog normalization strips terminal control characters and supports live cache fallback, atomic cache writes, missing-cache 304 recovery, and HTTP 5xx/network fallback.
- Filename handling rejects traversal-style names, strips dangerous characters, handles malformed URI encoding, and protects Windows reserved names.
- Downloads support range resume, safe 416 completion checks, checksum verification before promotion, corrupt-partial deletion, disk preflight, retry classification, request timeout, and body-stall timeout.
- Cancellation wakes paused transfers and external abort signals are preserved through retry attempts.
- Configured download directories are used by status, confirmation, dashboard, and transfer paths.

### Phase 2 — terminal dashboard

- `src/tui.js` provides an alternate-screen, full-screen dashboard for TTY sessions.
- Tabs include Home, Browse, Search, Library, Downloads, and Settings.
- The dashboard supports responsive rendering, live search, Top Rated browsing, featured discovery, library sub-tabs, favorites, wishlist, downloads, resize redraw, and clean cursor/terminal restoration.
- Keyboard controls include `1–6`, arrows, Tab, `/`, `D`, `F`, `W`, `Q`, and Ctrl+C.
- Non-TTY help, version, and command usage remain script-friendly.

### Phase 3 — scriptable commands

- `search`, `info`, `download`, `list --downloaded`, `refresh`, `settings get/set`, and `doctor` are available.
- Read commands support `--json` output.
- Downloads require explicit `--yes` confirmation in non-interactive mode.
- `doctor` reports Node compatibility, TTY state, cache presence, and the effective download directory.

## Verification

The current local verification is passing:

```text
12 tests passed
0 failed
npm run pack:check passed
node --check src/index.js src/tui.js src/downloader.js src/queue.js src/terminal.js passed
```

## Deliberately not done

- GitHub deployment for v0.5.5 is complete at commit `bcc41d9`; v0.5.6 is ready for deployment after verification.
- The dashboard uses a dependency-light ANSI TUI rather than adding Ink/React, which keeps the package smaller and improves Termux compatibility.
- Cover art is represented by metadata and text-first cards; network image fetching is intentionally not part of this release.
- Full-width visual snapshot coverage and a live-download integration test remain useful follow-up coverage before a formal public release.

## Release checklist

- [x] Run unit tests.
- [x] Run syntax checks.
- [x] Run npm pack validation.
- [x] Update README and changelog.
- [ ] Add width snapshot tests and live mocked transfer tests.
- [x] Review the final diff and commit v0.5.1.
- [x] Push v0.5.2 to GitHub with authorization.
- [x] Push v0.5.3 to GitHub.
- [x] Push v0.5.4 to GitHub.
- [x] Push v0.5.5 to GitHub.
- [ ] Push v0.5.6 to GitHub.
- [ ] Push v0.5.3 to GitHub.
- [ ] Publish to npm only with explicit authorization.
