# Faliz Games Launcher Promo
## Script and Storyboard — v0.3.0

**Format:** Vertical social video, 9:16  
**Duration:** 5 seconds  
**Audience:** Gamers, terminal users, developers, and Termux users  
**Tone:** Fast, premium, neon terminal energy  
**Primary CTA:** Install and launch Faliz Games  
**Visual language:** Near-black terminal UI, cyan and violet neon, crisp green status indicators, fast but readable motion  
**Reference assets:** `assets/marketing/faliz-games-promo-poster.png`, `assets/marketing/faliz-games-logo.png`, and `assets/marketing/faliz-games-readme-banner.gif`

## Core message

Faliz Games turns game discovery and authorized downloads into a fast, professional terminal workflow. Users can browse the Top 100, search the live catalog, queue downloads, monitor progress, pause or resume with `P`, and cancel safely with `C`.

## Voiceover script

> **“Faliz Games. Search it. Download it. Resume anytime.”**

**Delivery:** Confident, energetic, clean studio voice. Speak quickly but clearly. The full line should land before the final brand lockup.

## Shot storyboard

| Time | Visual action | On-screen text | Voiceover | Sound and motion |
|---|---|---|---|---|
| 0.00–0.75 s | Black screen flickers into a cyan terminal cursor. The Faliz Games logo assembles from scanlines and settles in the center. | `FALIZ GAMES` | “Faliz Games.” | Short boot-up chirp, subtle digital riser, cyan glow pulse. |
| 0.75–1.85 s | Camera pushes into the launcher dashboard. Top 100 game rows appear, followed by a search field and live catalog indicator. | `TOP 100  ·  LIVE CATALOG  ·  SEARCH` | “Search it.” | Two quick interface ticks; rows slide upward with restrained easing. |
| 1.85–3.05 s | A download card activates. Progress bar moves from 42% to 68%; speed and ETA values update. A second game enters the queue. | `DOWNLOAD QUEUE`  
`12.4 MB/s  ·  ETA 00:18` | “Download it.” | Progress sweep, soft data-transfer texture, low electronic pulse. |
| 3.05–4.10 s | A large `P` appears and the progress bar freezes with a PAUSED badge. The badge changes to RESUMED and the bar continues. | `P  PAUSE / RESUME` | “Resume anytime.” | Brief freeze click, then a bright resume chime and forward whoosh. |
| 4.10–5.00 s | Final brand lockup fills the frame. The install command types in beneath it while a green check confirms readiness. | `FALIZ GAMES`  
`npm install -g faliz-games-downloader-cli`  
`PLAY MORE. WAIT LESS.` | No additional dialogue. | Clean impact sting, small keyboard clicks, music resolves on the logo. |

## Final-frame layout

- Place the Faliz Games logo in the upper-middle safe area.
- Keep the install command in a high-contrast rounded terminal panel.
- Use cyan for the main brand and progress indicators.
- Use violet for secondary accents and queue highlights.
- Use green only for successful status and readiness confirmation.
- Keep all essential text inside the center 80% width and away from platform UI overlays.

## Exact text package

```text
FALIZ GAMES
TOP 100  ·  LIVE CATALOG  ·  SEARCH
DOWNLOAD QUEUE
12.4 MB/s  ·  ETA 00:18
P  PAUSE / RESUME
FALIZ GAMES
npm install -g faliz-games-downloader-cli
PLAY MORE. WAIT LESS.
```

## Optional caption

**Faliz Games v0.3.0 is live.** Search the catalog, browse the Top 100, queue multiple downloads, watch speed and ETA, then pause, resume, or cancel safely from your terminal.

Install:

```bash
npm install --global git+https://github.com/gamesiteonline/faliz-games-downloader-cli.git
faliz-games
```

## Production notes

- Use the existing poster as the visual style reference for the laptop dashboard, mobile terminal, lighting, and neon palette.
- Do not show copyrighted game covers or real game logos. Use abstract fictional catalog rows.
- Keep interface transitions fast, but hold each required label long enough to read on a phone.
- Use the actual `P` pause/resume and `C` cancel concepts from the launcher rather than generic download imagery.
- If the video is generated with the free-plan video setting, use one 5-second MiniMax H3 clip at 768p, presented to users as 720p.
- Export as MP4, H.264, 9:16 portrait, with audio enabled when supported.
