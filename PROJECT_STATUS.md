# Faliz Games Downloader — Project Status

**Repository:** `gamesiteonline/faliz-games-downloader-cli`
**Current version:** `0.5.1`
**Last updated:** 2026-11-26

## v0.5.1 unified implementation

- Compared the two supplied ZIP implementations and retained the current catalog/download safety layer while merging the alternate implementation's stronger queue and terminal-testing ideas.
- `DownloadQueue` now supports per-item progress, pause/resume/cancel/retry, concurrency changes, duplicate protection, clear-finished, and global controls.
- Downloader controls are reusable through an explicit cancellation type and pause/resume control object; partial files remain resumable and files are never auto-executed.
- Added a dependency-free terminal capability/lifecycle layer for NO_COLOR, dumb terminals, Termux, SSH, tmux, resize, alternate-screen, cursor, background, and signal cleanup.
- Added regression coverage for key parsing, terminal capability detection, queue progress, and cancellation semantics.

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

- GitHub deployment for v0.5.1 is complete at commit `d3182ea`; npm publication is still pending authentication and explicit publication.
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
- [x] Push to GitHub with authorization.
- [ ] Publish to npm only with explicit authorization.
