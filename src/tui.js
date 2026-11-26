import chalk from 'chalk';
import { downloadGame, formatBytes, getDefaultDownloadDirectory, getDownloadStatus } from './downloader.js';
import { featuredGames, latestGames, searchGames, sortTopRated, trendingGames } from './catalog.js';
import { loadCollection, loadSettings, recordDownload, toggleCollection, upsertLibrary } from './persistence.js';
import { arrowDirection, consumeKeys, createTerminalGuard } from './terminal.js';

const ESC = '\u001b[';
const termuxMode = Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux'));
// Some Termux shells pass escape bytes through as visible text. Keep the
// dashboard plain-safe there; the pink background and layout remain intact.
const useColors = !termuxMode && chalk.level > 0 && !('NO_COLOR' in process.env);
const style = (fn, value) => useColors ? fn(value) : String(value);
const accent = value => style(chalk.cyan, value);
const purple = value => style(chalk.magenta, value);
const green = value => style(chalk.green, value);
const yellow = value => style(chalk.yellowBright, value);
const muted = value => style(chalk.gray, value);

function width() { return Math.max(50, Number(process.stdout.columns) || 80); }
function height() { return Math.max(16, Number(process.stdout.rows) || 24); }
function clean(value) { return String(value ?? '').replace(/[\u0000-\u001f\u007f\u001b]/g, '').trim(); }
function fit(value, size) { const text = clean(value); return text.length > size ? `${text.slice(0, Math.max(0, size - 1))}…` : text.padEnd(size); }
function box(title, lines, size = width() - 4) { const inner = Math.max(12, size - 4); const expanded = lines.flatMap(line => String(line).split('\n')); const top = `╭─ ${title} ${'─'.repeat(Math.max(0, inner - title.length - 3))}╮`; const body = expanded.slice(0, height() - 8).map(line => `│ ${fit(line, inner)} │`); return [top, ...body, `╰${'─'.repeat(inner + 2)}╯`]; }
function stars(value) { const count = Math.max(0, Math.min(5, Math.round(Number(value || 0) / 2))); if (termuxMode) return '⭐'.repeat(count) + '☆'.repeat(5 - count); return yellow('★'.repeat(count)) + muted('☆'.repeat(5 - count)); }
function tabName(tab) { return ['Home', 'Browse', 'Search', 'Library', 'Downloads', 'Settings'][tab]; }
function formatLabel(game) { return String(game.extension || 'unknown').replace(/^\./, '').toUpperCase(); }
function gameRow(game, index, selected, rank = '') { const marker = selected ? '▶' : ' '; const number = rank || String(index + 1).padStart(2, '0'); if (width() < 78) return `${marker} ${number} ${fit(game.name, Math.max(14, width() - 12))}\n    ${fit(game.platform, 16)} · ${formatLabel(game)} · ${stars(game.rating)} ${game.rating.toFixed(1)}`; return `${selected ? '▶ SELECTED' : '          '} ${number} ${fit(game.name, 28)} ${fit(game.platform, 16)} ${purple(fit(formatLabel(game), 8))} ${stars(game.rating)} ${yellow(game.rating.toFixed(1))}`; }
function progressLine(progress) { if (!progress) return ''; const total = Number(progress.total || 0); const current = Number(progress.downloaded || 0); const ratio = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0; const cells = 18; const filled = Math.round(ratio * cells); const bar = `${'█'.repeat(filled)}${'░'.repeat(cells - filled)}`; const percent = total > 0 ? `${Math.round(ratio * 100)}%` : formatBytes(current); return `Progress: [${bar}] ${percent}  ${formatBytes(current)}${total ? ` / ${formatBytes(total)}` : ''}`; }

export async function runTui({ games, offline = false }, initialSettings = {}) {
  const settings = { ...(await loadSettings()), ...initialSettings };
  const state = { tab: 0, cursor: 0, query: '', libraryTab: 0, message: '', filePath: '', progress: null, downloads: [], busy: false, selected: null, detail: false };
  let alive = true;
  const terminal = createTerminalGuard();
  let keyRemainder = '';
  let cleanup = () => terminal.cleanup();

  function tabGames() {
    if (state.tab === 2) return searchGames(games, state.query);
    if (state.tab === 3) return [];
    if (state.tab === 4) return [];
    return games;
  }
  function visibleGames() {
    if (state.tab === 0) return featuredGames(games, 12);
    if (state.tab === 1) return sortTopRated(games, games.length).slice(0, 100);
    if (state.tab === 2) return tabGames();
    if (state.tab === 3) return state.libraryGames || [];
    return [];
  }
  async function refreshLibrary() {
    const key = ['library', 'favorites', 'wishlist', 'recentlyViewed'][state.libraryTab];
    const collection = await loadCollection(key);
    state.libraryGames = games.filter(game => collection.some(item => String(item?.id ?? item) === game.id));
  }
  async function downloadSelected() {
    const game = visibleGames()[state.cursor];
    if (!game) { state.message = 'No game is selected.'; render(); return; }
    if (state.busy) { state.message = 'A download is already active; open Downloads to monitor it.'; render(); return; }
    if (!game.downloadUrl) { state.message = `Download unavailable: ${game.name} has no downloadable file link.`; render(); return; }
    state.busy = true; state.filePath = ''; state.progress = { downloaded: 0, total: game.sizeBytes || 0, speed: 0 }; state.message = `Starting ${game.name}…`;
    const item = state.downloads.find(entry => entry.id === game.id) || { id: game.id, name: game.name };
    Object.assign(item, { state: 'downloading', progress: state.progress, message: 'Starting…', filePath: '' });
    if (!state.downloads.includes(item)) state.downloads.unshift(item);
    render();
    let lastRender = 0;
    try {
      const result = await downloadGame(game, { directory: settings.downloadDirectory || getDefaultDownloadDirectory(), retryCount: settings.retryCount, requestTimeoutMs: settings.requestTimeoutMs, showProgress: false, onProgress: progress => { state.progress = progress; item.progress = progress; item.message = 'Downloading…'; const now = Date.now(); if (now - lastRender > 100) { lastRender = now; render(); } }, onWarning: warning => { state.message = `Warning: ${warning}`; item.message = state.message; render(); } });
      await recordDownload({ id: game.id, name: game.name, filePath: result.filePath, bytes: result.bytes, state: 'completed' });
      await upsertLibrary({ id: game.id, name: game.name, filePath: result.filePath, bytes: result.bytes, platform: game.platform });
      state.progress = { downloaded: result.bytes, total: game.sizeBytes || result.bytes, speed: 0 }; state.filePath = result.filePath; state.message = `Saved ${game.name} · ${formatBytes(result.bytes)}`; Object.assign(item, { state: 'done', progress: state.progress, message: state.message, filePath: result.filePath });
    } catch (error) { state.message = `Download failed: ${error?.message || String(error)}`; Object.assign(item, { state: 'failed', message: state.message }); }
    finally {
      state.busy = false;
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(true);
      process.stdin.resume();
      render();
    }
  }
  async function toggle(key) { const game = visibleGames()[state.cursor]; if (!game) return; await toggleCollection(key, game.id); state.message = `${key === 'favorites' ? 'Favorite' : 'Wishlist'} updated for ${game.name}`; if (state.tab === 3) await refreshLibrary(); render(); }
  function render() {
    if (!alive) return;
    const w = width();
    const list = visibleGames();
    state.cursor = Math.max(0, Math.min(state.cursor, Math.max(0, list.length - 1)));
    const selected = list[state.cursor];
    if (state.detail && selected) {
      const detailLines = [
        `${accent('◈')} ${selected.name}`,
        `${accent('Platform:')} ${selected.platform}    ${purple('Format:')} ${formatLabel(selected)}    ${yellow('Rating:')} ${stars(selected.rating)} ${selected.ratingLabel}`,
        `${accent('Genre:')} ${selected.genre}    ${purple('Size:')} ${selected.size}`,
        `${accent('Compatibility:')} ${selected.compatibility || 'Not specified'}`,
        `${accent('Checksum:')} ${selected.checksum ? green('available ✓') : yellow('not provided')}`,
        `${accent('Destination:')} ${settings.downloadDirectory || getDefaultDownloadDirectory()}`,
        progressLine(state.progress),
        state.filePath ? `${accent('Saved file:')} ${state.filePath}` : '',
        '',
        clean(selected.description) || muted('No description available.'),
        '',
        state.message ? `${accent('Status:')} ${state.message}` : '',
        `${accent('D')} download    ${accent('F')} favorite    ${accent('W')} wishlist    ${accent('Esc')} back`,
      ];
      const detailOutput = [`${accent('FALIZ GAMES')}  ${muted('/// GAME CARD')}`, '', ...box('GAME DETAILS', detailLines), '', muted('↑↓ change game  D download  F favorite  W wishlist  Esc back  Q quit')];
      process.stdout.write(`${ESC}2J${ESC}H${detailOutput.slice(0, height() - 1).join('\n')}`);
      return;
    }
    const header = [`${accent('FALIZ GAMES')}  ${muted('/// GAME LIBRARY')}`, '', ['Home', 'Browse', 'Search', 'Library', 'Downloads', 'Settings'].map((name, i) => state.tab === i ? ` [${i + 1} ${name}] ` : muted(` ${i + 1} ${name} `)).join(''), '', `${offline ? yellow('● offline cache') : green('● live catalog')}  ${muted(`${games.length.toLocaleString()} games`)}  ${muted(`v${settings.version || ''}`)}`];
    const lines = [...header];
    if (state.tab === 0) {
      const featured = featuredGames(games, 5);
      lines.push(...box('HOME · FEATURED', featured.map((game, i) => gameRow(game, i, i === state.cursor))));
      lines.push('', ...box('DISCOVER', [`Trending: ${trendingGames(games, 3).map(g => g.name).join(' · ')}`, `Latest: ${latestGames(games, 3).map(g => g.name).join(' · ')}`, 'Enter details · D download · F favorite · W wishlist']));
    } else if (state.tab === 2) {
      lines.push(`${accent('Search:')} ${state.query || muted('type to search')}  ${muted(`${list.length} results`)}`);
      lines.push(...box('SEARCH RESULTS', list.map((game, i) => gameRow(game, i, i === state.cursor))));
    } else if (state.tab === 3) {
      const names = ['Downloaded', 'Favorites', 'Wishlist', 'Recent'];
      lines.push(`${names.map((name, i) => i === state.libraryTab ? accent(`[${name}]`) : muted(name)).join('  ')}`);
      lines.push(...box('LIBRARY', list.map((game, i) => gameRow(game, i, i === state.cursor))));
    } else if (state.tab === 4) {
      const downloadRows = state.downloads.length ? state.downloads.map(item => `${item.state === 'done' ? '✓' : item.state === 'failed' ? '✗' : '↓'} ${fit(item.name, Math.max(16, w - 30))} ${item.state.toUpperCase()} ${progressLine(item.progress)}`) : ['No downloads in this session yet.', 'Select a title and press D to start.'];
      lines.push(...box('DOWNLOADS · SESSION MANAGER', [...downloadRows, `Destination: ${settings.downloadDirectory || getDefaultDownloadDirectory()}`, 'P pause/resume · C cancel while downloading']));
    } else if (state.tab === 5) {
      lines.push(...box('SETTINGS', [`Download directory: ${settings.downloadDirectory || getDefaultDownloadDirectory()}`, `Concurrency: ${settings.maxConcurrentDownloads}`, `Retries: ${settings.retryCount}`, `Timeout: ${settings.requestTimeoutMs} ms`, 'Use the existing Settings menu to edit values.']));
    } else {
      lines.push(...box('BROWSE · TOP RATED', list.map((game, i) => gameRow(game, i, i === state.cursor, String(i + 1).padStart(3, ' ')))));
    }
    if (selected) lines.push('', ...box('SELECTED GAME · PRESS ENTER FOR CARD', [`${accent(selected.name)}`, `${accent(selected.platform)} · ${purple(formatLabel(selected))} · ${stars(selected.rating)} ${yellow(selected.rating.toFixed(1))} · ${selected.size}`, 'Enter details · D download · F favorite · W wishlist']));
    lines.push('', muted(state.message || '↑↓ move  ←→ tabs  1–6 jump  / search  D download  F favorite  W wishlist  Q quit'), muted('Only download files you are authorized to access.'));
    process.stdout.write(`${ESC}2J${ESC}H${lines.slice(0, height() - 1).join('\n')}`);
  }
  async function onKey(buffer) {
    const key = buffer.toString();
    if (key === 'ctrl-c' || key === '\u0003') { alive = false; cleanup(); return; }
    const direction = arrowDirection(key);
    if (direction === 'up') { state.cursor -= 1; render(); return; }
    if (direction === 'down') { state.cursor += 1; render(); return; }
    if (direction === 'right') { state.tab = (state.tab + 1) % 6; state.cursor = 0; if (state.tab === 3) await refreshLibrary(); render(); return; }
    if (direction === 'left') { state.tab = (state.tab + 5) % 6; state.cursor = 0; if (state.tab === 3) await refreshLibrary(); render(); return; }
    if (key === '\n') { state.detail = true; render(); return; }
    if (key.toLowerCase() === 'q') { alive = false; cleanup(); return; }
    if (key === '\u0009') { state.tab = (state.tab + 1) % 6; state.cursor = 0; if (state.tab === 3) await refreshLibrary(); render(); return; }
    if (/^[1-6]$/.test(key)) { state.tab = Number(key) - 1; state.cursor = 0; if (state.tab === 3) await refreshLibrary(); render(); return; }
    if (key === '/' || (state.tab === 2 && key.length === 1 && key >= ' ' && key <= '~')) { state.tab = 2; if (key !== '/') state.query += key; state.cursor = 0; render(); return; }
    if (state.tab === 2 && (key === '\u007f' || key === '\b')) { state.query = state.query.slice(0, -1); state.cursor = 0; render(); return; }
    if (state.tab === 3 && key === '\u001b[Z') { state.libraryTab = (state.libraryTab + 1) % 4; await refreshLibrary(); render(); return; }
    if (key === 'd' || key === 'D') { await downloadSelected(); return; }
    if (key === 'f' || key === 'F') { await toggle('favorites'); return; }
    if (key === 'w' || key === 'W') { await toggle('wishlist'); return; }
    if (key === '\u001b') { state.detail = false; render(); return; }
    if (key === '\r') { const game = visibleGames()[state.cursor]; if (game) { state.detail = true; render(); } return; }
  }
  await new Promise(resolve => {
    const quit = () => { alive = false; cleanup(); resolve(); };
    const dataHandler = async data => {
      try {
        const parsed = consumeKeys(data, keyRemainder);
        keyRemainder = parsed.rest;
        for (const key of parsed.keys) await onKey(key);
      } catch (error) { state.message = error?.message || String(error); render(); }
      if (!alive) quit();
    };
    cleanup = () => { process.stdin.off('data', dataHandler); process.stdout.off('resize', render); process.off('SIGINT', quit); process.off('SIGTERM', quit); terminal.cleanup(); };
    terminal.enter();
    process.stdin.setEncoding('utf8'); process.stdin.setRawMode?.(true); process.stdin.resume(); process.stdin.on('data', dataHandler);
    process.once('SIGINT', quit); process.once('SIGTERM', quit); process.stdout.on('resize', render); render();
  });
}
