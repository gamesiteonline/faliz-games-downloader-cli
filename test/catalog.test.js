import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCatalog, parseRating, searchGames, sortTopRated, syncCatalog } from '../src/catalog.js';

const rows = [
  { GameID: 'a', FileName: 'Alpha Quest', Rating: '9.4/10', Platform: 'PC', Genre: 'RPG', DownloadLink: 'https://example.test/a.zip' },
  { GameID: 'b', FileName: 'Beta Racer', Rating: '8.2/10', Platform: 'Console', Genre: 'Racing', DownloadLink: 'https://example.test/b.zip' },
  { game_id: 'c', name: 'Gamma Mobile', rating: 7.5, platform: 'Mobile', download_link: 'https://example.test/c.apk' },
];

test('parses common rating formats', () => {
  assert.equal(parseRating('9.4/10'), 9.4);
  assert.equal(parseRating('8,2'), 8.2);
  assert.equal(parseRating('unknown'), 0);
});

test('normalizes mixed record field conventions', () => {
  const games = normalizeCatalog(rows);
  assert.equal(games.length, 3);
  assert.equal(games[2].name, 'Gamma Mobile');
  assert.equal(games[2].downloadUrl, 'https://example.test/c.apk');
});

test('sorts and searches games', () => {
  const games = normalizeCatalog(rows);
  assert.equal(sortTopRated(games, 2)[0].name, 'Alpha Quest');
  assert.equal(searchGames(games, 'racing')[0].name, 'Beta Racer');
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
