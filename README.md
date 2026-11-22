# Faliz Games Downloader CLI

Faliz Games is a polished terminal application for browsing a live game catalog, finding titles quickly, viewing the 100 highest-rated entries, and downloading authorized files directly to a local folder. It is distributed as an npm package and is designed to feel fast, readable, and dependable in everyday terminal use.

> **Important:** Faliz Games is a catalog and file-transfer tool. Download, install, and use only content that you are legally authorized to access.

## Features

| Capability | What it does |
|---|---|
| Live synchronization | Retrieves the latest catalog when the application starts and supports an explicit refresh action. |
| Top 100 view | Sorts recognized ratings and presents the 100 highest-rated games first. |
| Search | Searches titles, platforms, genres, and file extensions. |
| Professional TUI | Uses a branded ASCII logo, color hierarchy, spinners, paginated selectors, details panels, and progress bars. |
| Resumable downloads | Streams files to disk without loading the complete file into memory and attempts to continue an existing partial file when the server supports byte ranges. |
| Multi-download queue | Select several games with the keyboard and process them sequentially with resumable progress. |
| Adaptive terminal layout | Wraps long metadata to the current terminal width and keeps lists readable on desktop terminals and mobile terminals such as Termux. |
| Download telemetry | Shows live bytes, transfer speed, ETA, and partial-file status while downloading. |
| Catalog filters | Filter by platform or extension and sort by rating, title, or size. |
| Offline cache | Keeps the last successful catalog locally and falls back to it if the network is unavailable. |
| Configurable endpoint | Supports `FALIZ_CATALOG_URL` for private deployments, mirrors, testing, or future catalog versions. |

## Requirements

Faliz Games requires Node.js 18 or newer because it uses the modern Fetch API and Web Streams available in supported Node.js releases.[^1] An interactive terminal is recommended for the full experience.

## Installation

After the package is published to the npm registry, install it globally with:

```bash
npm install --global faliz-games-downloader-cli
```

Then launch the application:

```bash
faliz-games
```

You can also run it without a global installation:

```bash
npx faliz-games-downloader-cli
```

The package exposes the `faliz-games` executable through the npm `bin` field.[^2]

### Install directly from GitHub

If the package has not been published to npm yet, install the repository directly over HTTPS:

```bash
npm install --global git+https://github.com/gamesiteonline/faliz-games-downloader-cli.git
```

Use the HTTPS form rather than `github:gamesiteonline/faliz-games-downloader-cli`. The `github:` shorthand can make npm invoke Git over SSH, which fails on machines that do not have a GitHub SSH key configured. If the repository is private, authenticate GitHub access first or use the npm package after publication.

## Quick start

When Faliz Games opens, it synchronizes the catalog and presents five actions:

1. **Top 100 best-rated games** opens a paginated ranked list.
2. **Search the catalog** accepts title, platform, genre, or extension terms.
3. **Refresh live catalog** checks the remote endpoint immediately instead of waiting for the next launch.
4. **About Faliz Games** displays the installed version and usage note.
5. **Exit** closes the application.

Select one or several titles to view metadata and queue downloads. Files are saved to `~/Downloads/faliz-games` when available. On Termux, run `termux-setup-storage` once and Faliz Games uses the shared device Downloads folder at `~/storage/downloads/faliz-games`. Set `FALIZ_DOWNLOAD_DIR` to choose another location. Transfers display live bytes, speed, and ETA when the server provides a content length, with an animated byte-count spinner as a fallback.

Use **Space** to select multiple entries. Faliz Games processes the queue sequentially, preserves `.part` files when interrupted with `Ctrl+C`, and resumes them on the next attempt when the server supports byte ranges.

On Termux, grant shared storage access with:

```bash
termux-setup-storage
```

## Command reference

```text
faliz-games              Open the interactive catalog
faliz-games --help       Show command help
faliz-games --version    Show the installed version
```

## Live updates and caching

The application does not bundle the catalog into the npm package. It requests the configured JSON endpoint at startup, stores a compact local copy under `~/.faliz-games/`, and uses HTTP validators such as ETag or Last-Modified when available. This keeps startup synchronization efficient while allowing catalog changes to become available to users without reinstalling the CLI.

If the endpoint is temporarily unreachable, Faliz Games uses the last successful local copy and labels the session as **Offline cache**. If no cache exists yet, the application reports the network error and exits instead of presenting incomplete data.

To point the CLI at another catalog endpoint:

```bash
FALIZ_CATALOG_URL="https://example.com/catalog.json" faliz-games
```

The endpoint should return either a JSON array or an object containing a `games` array. The normalizer accepts the following common field aliases:

| Canonical field | Accepted aliases |
|---|---|
| `id` | `GameID`, `game_id`, `id` |
| `name` | `FileName`, `name`, `title` |
| `rating` | `Rating`, `rating` |
| `downloadUrl` | `DownloadLink`, `download_link`, `downloadUrl` |
| `platform` | `Platform`, `platform` |
| `genre` | `Genre`, `genre` |
| `size` | `Size`, `size` |
| `extension` | `Extension`, `extension` |
| `description` | `Description`, `description` |
| `compatibility` | `Compatibility`, `compatibility` |

## Download behavior

Downloads are streamed through Node.js to avoid buffering the complete file in memory. The program validates that the URL uses HTTP or HTTPS, creates the destination directory when necessary, sanitizes the output filename, and writes a partial file before finalizing it. If a partial file is present and the remote server returns `206 Partial Content`, the transfer resumes from the existing byte count. Server behavior varies, so resume support is best-effort rather than guaranteed.

The CLI intentionally asks for confirmation before each download. This prevents accidental large transfers and gives the user a chance to verify the title, platform, rating, size, and compatibility information first.

## Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/gamesiteonline/faliz-games-downloader-cli.git
cd faliz-games-downloader-cli
npm install
```

Useful scripts:

```bash
npm start       # Run the CLI
npm test        # Run automated tests
npm run dev     # Restart on source changes
npm run pack:check  # Verify npm package contents without publishing
```

For a local catalog or fixture server, set `FALIZ_CATALOG_URL` before starting the program. The automated tests use an isolated endpoint stub and do not require the live catalog.

## Release checklist

Before publishing a new version, update the version in `package.json`, run `npm test`, run `npm run pack:check`, inspect the generated package contents, and then publish from a clean working tree:

```bash
npm version patch
npm publish
```

Publishing requires an npm account with permission to publish the package name. npm's package and executable conventions are documented in its official package.json reference.[^2]

## License

Faliz Games is released under the MIT License. See [LICENSE](./LICENSE).

## Developer

Faliz Games is developed by **Fahad Mohamed** from Tanzania.

- Threads: <https://www.threads.com/@ard.sing>
- Reddit: <https://www.reddit.com/u/gamesiteonline>
- Instagram: <https://www.instagram.com/ard.sing>
- WhatsApp channel: <https://whatsapp.com/channel/0029VbChyDUI1rcht5jajL3q>
- YouTube: <https://youtube.com/@gamesiteonline>
- Google Play Games: <https://my.play/gamesiteonline>

## References

[^1]: [Node.js — Using the Fetch API](https://nodejs.org/en/learn/getting-started/fetch)
[^2]: [npm Docs — Creating a package.json file](https://docs.npmjs.com/creating-a-package-json-file)
