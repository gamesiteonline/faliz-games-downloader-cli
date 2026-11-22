#!/usr/bin/env node
import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { downloadGame, formatBytes, getDefaultDownloadDirectory, getDownloadStatus } from './downloader.js';
import { filterGames, searchGames, sortGames, sortTopRated, syncCatalog } from './catalog.js';

const VERSION = '0.3.0';
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
  console.log(logo());
  console.log(chalk.bold('  A fast, focused game catalog for your terminal.'));
  const state = sync.offline ? yellow('● Offline cache') : green('● Live catalog');
  console.log(`  ${state}  ${muted(`${sync.games.length.toLocaleString()} games`)}  ${muted(`v${VERSION}`)}`);
  console.log(`  ${muted(`Downloads: ${getDefaultDownloadDirectory()}`)}`);
  console.log(divider());
}

function printHelp() {
  console.log(`${logo()}\n\n${chalk.bold('Faliz Games')} — terminal game catalog and downloader\n\nUsage:\n  faliz-games              Open the interactive catalog\n  faliz-games --help       Show this help message\n  faliz-games --version    Show the installed version\n\nEnvironment:\n  FALIZ_CATALOG_URL        Override the live catalog JSON endpoint\n  FALIZ_DOWNLOAD_DIR       Override the download directory\n\nOn Termux, grant shared storage access once with:\n  termux-setup-storage\n`);
}

async function details(game) {
  const status = await getDownloadStatus(game);
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
    const status = await details(game);
    if (!game.downloadUrl) {
      console.log(yellow('\nThis entry has no downloadable file attached.'));
      continue;
    }
    if (status.state === 'downloaded') {
      const redownload = await confirm({ message: 'This file is already saved. Download again?', default: false });
      if (!redownload) continue;
    }
    const accepted = await confirm({ message: `Download to ${getDefaultDownloadDirectory()}?`, default: true });
    if (!accepted) continue;
    try {
      console.log(cyan(`\n▶ Starting download: ${game.name}`));
      console.log(muted('   Press P to pause/resume or C to cancel. Partial data is preserved.'));
      const result = await downloadGame(game);
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

  let spinner = ora({ text: 'Syncing the live catalog…', color: 'cyan' }).start();
  let sync;
  try {
    sync = await syncCatalog();
    spinner.succeed(sync.updated ? `Catalog synchronized · ${sync.games.length.toLocaleString()} games` : sync.offline ? 'Using the latest local cache' : 'Catalog is up to date');
  } catch (error) {
    spinner.fail(error.message);
    process.exitCode = 1;
    return;
  }

  while (true) {
    header(sync);
    const action = await select({
      message: 'Choose an action',
      choices: [
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
    if (action === 'refresh') {
      spinner = ora({ text: 'Checking for catalog updates…', color: 'cyan' }).start();
      try { sync = await syncCatalog({ force: true }); spinner.succeed(`Catalog refreshed · ${sync.games.length.toLocaleString()} games`); }
      catch (error) { spinner.fail(error.message); await input({ message: 'Press Enter to continue', default: '' }); }
      continue;
    }

    let games;
    let title;
    if (action === 'top') {
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
