#!/usr/bin/env node
import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';
import { confirm, input, select } from '@inquirer/prompts';
import { downloadGame } from './downloader.js';
import { searchGames, sortTopRated, syncCatalog } from './catalog.js';

const VERSION = '0.1.0';

function printHelp() {
  console.log(`${chalk.bold('Faliz Games')} — terminal game catalog and downloader\n\nUsage:\n  faliz-games              Open the interactive catalog\n  faliz-games --help       Show this help message\n  faliz-games --version    Show the installed version\n\nEnvironment:\n  FALIZ_CATALOG_URL        Override the live catalog JSON endpoint\n`);
}

const cyan = chalk.hex('#36D1DC');
const purple = chalk.hex('#8B5CF6');
const muted = chalk.gray;

function logo() {
  return cyan(figlet.textSync('FALIZ GAMES', { font: 'Small', horizontalLayout: 'default' }));
}

function rating(game) {
  const filled = Math.round(game.rating / 2);
  return chalk.yellow('★'.repeat(filled) + chalk.gray('☆'.repeat(Math.max(0, 5 - filled))));
}

function gameLabel(game, index) {
  const rank = String(index + 1).padStart(3, ' ');
  return `${chalk.gray(rank)}  ${chalk.white(game.name.slice(0, 42).padEnd(42))}  ${rating(game)} ${chalk.yellow(game.rating.toFixed(1))}  ${muted(game.platform.slice(0, 18))}`;
}

function header(sync) {
  console.clear();
  console.log(logo());
  console.log(chalk.bold('  A fast, focused game catalog for your terminal.'));
  console.log(`  ${cyan('●')} ${sync.offline ? chalk.yellow('Offline cache') : chalk.green('Live catalog')}  ${muted(`${sync.games.length.toLocaleString()} games available`)}`);
  console.log();
}

function details(game) {
  console.log();
  console.log(purple('━'.repeat(72)));
  console.log(chalk.bold.white(game.name));
  console.log(`${muted(game.platform)}  •  ${muted(game.genre)}  •  ${rating(game)} ${chalk.yellow(game.ratingLabel)}  •  ${muted(game.size)}`);
  if (game.description) console.log(`\n${game.description}`);
  if (game.compatibility) console.log(`\n${chalk.bold('Compatibility:')} ${game.compatibility}`);
  console.log(purple('━'.repeat(72)));
}

async function chooseGame(games, title) {
  if (!games.length) {
    console.log(chalk.yellow('\nNo games matched that view.'));
    await input({ message: 'Press Enter to continue', default: '' });
    return null;
  }
  return select({
    message: title,
    pageSize: 16,
    choices: games.map((game, index) => ({ name: gameLabel(game, index), value: game })),
  });
}

async function downloadFlow(game) {
  details(game);
  if (!game.downloadUrl) {
    console.log(chalk.yellow('\nThis entry has no downloadable file attached.'));
    await input({ message: 'Press Enter to continue', default: '' });
    return;
  }
  const accepted = await confirm({ message: 'Download this file to ./faliz-downloads?', default: true });
  if (!accepted) return;
  try {
    console.log();
    const result = await downloadGame(game);
    console.log(chalk.green(`\n✓ Saved to ${result.filePath}`));
  } catch (error) {
    console.log(chalk.red(`\n✗ Download failed: ${error.message}`));
  }
  await input({ message: 'Press Enter to continue', default: '' });
}

async function run() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(VERSION);
    return;
  }

  let spinner = ora({ text: 'Syncing the live catalog…', color: 'cyan' }).start();
  let sync;
  try {
    sync = await syncCatalog();
    spinner.succeed(sync.updated ? 'Catalog synchronized' : sync.offline ? 'Using the latest local cache' : 'Catalog is up to date');
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
        { name: 'Refresh live catalog', value: 'refresh' },
        { name: 'About Faliz Games', value: 'about' },
        { name: 'Exit', value: 'exit' },
      ],
    });

    if (action === 'exit') break;
    if (action === 'top') {
      const game = await chooseGame(sortTopRated(sync.games), 'Top 100 — select a game');
      if (game) await downloadFlow(game);
    } else if (action === 'search') {
      const query = await input({ message: 'Search by title, platform, genre, or extension' });
      const results = searchGames(sync.games, query).slice(0, 100);
      const game = await chooseGame(results, `${results.length} result(s) — select a game`);
      if (game) await downloadFlow(game);
    } else if (action === 'refresh') {
      spinner = ora({ text: 'Checking for catalog updates…', color: 'cyan' }).start();
      try {
        sync = await syncCatalog({ force: true });
        spinner.succeed(`Catalog refreshed — ${sync.games.length.toLocaleString()} games available`);
      } catch (error) {
        spinner.fail(error.message);
        await input({ message: 'Press Enter to continue', default: '' });
      }
    } else if (action === 'about') {
      console.log(`\n${chalk.bold('Faliz Games')} ${muted(`v${VERSION}`)}`);
      console.log('A terminal-first catalog browser with live synchronization and streamed downloads.');
      console.log(muted('\nOnly download and use files you are authorized to access.'));
      await input({ message: 'Press Enter to continue', default: '' });
    }
  }
  console.log(chalk.cyan('\nThanks for using Faliz Games.\n'));
}

run().catch(error => {
  if (error.name === 'ExitPromptError') process.exit(0);
  console.error(chalk.red(`\nUnexpected error: ${error.message}`));
  process.exitCode = 1;
});
