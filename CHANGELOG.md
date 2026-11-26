# Changelog

## 0.5.6 — 2026-11-26

### Changed

- Replaced detail-card shortcut-only instructions with a visible selectable action menu.
- Game cards now support arrow selection and Enter confirmation for Download game, Add to favorites, Add to wishlist, and Back to games.
- Downloads remain inside the dashboard flow instead of requiring hidden letter commands or terminating the terminal session.

### Release status

Verified locally. GitHub deployment and npm publication are pending.

## 0.5.5 — 2026-11-26

### Fixed

- Made detail-card height responsive so actions remain visible on narrow Termux screens.
- Prioritized status, progress bar, and saved path before long metadata and descriptions.
- Kept download actions in a stable footer instead of allowing them to be clipped inside the game card.

### Release status

Verified locally. GitHub deployment and npm publication are pending.

## 0.5.4 — 2026-11-26

### Fixed

- Disabled fragile color escape output in Termux so `[36m`, `[39m`, and similar sequences cannot appear as visible text.
- Added clear dashboard feedback for missing download links, active downloads, download warnings, saved files, and exact failures.
- Guaranteed stdin/raw-mode restoration after a download attempt, including errors.

### Release status

Verified locally. GitHub deployment and npm publication are pending.

## 0.5.3 — 2026-11-26

### Fixed

- Restored intentional terminal colors in the full-screen TUI; the previous leftover wrapper stripped all styling.
- Detect Termux from the environment for emoji star rendering instead of hard-coding Termux mode on every terminal.
- Retained the v0.5.2 buffered arrow-key parser so split Termux escape sequences remain navigable.

### Release status

Verified locally. GitHub deployment and npm publication are pending.

## 0.5.2 — 2026-11-26

### Fixed

- Buffered fragmented ANSI escape sequences from Termux so arrow-key navigation works reliably when Escape, `[`, and the direction byte arrive in separate input events.
- Recognized application-cursor and modified arrow sequences without interpreting them as separate commands.

### Release status

Verified locally. GitHub deployment is pending this release commit; npm publication is pending.

## 0.5.1 — 2026-11-26

This patch unifies the supplied alternate implementation ideas with the existing secure Faliz Games base.

### Added

- Per-item download queue progress with pause, resume, cancel, retry, duplicate protection, concurrency updates, and clear-finished controls.
- Reusable downloader control objects and an explicit `DownloadCanceled` error for reliable queue state transitions.
- Dependency-free terminal capability detection and lifecycle cleanup for plain terminals, NO_COLOR, Termux, SSH, tmux, alternate screens, cursor state, and pink-background restoration.
- Regression tests for terminal key parsing, terminal capabilities, queue progress, and cancellation.

### Fixed

- Termux-style application-cursor arrow sequences are now recognized.
- Dashboard cleanup removes the exact input and signal handlers, preventing stale listeners after exit.
- A downloader that resolves after cancellation cannot incorrectly report a completed queue item.

### Release status

The version was verified locally and pushed to the public GitHub repository in commit `d3182ea`. It has not been published to npm.

## 0.5.0 — 2026-11-24

This release completes the Phase 1–3 local implementation pass.

### Added

- Alternate-screen full-screen terminal dashboard for interactive TTY sessions.
- Home, Browse, Search, Library, Downloads, and Settings tabs.
- Favorites, wishlist, downloaded library, recent items, and live search controls.
- Scriptable `search`, `info`, `download`, `list`, `refresh`, `settings`, and `doctor` commands.
- `--json` output for read-oriented commands.
- Safe non-interactive download confirmation with `--yes`.
- Atomic catalog cache writes, offline fallback, and missing-cache 304 recovery.
- Body-stall timeout and unified abort handling for streamed downloads.

### Fixed

- Pausing and canceling a download no longer leaves a paused promise waiting forever.
- A 416 response cannot promote an unknown or checksum-invalid partial file.
- Corrupt checksum partials are deleted before an error is reported.
- Resume disk checks count only the bytes still needed.
- Retry classification no longer retries arbitrary programming errors.
- Catalog and filename strings are stripped of terminal control characters.
- Recent, Favorites, and Library views use their correct persistence collections.
- Configured download directories are honored by status checks and UI confirmations.
- Dashboard labels no longer claim unsupported community or time-period metrics.

### Release status

The version is prepared and verified locally. It has not been published to npm or pushed as a release without explicit approval.
