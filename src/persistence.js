import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const APP_DIR = path.join(os.homedir(), '.faliz-games');
export const DEFAULT_SETTINGS = Object.freeze({
  downloadDirectory: '',
  maxConcurrentDownloads: 1,
  catalogUrl: '',
  retryCount: 2,
  requestTimeoutMs: 30000,
  animation: true,
});
const files = {
  settings: 'settings.json', favorites: 'favorites.json', wishlist: 'wishlist.json',
  recentlyViewed: 'recently-viewed.json', downloadHistory: 'download-history.json', library: 'library.json',
};
const filePath = key => path.join(APP_DIR, files[key]);
async function read(key, fallback) { try { return JSON.parse(await fs.readFile(filePath(key), 'utf8')); } catch { return fallback; } }
async function write(key, value) { await fs.mkdir(APP_DIR, { recursive: true }); const temp = `${filePath(key)}.tmp`; await fs.writeFile(temp, JSON.stringify(value, null, 2)); await fs.rename(temp, filePath(key)); return value; }
export async function loadSettings() { return { ...DEFAULT_SETTINGS, ...(await read('settings', {})) }; }
export async function saveSettings(patch) { return write('settings', { ...(await loadSettings()), ...patch }); }
export async function loadCollection(key) { return read(key, []); }
export async function toggleCollection(key, gameId) { const values = await loadCollection(key); const next = values.includes(String(gameId)) ? values.filter(id => id !== String(gameId)) : [...values, String(gameId)]; await write(key, next); return next; }
export async function addRecentlyViewed(game) { const values = (await loadCollection('recentlyViewed')).filter(item => item.id !== game.id); values.unshift({ id: game.id, name: game.name, viewedAt: new Date().toISOString() }); return write('recentlyViewed', values.slice(0, 50)); }
export async function recordDownload(entry) { const history = await loadCollection('downloadHistory'); history.unshift({ ...entry, completedAt: entry.completedAt ?? new Date().toISOString() }); await write('downloadHistory', history.slice(0, 200)); return history[0]; }
export async function upsertLibrary(entry) { const library = await loadCollection('library'); const next = library.filter(item => item.id !== entry.id); next.unshift({ ...entry, indexedAt: new Date().toISOString() }); await write('library', next); return next[0]; }
export function getPersistencePaths() { return { APP_DIR, ...Object.fromEntries(Object.entries(files).map(([key, name]) => [key, path.join(APP_DIR, name)])) }; }
export async function resetPersistence() { await fs.rm(APP_DIR, { recursive: true, force: true }); }
