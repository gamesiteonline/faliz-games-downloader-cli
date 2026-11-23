# Changelog

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
