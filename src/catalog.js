import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/gamesiteonline/game-database/main/Master_Game_Database.json';
const APP_DIR = path.join(os.homedir(), '.faliz-games');
const CACHE_FILE = path.join(APP_DIR, 'catalog.json');
const META_FILE = path.join(APP_DIR, 'catalog-meta.json');

export function parseRating(value) {
  const match = String(value ?? '').match(/[0-9]+(?:[.,][0-9]+)?/);
  return match ? Number(match[0].replace(',', '.')) : 0;
}

export function normalizeGame(raw, index = 0) {
  const name = raw?.FileName ?? raw?.name ?? raw?.title ?? `Untitled game ${index + 1}`;
  const downloadUrl = raw?.DownloadLink ?? raw?.download_link ?? raw?.downloadUrl ?? '';
  return {
    id: String(raw?.GameID ?? raw?.game_id ?? raw?.id ?? `${name}-${index}`),
    name: String(name),
    platform: String(raw?.Platform ?? raw?.platform ?? 'Unknown'),
    genre: String(raw?.Genre ?? raw?.genre ?? 'General'),
    rating: parseRating(raw?.Rating ?? raw?.rating),
    ratingLabel: String(raw?.Rating ?? raw?.rating ?? 'Not rated'),
    size: String(raw?.Size ?? raw?.size ?? 'Unknown size'),
    extension: String(raw?.Extension ?? raw?.extension ?? ''),
    description: String(raw?.Description ?? raw?.description ?? ''),
    compatibility: String(raw?.Compatibility ?? raw?.compatibility ?? ''),
    downloadUrl: String(downloadUrl),
    coverArtUrl: String(raw?.CoverArtLink ?? raw?.coverArtUrl ?? ''),
  };
}

export function normalizeCatalog(payload) {
  const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.games) ? payload.games : []);
  const seen = new Set();
  return rows.map((row, index) => normalizeGame(row, index)).filter(game => {
    if (seen.has(game.id)) return false;
    seen.add(game.id);
    return true;
  });
}

export function sortTopRated(games, limit = 100) {
  return [...games].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name)).slice(0, limit);
}

export function searchGames(games, query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return games;
  return games.filter(game => [game.name, game.platform, game.genre, game.extension].join(' ').toLocaleLowerCase().includes(normalized));
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

export async function syncCatalog({ url = process.env.FALIZ_CATALOG_URL || DEFAULT_CATALOG_URL, force = false, fetchImpl = fetch } = {}) {
  await fs.mkdir(APP_DIR, { recursive: true });
  const previousMeta = await readJson(META_FILE) ?? {};
  const headers = {};
  if (!force && previousMeta.etag) headers['If-None-Match'] = previousMeta.etag;
  if (!force && previousMeta.lastModified) headers['If-Modified-Since'] = previousMeta.lastModified;

  let response;
  try {
    response = await fetchImpl(url, { headers });
  } catch (error) {
    const cached = await readJson(CACHE_FILE);
    if (cached) return { games: normalizeCatalog(cached), updated: false, offline: true, source: 'cache' };
    throw new Error(`Catalog unavailable and no local cache exists: ${error.message}`);
  }

  if (response.status === 304) {
    const cached = await readJson(CACHE_FILE);
    if (cached) return { games: normalizeCatalog(cached), updated: false, offline: false, source: 'cache' };
  }
  if (!response.ok) throw new Error(`Catalog request failed with HTTP ${response.status}`);

  const payload = await response.json();
  const games = normalizeCatalog(payload);
  if (!games.length) throw new Error('The catalog response contained no recognizable games.');
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload));
  await fs.writeFile(META_FILE, JSON.stringify({ etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'), syncedAt: new Date().toISOString(), url }, null, 2));
  return { games, updated: true, offline: false, source: 'network' };
}

export function getCachePaths() { return { APP_DIR, CACHE_FILE, META_FILE }; }
