import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGames, normalizeCatalog, parseRating, parseSize, searchGames, sortGames, sortTopRated, syncCatalog } from '../src/catalog.js';

const rows = [
  { GameID: 'a', FileName: 'Alpha Quest', Rating: '9.4/10', Platform: 'PC', Genre: 'RPG', Size: '2 GB', Extension: 'zip', DownloadLink: 'https://example.test/a.zip' },
  { GameID: 'b', FileName: 'Beta Racer', Rating: '8.2/10', Platform: 'Console', Genre: 'Racing', Size: '700 MB', Extension: 'iso', DownloadLink: 'https://example.test/b.iso' },
  { game_id: 'c', name: 'Gamma Mobile', rating: 7.5, platform: 'Mobile', size: '120 MB', extension: 'apk', download_link: 'https://example.test/c.apk' },
];

test('parses common rating and size formats', () => {
  assert.equal(parseRating('9.4/10'), 9.4);
  assert.equal(parseRating('8,2'), 8.2);
  assert.equal(parseRating('unknown'), 0);
  assert.equal(parseSize('2 GB'), 2 * 1024 ** 3);
  assert.equal(parseSize('700 MB'), 700 * 1024 ** 2);
  assert.equal(parseSize('unknown'), 0);
});

test('normalizes mixed record field conventions', () => {
  const games = normalizeCatalog(rows);
  assert.equal(games.length, 3);
  assert.equal(games[2].name, 'Gamma Mobile');
  assert.equal(games[2].downloadUrl, 'https://example.test/c.apk');
  assert.equal(games[0].extension, 'zip');
});

test('sorts, filters, and searches games', () => {
  const games = normalizeCatalog(rows);
  assert.equal(sortTopRated(games, 2)[0].name, 'Alpha Quest');
  assert.equal(searchGames(games, 'racing')[0].name, 'Beta Racer');
  assert.equal(filterGames(games, { platform: 'mobile' })[0].name, 'Gamma Mobile');
  assert.equal(filterGames(games, { extension: '.zip' })[0].name, 'Alpha Quest');
  assert.equal(sortGames(games, 'title', 'asc')[0].name, 'Alpha Quest');
  assert.equal(sortGames(games, 'size', 'desc')[0].name, 'Alpha Quest');
});

test('uses conditional request and cache on a 304 response', async () => {
  let firstCall = true;
  const fetchImpl = async (_url, options) => {
    if (firstCall) {
      firstCall = false;
      return new Response(JSON.stringify(rows), { status: 200, headers: { etag: 'catalog-v1' } });
    }
    assert.equal(options.headers['If-None-Match'], 'catalog-v1');
    return new Response(null, { status: 304 });
  };
  const first = await syncCatalog({ url: 'https://example.test/catalog.json', force: true, fetchImpl });
  const second = await syncCatalog({ url: 'https://example.test/catalog.json', fetchImpl });
  assert.equal(first.games.length, 3);
  assert.equal(second.games.length, 3);
  assert.equal(second.updated, false);
});
