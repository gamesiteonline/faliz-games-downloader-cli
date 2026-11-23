#!/usr/bin/env node
import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';
import { createRequire } from 'node:module';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { downloadGame, formatBytes, getDefaultDownloadDirectory, getDownloadStatus } from './downloader.js';
import { filterGames, searchGames, sortGames, sortTopRated, syncCatalog, featuredGames, trendingGames, latestGames, uniqueGenres, uniquePlatforms, getCachePaths } from './catalog.js';
import { loadSettings, saveSettings, loadCollection, toggleCollection, addRecentlyViewed, recordDownload, upsertLibrary, getPersistencePaths } from './persistence.js';
import { DownloadQueue } from './queue.js';
import { runTui } from './tui.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json');
const cyan = chalk.hex('#36D1DC');
const purple = chalk.hex('#8B5CF6');
const green = chalk.hex('#22C55E');
const yellow = chalk.hex('#FACC15');
const muted = chalk.gray;

function columns() {
  return Math.max(60, Math.min(118, Number(process.stdout.columns) || 80));
}

function wrapText(value, width = columns() - 4) {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (line.length + word.length + 1 <= width) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

function divider(char = '─') { return muted(char.repeat(columns())); }
function logo() { return cyan(figlet.textSync('FALIZ GAMES', { font: 'Small', horizontalLayout: 'default' })); }
function link(label, url) { return `\u001b]8;;${url}\u0007${cyan(label)}\u001b]8;;\u0007`; }
function clip(value, width) { return String(value ?? '').slice(0, Math.max(1, width)).padEnd(Math.max(1, width)); }
function progressBar(value, width = 18, color = cyan) {
  const filled = Math.max(0, Math.min(width, Math.round(value * width)));
  return color('━'.repeat(filled)) + muted('─'.repeat(width - filled));
}
function dashboardPanel(title, rows, width) {
  const top = chalk.hex('#26345E')(`╭─ ${title} ${'─'.repeat(Math.max(0, width - title.length - 5))}╮`);
  const body = rows.map(row => chalk.hex('#26345E')('│ ') + row + chalk.hex('#26345E')(' '.repeat(Math.max(0, width - 3 - stripAnsi(row).length)) + '│'));
  const bottom = chalk.hex('#26345E')(`╰${'─'.repeat(width - 1)}╯`);
  return [top, ...body, bottom].join('\n');
}
function stripAnsi(value) { return String(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\u001b\][^\u0007]*\u0007/g, ''); }
function rating(game) {
  const filled = Math.max(0, Math.min(5, Math.round(game.rating / 2)));
  return yellow('★'.repeat(filled) + muted('☆'.repeat(5 - filled)));
}
function statusIcon(status) {
  if (status === 'downloaded') return green('● saved');
  if (status === 'partial') return yellow('◐ partial');
  return muted('○ not saved');
}
function gameLabel(game, index) {
  const rank = String(index + 1).padStart(3, ' ');
  const nameWidth = Math.max(22, Math.min(46, columns() - 45));
  return `${muted(rank)}  ${chalk.white(game.name.slice(0, nameWidth).padEnd(nameWidth))}  ${rating(game)} ${yellow(game.rating.toFixed(1))}  ${muted(game.platform.slice(0, 16))}`;
}

function header(sync) {
  console.clear();
  const width = columns();
  const side = Math.min(20, Math.max(16, Math.floor(width * 0.2)));
  const main = width - side - 3;
  const featured = featuredGames(sync.games).slice(0, 3);
  const top = sortTopRated(sync.games, 5);
  const state = sync.offline ? yellow('● Offline cache') : green('● Live catalog');
  console.log(chalk.bgHex('#0B1226').white(` ${clip('FALIZ GAMES  /  GAME LIBRARY', width - 2)} `));
  console.log();
  const sidebar = [
    chalk.hex('#8EA4D8')('LIBRARY'),
    `${cyan('▣')} ${chalk.white('Dashboard')}`,
    `${muted('▱')} Recent`,
    `${muted('▱')} All games ${muted(sync.games.length)}`,
    `${muted('▱')} Top 100`,
    '',
    chalk.hex('#8EA4D8')('DISCOVER'),
    `${muted('⌕')} Search`,
    `${muted('◈')} Featured`,
    `${muted('◆')} Trending`,
    `${muted('▤')} Genres`,
    '',
    chalk.hex('#8EA4D8')('SYSTEM'),
    `${muted('⇩')} Downloads`,
    `${muted('⚙')} Settings`,
    `${muted('ⓘ')} About`,
  ].map(line => ` ${clip(line, side - 2)}`).join('\n');
  const featuredRows = featured.length ? featured.map((game, i) => `${purple(`${String(i + 1).padStart(2, '0')}`)} ${chalk.white(clip(game.name, Math.max(12, main - 28)))} ${rating(game)} ${yellow(game.rating.toFixed(1))}`) : [muted('No featured games available')];
  const summaryRows = [
    `${cyan('▰')} ${chalk.bold(String(sync.games.length.toLocaleString()))} ${muted('games indexed')}   ${purple('✦')} ${chalk.bold(String(uniqueGenres(sync.games).length))} ${muted('genres')}`,
    `${green('●')} ${state}   ${muted(`v${VERSION}`)}`,
    `${muted('⇩')} ${clip(getDefaultDownloadDirectory(), Math.max(20, main - 25))}`,
  ];
  const topRows = top.length ? top.slice(0, 4).map((game, i) => `${yellow(String(i + 1).padStart(2, '0'))} ${chalk.white(clip(game.name, Math.max(12, main - 30)))} ${progressBar(Math.min(1, game.rating / 10), 12, i % 2 ? purple : cyan)} ${yellow(game.rating.toFixed(1))}`) : [muted('No ratings available')];
  const left = sidebar.split('\n');
  const right = [
    dashboardPanel('CATALOG PULSE', summaryRows, main),
    '',
    dashboardPanel('FEATURED GAMES', featuredRows, main),
    '',
    dashboardPanel('TOP-RATED GAMES', topRows, main),
  ];
  const maxLines = Math.max(left.length, right.length);
  for (let i = 0; i < maxLines; i += 1) {
    const l = left[i] ?? ' '.repeat(side);
    const r = right[i] ?? '';
    console.log(chalk.hex('#172442')(`│${clip(l, side)}│`) + '  ' + r);
  }
  console.log();
  console.log(muted(`  ${divider('·')}`));
  console.log(muted('  ↑↓ navigate   Enter open   Space multi-select   P pause/resume   C cancel'));
}

function printHelp() {
  console.log(`${logo()}\n\n${chalk.bold('Faliz Games')} — terminal game catalog and downloader\n\nUsage:\n  faliz-games              Open the interactive catalog\n  faliz-games --help       Show this help message\n  faliz-games --version    Show the installed version\n  faliz-games search <q> [--json]\n  faliz-games info <id|name> [--json]\n  faliz-games download <id|name> [--dir <path>] [--yes]\n  faliz-games list --downloaded [--json]\n  faliz-games refresh [--json]\n  faliz-games settings get [key] [--json]\n  faliz-games settings set <key> <value>\n  faliz-games doctor [--json]\n\nEnvironment:\n  FALIZ_CATALOG_URL        Override the live catalog JSON endpoint\n  FALIZ_DOWNLOAD_DIR       Override the download directory\n\nOn Termux, grant shared storage access once with:\n  termux-setup-storage\n`);
}

function outputData(value, asJson) {
  if (asJson) console.log(JSON.stringify(value, null, 2));
  else if (Array.isArray(value)) value.forEach((item, index) => console.log(`${String(index + 1).padStart(3, ' ')}  ${item.name ?? item.id ?? item}`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => console.log(`${key}: ${item}`));
  else console.log(value);
}
function commandGame(games, query) { const needle = String(query ?? '').toLowerCase(); return games.find(game => game.id.toLowerCase() === needle) ?? games.find(game => game.name.toLowerCase() === needle) ?? games.find(game => game.name.toLowerCase().includes(needle)); }

async function runCommand(args) {
  const command = args[0];
  if (!['search', 'info', 'download', 'list', 'refresh', 'settings', 'doctor'].includes(command)) return false;
  const asJson = args.includes('--json');
  const settings = await loadSettings();
  if (command === 'settings') {
    if (args[1] === 'get') { const key = args.slice(2).find(item => !item.startsWith('--')); outputData(key ? settings[key] : settings, asJson); return true; }
    if (args[1] === 'set') { const key = args[2]; const value = args.slice(3).filter(item => item !== '--json').join(' '); if (!key || !value || !(key in settings)) throw new Error('Usage: settings set <known-key> <value>'); const parsed = ['maxConcurrentDownloads', 'retryCount', 'requestTimeoutMs'].includes(key) ? Number(value) : value; await saveSettings({ [key]: parsed }); outputData({ saved: true, key, value: parsed }, asJson); return true; }
    throw new Error('Usage: settings get [key] | settings set <key> <value>');
  }
  if (command === 'doctor') { const paths = getPersistencePaths(); const cache = getCachePaths(); const fs = await import('node:fs/promises'); const cachePresent = await fs.access(cache.CACHE_FILE).then(() => true).catch(() => false); outputData({ node: process.version, nodeOk: Number(process.versions.node.split('.')[0]) >= 18, tty: Boolean(process.stdin.isTTY && process.stdout.isTTY), appDirectory: paths.APP_DIR, cachePresent, downloadDirectory: settings.downloadDirectory || getDefaultDownloadDirectory() }, asJson); return true; }
  const sync = await syncCatalog({ url: settings.catalogUrl || undefined, timeoutMs: settings.requestTimeoutMs });
  if (command === 'refresh') { outputData({ updated: sync.updated, offline: sync.offline, games: sync.games.length }, asJson); return true; }
  if (command === 'search') { const query = args.slice(1).filter(item => !item.startsWith('--')).join(' '); const results = searchGames(sync.games, query).slice(0, 100); outputData(asJson ? results : results.map(game => ({ id: game.id, name: game.name, platform: game.platform, rating: game.rating, size: game.size })), asJson); return true; }
  const query = args.slice(1).filter(item => !item.startsWith('--') && item !== '-y' && item !== '--dir' && item !== args[args.indexOf('--dir') + 1]).join(' ');
  if (command === 'info') { const game = commandGame(sync.games, query); if (!game) throw new Error('Game not found.'); outputData(game, asJson); return true; }
  if (command === 'list') { const library = await loadCollection('library'); const results = sync.games.filter(game => library.some(item => String(item?.id ?? item) === game.id)); outputData(results, asJson); return true; }
  if (command === 'download') { const game = commandGame(sync.games, query); if (!game) throw new Error('Game not found.'); if (!args.includes('--yes') && !args.includes('-y')) throw new Error('Add --yes to confirm an authorized download.'); const dirIndex = args.indexOf('--dir'); const directory = dirIndex >= 0 ? args[dirIndex + 1] : settings.downloadDirectory || getDefaultDownloadDirectory(); const result = await downloadGame(game, { directory, retryCount: settings.retryCount, requestTimeoutMs: settings.requestTimeoutMs }); await recordDownload({ id: game.id, name: game.name, filePath: result.filePath, bytes: result.bytes, state: 'completed' }); await upsertLibrary({ id: game.id, name: game.name, filePath: result.filePath, bytes: result.bytes, platform: game.platform }); outputData({ name: game.name, filePath: result.filePath, bytes: result.bytes }, asJson); return true; }
  return true;
}

async function details(game, directory = getDefaultDownloadDirectory()) {
  const status = await getDownloadStatus(game, directory);
  await addRecentlyViewed(game);
  console.log(`\n${purple('━'.repeat(columns()))}`);
  console.log(chalk.bold.white(game.name));
  console.log(`${muted(game.platform)}  •  ${muted(game.genre)}  •  ${rating(game)} ${yellow(game.ratingLabel)}`);
  console.log(`${muted('Format:')} ${game.extension || 'unknown'}   ${muted('Size:')} ${game.size}   ${statusIcon(status.state)}`);
  if (game.description) console.log(`\n${wrapText(game.description)}`);
  if (game.compatibility) console.log(`\n${chalk.bold('Compatibility:')} ${wrapText(game.compatibility)}`);
  console.log(`${muted('Path:')} ${status.filePath}`);
  console.log(`${purple('━'.repeat(columns()))}`);
  return status;
}

async function chooseGames(games, title, { multiple = true } = {}) {
  if (!games.length) {
    console.log(yellow('\nNo games matched that view.'));
    await input({ message: 'Press Enter to continue', default: '' });
    return [];
  }
  const choices = [
    { name: muted('← Back'), value: null },
    ...games.map((game, index) => ({ name: gameLabel(game, index), value: game })),
  ];
  if (!multiple) {
    const selected = await select({ message: title, pageSize: 16, choices });
    return selected ? [selected] : [];
  }
  const selected = await checkbox({
    message: `${title}  (Space select · Enter continue)`,
    pageSize: 16,
    choices,
    instructions: muted('Use arrows to move, Space to select multiple games, Enter to continue.'),
    validate: values => values.length ? true : 'Select at least one game or choose Back.',
  });
  return selected.filter(Boolean);
}

async function downloadFlow(games) {
  for (const game of games) {
    const settings = await loadSettings();
    const directory = settings.downloadDirectory || getDefaultDownloadDirectory();
    const status = await details(game, directory);
    if (!game.downloadUrl) {
      console.log(yellow('\nThis entry has no downloadable file attached.'));
      continue;
    }
    if (status.state === 'downloaded') {
      const redownload = await confirm({ message: 'This file is already saved. Download again?', default: false });
      if (!redownload) continue;
    }
    const accepted = await confirm({ message: `Download to ${directory}?`, default: true });
    if (!accepted) continue;
    try {
      console.log(cyan(`\n▶ Starting download: ${game.name}`));
      console.log(muted('   Press P to pause/resume or C to cancel. Partial data is preserved.'));
      const result = await downloadGame(game, { directory, retryCount: settings.retryCount, requestTimeoutMs: settings.requestTimeoutMs, onWarning: warning => console.log(yellow(`⚠ ${warning}`)) });
      await recordDownload({ id: game.id, name: game.name, filePath: result.filePath, bytes: result.bytes, state: 'completed' });
      await upsertLibrary({ id: game.id, name: game.name, filePath: result.filePath, bytes: result.bytes, platform: game.platform });
      console.log(green(`\n✓ Saved ${formatBytes(result.bytes)} to ${result.filePath}`));
    } catch (error) {
      const canceled = error.message.toLowerCase().includes('canceled') || error.message.toLowerCase().includes('interrupted');
      console.log(canceled ? yellow(`\n■ ${error.message}`) : chalk.red(`\n✗ Download failed: ${error.message}`));
    }
  }
  const next = await select({
    message: 'What next?',
    choices: [
      { name: 'Search or browse again', value: 'continue' },
      { name: 'Return to main menu', value: 'menu' },
      { name: 'Exit Faliz Games', value: 'exit' },
    ],
  });
  return next;
}

async function showAbout() {
  console.log(`\n${logo()}\n${chalk.bold(`Version ${VERSION}`)}`);
  console.log('A terminal-first catalog browser with live synchronization and streamed downloads.');
  console.log(muted(`\nDeveloper: Fahad Mohamed — Tanzania`));
  console.log(link('Threads', 'https://www.threads.com/@ard.sing'));
  console.log(link('Reddit', 'https://www.reddit.com/u/gamesiteonline'));
  console.log(link('Instagram', 'https://www.instagram.com/ard.sing'));
  console.log(link('WhatsApp channel', 'https://whatsapp.com/channel/0029VbChyDUI1rcht5jajL3q'));
  console.log(link('YouTube', 'https://youtube.com/@gamesiteonline'));
  console.log(link('Google Play Games', 'https://my.play/gamesiteonline'));
  console.log(muted('\nOnly download and use files you are authorized to access.'));
  await input({ message: 'Press Enter to continue', default: '' });
}

async function run() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) return printHelp();
  if (process.argv.includes('--version') || process.argv.includes('-v')) return console.log(VERSION);
  if (await runCommand(process.argv.slice(2))) return;

  const settings = await loadSettings();
  let spinner = ora({ text: 'Syncing the live catalog…', color: 'cyan' }).start();
  let sync;
  try {
    sync = await syncCatalog({ url: settings.catalogUrl || undefined, timeoutMs: settings.requestTimeoutMs });
    spinner.succeed(sync.updated ? `Catalog synchronized · ${sync.games.length.toLocaleString()} games` : sync.offline ? 'Using the latest local cache' : 'Catalog is up to date');
  } catch (error) {
    spinner.fail(error.message);
    process.exitCode = 1;
    return;
  }

  if (process.stdin.isTTY && process.stdout.isTTY) {
    await runTui(sync, { ...settings, version: VERSION });
    return;
  }

  while (true) {
    header(sync);
    const action = await select({
      message: 'Choose an action',
      choices: [
        { name: 'Featured games', value: 'featured' },
        { name: 'Trending / latest (with fallback)', value: 'trending' },
        { name: 'Browse by genre', value: 'genre' },
        { name: 'Browse by platform', value: 'platform' },
        { name: 'Favorites / wishlist', value: 'favorites' },
        { name: 'Recently viewed', value: 'recent' },
        { name: 'Local library', value: 'library' },
        { name: 'Settings', value: 'settings' },
        { name: 'Top 100 best-rated games', value: 'top' },
        { name: 'Search the catalog', value: 'search' },
        { name: 'Filter and sort catalog', value: 'filter' },
        { name: 'Refresh live catalog', value: 'refresh' },
        { name: 'About Faliz Games & developer', value: 'about' },
        { name: 'Exit', value: 'exit' },
      ],
    });
    if (action === 'exit') break;
    if (action === 'about') { await showAbout(); continue; }
    if (action === 'settings') {
      const current = await loadSettings();
      const directory = await input({ message: 'Download directory', default: current.downloadDirectory || getDefaultDownloadDirectory() });
      const concurrency = await input({ message: 'Max concurrent downloads (safe default 1)', default: String(current.maxConcurrentDownloads) });
      const retries = await input({ message: 'Retry count', default: String(current.retryCount) });
      const timeout = await input({ message: 'Request timeout in milliseconds', default: String(current.requestTimeoutMs) });
      const animation = await confirm({ message: 'Enable animations and spinners?', default: current.animation });
      const catalogUrl = await input({ message: 'Catalog URL', default: current.catalogUrl || '' });
      await saveSettings({ downloadDirectory: directory, maxConcurrentDownloads: Math.max(1, Number(concurrency) || 1), retryCount: Math.max(0, Number(retries) || 0), requestTimeoutMs: Math.max(1000, Number(timeout) || 30000), animation, catalogUrl });
      console.log(green('Settings saved.')); await input({ message: 'Press Enter to continue', default: '' }); continue;
    }
    if (action === 'refresh') {
      spinner = ora({ text: 'Checking for catalog updates…', color: 'cyan' }).start();
      try { const settings = await loadSettings(); sync = await syncCatalog({ force: true, url: settings.catalogUrl || undefined, timeoutMs: settings.requestTimeoutMs }); spinner.succeed(`Catalog refreshed · ${sync.games.length.toLocaleString()} games`); }
      catch (error) { spinner.fail(error.message); await input({ message: 'Press Enter to continue', default: '' }); }
      continue;
    }

    let games;
    let title;
    if (action === 'featured') { games = featuredGames(sync.games); title = 'Featured games — select games';
    } else if (action === 'trending') { games = [...trendingGames(sync.games), ...latestGames(sync.games)].filter((g,i,a)=>a.findIndex(x=>x.id===g.id)===i).slice(0,100); title = 'Trending / latest — select games';
    } else if (action === 'genre' || action === 'platform') { const values = action === 'genre' ? uniqueGenres(sync.games) : uniquePlatforms(sync.games); const value = await select({ message: action === 'genre' ? 'Choose a genre' : 'Choose a platform', choices: values.map(x=>({name:x,value:x})) }); games = filterGames(sync.games, action === 'genre' ? { genre: value } : { platform: value }); title = `${games.length} ${value} games — select games`;
    } else if (action === 'favorites' || action === 'recent' || action === 'library') { const key = action === 'favorites' ? 'favorites' : action === 'recent' ? 'recentlyViewed' : 'library'; const ids = await loadCollection(key); games = sync.games.filter(g=>ids.some(id=>String(id.id||id)===g.id)); title = `${action} — select games`;
    } else if (action === 'top') {
      games = sortTopRated(sync.games);
      title = 'Top 100 — select games';
    } else if (action === 'search') {
      const query = await input({ message: 'Search by title, platform, genre, or extension' });
      games = searchGames(sync.games, query).slice(0, 100);
      title = `${games.length} result(s) — select games`;
    } else {
      const platform = await input({ message: 'Platform filter (optional)', default: '' });
      const extension = await input({ message: 'Extension filter, e.g. zip or apk (optional)', default: '' });
      const sortBy = await select({ message: 'Sort results by', choices: [
        { name: 'Rating — highest first', value: ['rating', 'desc'] },
        { name: 'Title — A to Z', value: ['title', 'asc'] },
        { name: 'Size — largest first', value: ['size', 'desc'] },
      ] });
      games = sortGames(filterGames(sync.games, { platform, extension }), sortBy[0], sortBy[1]).slice(0, 100);
      title = `${games.length} filtered result(s) — select games`;
    }
    const selected = await chooseGames(games, title);
    if (!selected.length) continue;
    const next = await downloadFlow(selected);
    if (next === 'exit') break;
  }
  console.log(chalk.cyan('\nThanks for using Faliz Games.\n'));
}

run().catch(error => {
  if (error.name === 'ExitPromptError') process.exit(0);
  console.error(chalk.red(`\nUnexpected error: ${error.message}`));
  process.exitCode = 1;
});
