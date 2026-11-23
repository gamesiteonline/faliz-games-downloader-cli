import chalk from 'chalk';
import { downloadGame, formatBytes, getDefaultDownloadDirectory, getDownloadStatus } from './downloader.js';
import { featuredGames, latestGames, searchGames, sortTopRated, trendingGames } from './catalog.js';
import { loadCollection, loadSettings, recordDownload, toggleCollection, upsertLibrary } from './persistence.js';

const ESC = '\u001b[';
const colors = { cyan: '#36D1DC', purple: '#8B5CF6', green: '#22C55E', yellow: '#FACC15', navy: '#0B1226', muted: '#7182AA' };
const accent = chalk.hex(colors.cyan);
const purple = chalk.hex(colors.purple);
const green = chalk.hex(colors.green);
const yellow = chalk.hex(colors.yellow);
const muted = chalk.hex(colors.muted);

function width() { return Math.max(50, Number(process.stdout.columns) || 80); }
function height() { return Math.max(16, Number(process.stdout.rows) || 24); }
function clean(value) { return String(value ?? '').replace(/[\u0000-\u001f\u007f\u001b]/g, '').trim(); }
function fit(value, size) { const text = clean(value); return text.length > size ? `${text.slice(0, Math.max(0, size - 1))}…` : text.padEnd(size); }
function box(title, lines, size = width() - 4) { const inner = Math.max(12, size - 4); const top = `╭─ ${title} ${'─'.repeat(Math.max(0, inner - title.length - 3))}╮`; const body = lines.slice(0, height() - 8).map(line => `│ ${fit(line, inner)} │`); return [top, ...body, `╰${'─'.repeat(inner + 2)}╯`]; }
function stars(value) { const count = Math.max(0, Math.min(5, Math.round(Number(value || 0) / 2))); return yellow('★'.repeat(count) + muted('☆'.repeat(5 - count))); }
function tabName(tab) { return ['Home', 'Browse', 'Search', 'Library', 'Downloads', 'Settings'][tab]; }

export async function runTui({ games, offline = false }, initialSettings = {}) {
  const settings = { ...(await loadSettings()), ...initialSettings };
  const state = { tab: 0, cursor: 0, query: '', libraryTab: 0, message: '', busy: false, selected: null };
  let alive = true;
  let cleanup = () => {};

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
    if (!game || state.busy) return;
    state.busy = true; state.message = `Starting ${game.name}…`; render();
    try {
      const result = await downloadGame(game, { directory: settings.downloadDirectory || getDefaultDownloadDirectory(), retryCount: settings.retryCount, requestTimeoutMs: settings.requestTimeoutMs, onWarning: warning => { state.message = `Warning: ${warning}`; render(); } });
      await recordDownload({ id: game.id, name: game.name, filePath: result.filePath, bytes: result.bytes, state: 'completed' });
      await upsertLibrary({ id: game.id, name: game.name, filePath: result.filePath, bytes: result.bytes, platform: game.platform });
      state.message = `Saved ${game.name} · ${formatBytes(result.bytes)}`;
    } catch (error) { state.message = error.message; }
    state.busy = false; render();
  }
  async function toggle(key) { const game = visibleGames()[state.cursor]; if (!game) return; await toggleCollection(key, game.id); state.message = `${key === 'favorites' ? 'Favorite' : 'Wishlist'} updated for ${game.name}`; if (state.tab === 3) await refreshLibrary(); render(); }
  function render() {
    if (!alive) return;
    const w = width();
    const list = visibleGames();
    state.cursor = Math.max(0, Math.min(state.cursor, Math.max(0, list.length - 1)));
    const selected = list[state.cursor];
    const header = [`${accent('FALIZ GAMES')}  ${muted('/// GAME LIBRARY')}`, '', ['Home', 'Browse', 'Search', 'Library', 'Downloads', 'Settings'].map((name, i) => state.tab === i ? chalk.bgHex(colors.purple).white(` ${i + 1} ${name} `) : muted(` ${i + 1} ${name} `)).join(''), '', `${offline ? yellow('● offline cache') : green('● live catalog')}  ${muted(`${games.length.toLocaleString()} games`)}  ${muted(`v${settings.version || ''}`)}`];
    const lines = [...header];
    if (state.tab === 0) {
      const featured = featuredGames(games, 5);
      lines.push(...box('HOME · FEATURED', featured.map((game, i) => `${i === state.cursor ? accent('▸') : ' '} ${fit(game.name, Math.max(18, w - 34))} ${stars(game.rating)} ${yellow(game.rating.toFixed(1))}  ${muted(game.platform)}`)));
      lines.push('', ...box('DISCOVER', [`Trending: ${trendingGames(games, 3).map(g => g.name).join(' · ')}`, `Latest: ${latestGames(games, 3).map(g => g.name).join(' · ')}`, 'Enter details · D download · F favorite · W wishlist']));
    } else if (state.tab === 2) {
      lines.push(`${accent('Search:')} ${state.query || muted('type to search')}  ${muted(`${list.length} results`)}`);
      lines.push(...box('SEARCH RESULTS', list.map((game, i) => `${i === state.cursor ? accent('▸') : ' '} ${fit(game.name, Math.max(18, w - 38))} ${stars(game.rating)} ${muted(game.platform)} ${muted(game.size)}`)));
    } else if (state.tab === 3) {
      const names = ['Downloaded', 'Favorites', 'Wishlist', 'Recent'];
      lines.push(`${names.map((name, i) => i === state.libraryTab ? accent(`[${name}]`) : muted(name)).join('  ')}`);
      lines.push(...box('LIBRARY', list.map((game, i) => `${i === state.cursor ? accent('▸') : ' '} ${fit(game.name, Math.max(18, w - 38))} ${stars(game.rating)} ${muted(game.platform)}`)));
    } else if (state.tab === 4) {
      lines.push(...box('DOWNLOADS', ['Download manager is ready.', 'Select a title from Home, Browse, or Search and press D.', `Destination: ${settings.downloadDirectory || getDefaultDownloadDirectory()}`, 'P pause/resume · C cancel while downloading']));
    } else if (state.tab === 5) {
      lines.push(...box('SETTINGS', [`Download directory: ${settings.downloadDirectory || getDefaultDownloadDirectory()}`, `Concurrency: ${settings.maxConcurrentDownloads}`, `Retries: ${settings.retryCount}`, `Timeout: ${settings.requestTimeoutMs} ms`, 'Use the existing Settings menu to edit values.']));
    } else {
      lines.push(...box('BROWSE · TOP RATED', list.map((game, i) => `${i === state.cursor ? accent('▸') : ' '} ${String(i + 1).padStart(3, ' ')} ${fit(game.name, Math.max(18, w - 54))} ${muted(game.platform)} ${stars(game.rating)} ${yellow(game.rating.toFixed(1))} ${muted(game.size)}`)));
    }
    if (selected) lines.push('', ...box('SELECTED', [`${selected.name} · ${selected.genre} · ${selected.platform}`, `${stars(selected.rating)} ${selected.ratingLabel} · ${selected.size}`, clean(selected.description).slice(0, Math.max(20, w - 8)), 'Enter details · D download · F favorite · W wishlist']));
    lines.push('', muted(state.message || '↑↓ move  ←→ tabs  1–6 jump  / search  D download  F favorite  W wishlist  Q quit'), muted('Only download files you are authorized to access.'));
    process.stdout.write(`${ESC}2J${ESC}H${lines.slice(0, height() - 1).join('\n')}`);
  }
  async function onKey(buffer) {
    const key = buffer.toString();
    if (key === '\u0003' || key.toLowerCase() === 'q') { alive = false; cleanup(); return; }
    if (key === '\u001b[A') { state.cursor -= 1; render(); return; }
    if (key === '\u001b[B') { state.cursor += 1; render(); return; }
    if (key === '\u001b[C' || key === '\u0009') { state.tab = (state.tab + 1) % 6; state.cursor = 0; if (state.tab === 3) await refreshLibrary(); render(); return; }
    if (key === '\u001b[D') { state.tab = (state.tab + 5) % 6; state.cursor = 0; if (state.tab === 3) await refreshLibrary(); render(); return; }
    if (/^[1-6]$/.test(key)) { state.tab = Number(key) - 1; state.cursor = 0; if (state.tab === 3) await refreshLibrary(); render(); return; }
    if (key === '/' || (state.tab === 2 && key.length === 1 && key >= ' ' && key <= '~')) { state.tab = 2; if (key !== '/') state.query += key; state.cursor = 0; render(); return; }
    if (state.tab === 2 && (key === '\u007f' || key === '\b')) { state.query = state.query.slice(0, -1); state.cursor = 0; render(); return; }
    if (state.tab === 3 && key === '\u001b[Z') { state.libraryTab = (state.libraryTab + 1) % 4; await refreshLibrary(); render(); return; }
    if (key === 'd' || key === 'D') { await downloadSelected(); return; }
    if (key === 'f' || key === 'F') { await toggle('favorites'); return; }
    if (key === 'w' || key === 'W') { await toggle('wishlist'); return; }
    if (key === '\r') { const game = visibleGames()[state.cursor]; if (game) { state.message = `${game.name} · ${game.description || 'No description available.'}`; render(); } return; }
  }
  await new Promise(resolve => {
    const quit = () => { alive = false; cleanup(); resolve(); };
    cleanup = () => { process.stdin.off('data', onKey); if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write(`${ESC}?25h${ESC}?1049l`); };
    process.stdout.write(`${ESC}?1049h${ESC}?25l`);
    process.stdin.setEncoding('utf8'); process.stdin.setRawMode?.(true); process.stdin.resume(); process.stdin.on('data', async data => { await onKey(data); if (!alive) quit(); });
    process.once('SIGINT', quit); process.once('SIGTERM', quit); process.stdout.on('resize', render); render();
  });
}
