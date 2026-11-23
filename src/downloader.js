import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import cliProgress from 'cli-progress';
import ora from 'ora';

export function safeName(value) {
  let name = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f\u001b]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+$/, '')
    .slice(0, 180)
    .trim();
  if (!name || name === '.' || name === '..') return 'download';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i.test(name)) name = `_${name}`;
  return name;
}

export function filenameFor(game, contentDisposition) {
  const match = contentDisposition?.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (match) {
    try { return safeName(decodeURIComponent(match[1] ?? match[2])); } catch { return safeName(match[2] ?? 'download'); }
  }
  const extension = String(game.extension ?? '').replace(/^\./, '').toLowerCase();
  return safeName(`${game.name}${extension ? `.${extension}` : ''}`);
}

export function getDefaultDownloadDirectory() {
  if (process.env.FALIZ_DOWNLOAD_DIR) return process.env.FALIZ_DOWNLOAD_DIR;
  const home = os.homedir();
  if ((process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux')) && fs.existsSync(path.join(home, 'storage', 'downloads'))) return path.join(home, 'storage', 'downloads', 'faliz-games');
  return path.join(home, 'Downloads', 'faliz-games');
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  let amount = value; let unit = 'B';
  for (const next of ['KB', 'MB', 'GB', 'TB']) { amount /= 1024; unit = next; if (amount < 1024) break; }
  return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${unit}`;
}

export function isTransientError(error) {
  return error?.name === 'AbortError' || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(error?.code) || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED', 'EPIPE'].includes(error?.cause?.code);
}

export function retryDelay(attempt) { return Math.min(1000 * 2 ** attempt, 10000) + Math.floor(Math.random() * 100); }
export function checksumMatches(actual, expected) { return !expected || actual.toLowerCase() === String(expected).replace(/^sha256:/i, '').toLowerCase(); }

async function diskPreflight(directory, bytes) {
  if (!bytes || typeof fsPromises.statfs !== 'function') return;
  const stat = await fsPromises.statfs(directory);
  if (stat.bavail * stat.bsize < bytes) throw new Error(`Not enough disk space (need ${formatBytes(bytes)}).`);
}

export async function getDownloadStatus(game, directory = getDefaultDownloadDirectory()) {
  const finalPath = path.join(directory, filenameFor(game));
  const partialPath = `${finalPath}.part`;
  const [final, partial] = await Promise.all([fsPromises.stat(finalPath).catch(() => null), fsPromises.stat(partialPath).catch(() => null)]);
  if (final) return { state: 'downloaded', bytes: final.size, filePath: finalPath };
  if (partial) return { state: 'partial', bytes: partial.size, filePath: partialPath };
  return { state: 'not-downloaded', bytes: 0, filePath: finalPath };
}

function makeProgress(total, start, label) {
  return new cliProgress.SingleBar({ format: ` ${label} {bar} {percentage}% | {value}/{total} | {speed}/s | ETA {eta_formatted} | {status}`, barCompleteChar: '█', barIncompleteChar: '░', hideCursor: true, stopOnComplete: true, clearOnComplete: false }, cliProgress.Presets.shades_classic).start(total, start, { speed: '0 B', status: 'P pause · C cancel' });
}

function controls(toggle, cancel) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') return () => {};
  const data = chunk => { const key = chunk.toString().toLowerCase(); if (key === 'p' || key === ' ') toggle(); if (key === 'c' || key === '\u0003') cancel(); };
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', data);
  return () => { process.stdin.off('data', data); process.stdin.setRawMode(false); process.stdin.pause(); };
}

function mergeSignals(...signals) {
  const active = signals.filter(Boolean);
  if (!active.length) return undefined;
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active);
  const controller = new AbortController(); const abort = () => controller.abort();
  for (const signal of active) { if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }); }
  return controller.signal;
}

async function fetchWithRetry(url, options, { retryCount, timeoutMs, fetchImpl }) {
  let last;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const timeout = new AbortController(); const timer = setTimeout(() => timeout.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: mergeSignals(options.signal, timeout.signal) });
      if ((response.status >= 500 || response.status === 429) && attempt < retryCount) { last = new Error(`Download failed with HTTP ${response.status}`); await new Promise(resolve => setTimeout(resolve, retryDelay(attempt))); continue; }
      return response;
    } catch (error) {
      last = error;
      if (attempt >= retryCount || (!isTransientError(error) && error?.name !== 'AbortError')) throw error;
      await new Promise(resolve => setTimeout(resolve, retryDelay(attempt)));
    } finally { clearTimeout(timer); }
  }
  throw last;
}

async function nextChunk(reader, timeoutMs, signal) {
  if (!timeoutMs) return reader.read();
  let timer;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Download stalled; retrying from the partial file.'), { code: 'ETIMEDOUT' })), timeoutMs); }),
      ...(signal ? [new Promise((_, reject) => { if (signal.aborted) reject(Object.assign(new Error('Download canceled.'), { name: 'AbortError' })); else signal.addEventListener('abort', () => reject(Object.assign(new Error('Download canceled.'), { name: 'AbortError' })), { once: true }); })] : []),
    ]);
  } finally { clearTimeout(timer); }
}

async function sha256(file) {
  return new Promise((resolve, reject) => { const hash = crypto.createHash('sha256'); const stream = fs.createReadStream(file); stream.on('data', chunk => hash.update(chunk)); stream.on('error', reject); stream.on('end', () => resolve(hash.digest('hex'))); });
}

async function verifyPartial(file, checksum) {
  if (!checksum) return true;
  const actual = await sha256(file);
  if (!checksumMatches(actual, checksum)) { await fsPromises.unlink(file).catch(() => {}); throw new Error(`SHA-256 checksum mismatch; corrupt partial data was deleted (expected ${checksum}, got ${actual}).`); }
  return true;
}

export async function downloadGame(game, { directory = getDefaultDownloadDirectory(), fetchImpl = fetch, onProgress = () => {}, signal: externalSignal, retryCount = 2, requestTimeoutMs = 30000, stallTimeoutMs = Math.max(10000, requestTimeoutMs), onWarning = () => {}, showProgress = true } = {}) {
  if (!game.downloadUrl) throw new Error('This catalog item does not have a download URL.');
  const url = new URL(game.downloadUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) download URLs are supported.');
  if (url.protocol === 'http:') onWarning('This download uses plain HTTP. Verify that the source is trusted.');
  if (!game.checksum) onWarning('This entry has no SHA-256 checksum; the file cannot be integrity-verified.');
  await fsPromises.mkdir(directory, { recursive: true });
  const finalPath = path.join(directory, filenameFor(game)); const partialPath = `${finalPath}.part`;
  const existing = await fsPromises.stat(partialPath).then(stat => stat.size).catch(() => 0);
  await diskPreflight(directory, Math.max(0, (game.sizeBytes || 0) - existing));
  const controller = new AbortController(); const abort = () => controller.abort();
  if (externalSignal?.aborted) abort(); else externalSignal?.addEventListener('abort', abort, { once: true });
  process.once('SIGINT', abort);
  try {
    const response = await fetchWithRetry(game.downloadUrl, { headers: existing ? { Range: `bytes=${existing}-` } : {}, redirect: 'follow', signal: controller.signal }, { retryCount, timeoutMs: requestTimeoutMs, fetchImpl });
    if (existing && response.status === 416) {
      const range = response.headers.get('content-range') || ''; const total = Number(range.match(/\/(\d+)/)?.[1] || 0);
      if (!total || total !== existing || (game.sizeBytes && game.sizeBytes !== total)) throw new Error('Unsafe 416 response; partial file was preserved and not promoted.');
      await verifyPartial(partialPath, game.checksum); await fsPromises.rename(partialPath, finalPath);
      return { filePath: finalPath, bytes: existing, resumed: true, alreadyComplete: true };
    }
    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
    const append = existing > 0 && response.status === 206; const start = append ? existing : 0;
    const total = Number(response.headers.get('content-length') || 0) + start;
    await diskPreflight(directory, Math.max(0, (total || game.sizeBytes || 0) - existing));
    const label = safeName(game.name).slice(0, 24).padEnd(24); const bar = showProgress && total ? makeProgress(total, start, label) : null; const spinner = showProgress && !total ? ora({ text: `${label.trim()} downloading · P pause · C cancel`, color: 'cyan' }).start() : null;
    const writer = fs.createWriteStream(partialPath, { flags: append ? 'a' : 'w' });
    let downloaded = start; let last = Date.now(); let lastBytes = start; let paused = false; let waiter = null;
    const wake = () => { if (waiter) { const resolve = waiter; waiter = null; resolve(); } };
    const toggle = () => { paused = !paused; if (!paused) wake(); };
    const cancel = () => { controller.abort(); wake(); };
    const waitIfPaused = () => paused ? new Promise(resolve => { waiter = resolve; if (controller.signal.aborted) { waiter = null; resolve(); } }) : Promise.resolve();
    const disable = controls(toggle, cancel);
    try {
      if (!response.body) throw new Error('The server returned an empty response body.');
      const reader = response.body.getReader();
      while (true) {
        const part = await nextChunk(reader, stallTimeoutMs, controller.signal);
        if (part.done) break;
        if (controller.signal.aborted) throw Object.assign(new Error('Download canceled; partial data was preserved for resume.'), { name: 'AbortError' });
        await waitIfPaused();
        if (!writer.write(part.value)) await once(writer, 'drain');
        downloaded += part.value.length;
        const now = Date.now();
        if (now - last >= 100 || !total) { const speed = (downloaded - lastBytes) / Math.max((now - last) / 1000, 0.001); bar?.update(downloaded, { speed: formatBytes(speed), status: paused ? 'PAUSED' : 'P pause · C cancel' }); if (spinner) spinner.text = `${label.trim()} ${formatBytes(downloaded)} · ${formatBytes(speed)}/s`; onProgress({ downloaded, total, speed }); last = now; lastBytes = downloaded; }
      }
      await new Promise((resolve, reject) => writer.end(error => error ? reject(error) : resolve()));
    } finally { disable(); bar?.stop(); spinner?.stop(); }
    await verifyPartial(partialPath, game.checksum);
    await fsPromises.rename(partialPath, finalPath).catch(async () => { await fsPromises.copyFile(partialPath, finalPath); await fsPromises.unlink(partialPath); });
    return { filePath: finalPath, bytes: downloaded, resumed: append, alreadyComplete: false };
  } catch (error) {
    if (error?.name === 'AbortError' || controller.signal.aborted) throw new Error('Download interrupted; partial data was preserved for resume.');
    throw error;
  } finally { process.removeListener('SIGINT', abort); externalSignal?.removeEventListener('abort', abort); }
}
