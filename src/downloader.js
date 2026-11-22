import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import cliProgress from 'cli-progress';
import ora from 'ora';

function safeName(value) {
  return String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'download';
}

function filenameFor(game, contentDisposition) {
  const match = contentDisposition?.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (match) return safeName(decodeURIComponent(match[1] ?? match[2]));
  const suffix = game.extension ? `.${game.extension.replace(/^\./, '').toLowerCase()}` : '';
  return safeName(`${game.name}${suffix}`);
}

export function getDefaultDownloadDirectory() {
  const home = os.homedir();
  const candidates = [];
  if (process.env.FALIZ_DOWNLOAD_DIR) return process.env.FALIZ_DOWNLOAD_DIR;
  if (process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux')) {
    const sharedDownloads = path.join(home, 'storage', 'downloads');
    if (fs.existsSync(sharedDownloads)) candidates.push(path.join(sharedDownloads, 'faliz-games'));
  }
  candidates.push(path.join(home, 'Downloads', 'faliz-games'));
  candidates.push(path.join(process.cwd(), 'faliz-downloads'));
  return candidates[0];
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let unit = 'B';
  for (const next of units) {
    amount /= 1024;
    unit = next;
    if (amount < 1024) break;
  }
  return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${unit}`;
}

export async function getDownloadStatus(game, directory = getDefaultDownloadDirectory()) {
  const finalPath = path.join(directory, filenameFor(game));
  const partialPath = `${finalPath}.part`;
  const [finalStat, partialStat] = await Promise.all([
    fsPromises.stat(finalPath).catch(() => null),
    fsPromises.stat(partialPath).catch(() => null),
  ]);
  if (finalStat) return { state: 'downloaded', bytes: finalStat.size, filePath: finalPath };
  if (partialStat) return { state: 'partial', bytes: partialStat.size, filePath: partialPath };
  return { state: 'not-downloaded', bytes: 0, filePath: finalPath };
}

function makeProgress(total, start, label) {
  return new cliProgress.SingleBar({
    format: ` ${label} {bar} {percentage}% | {value}/{total} | {speed}/s | ETA {eta_formatted}`,
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    stopOnComplete: true,
    clearOnComplete: false,
  }, cliProgress.Presets.shades_classic).start(total, start, { speed: '0 B' });
}

export async function downloadGame(game, {
  directory = getDefaultDownloadDirectory(),
  fetchImpl = fetch,
  onProgress = () => {},
  signal: externalSignal,
} = {}) {
  if (!game.downloadUrl) throw new Error('This catalog item does not have a download URL.');
  const url = new URL(game.downloadUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) download URLs are supported.');

  await fsPromises.mkdir(directory, { recursive: true });
  const baseName = filenameFor(game);
  const finalPath = path.join(directory, baseName);
  const partialPath = `${finalPath}.part`;
  const existingSize = await fsPromises.stat(partialPath).then(stat => stat.size).catch(() => 0);
  const controller = new AbortController();
  const abort = () => controller.abort();
  const onSigint = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abort, { once: true });
  }
  process.once('SIGINT', onSigint);

  let response;
  let append = false;
  try {
    response = await fetchImpl(game.downloadUrl, {
      headers: existingSize ? { Range: `bytes=${existingSize}-` } : {},
      redirect: 'follow',
      signal: controller.signal,
    });
    append = existingSize > 0 && response.status === 206;
    if (existingSize > 0 && response.status === 416) {
      await fsPromises.rename(partialPath, finalPath).catch(() => {});
      return { filePath: finalPath, bytes: existingSize, resumed: true, alreadyComplete: true };
    }
    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
    const startingBytes = append ? existingSize : 0;
    const total = Number(response.headers.get('content-length') ?? 0) + startingBytes;
    const label = safeName(game.name).slice(0, 24).padEnd(24);
    const bar = total ? makeProgress(total, startingBytes, label) : null;
    const spinner = total ? null : ora({ text: `${label.trim()}  ${formatBytes(startingBytes)} downloaded · calculating speed…`, color: 'cyan' }).start();
    const writer = fs.createWriteStream(partialPath, { flags: append ? 'a' : 'w' });
    let downloaded = startingBytes;
    let lastUpdate = Date.now();
    let lastBytes = downloaded;
    let speed = 0;
    try {
      if (!response.body) throw new Error('The server returned an empty response body.');
      for await (const chunk of response.body) {
        if (controller.signal.aborted) throw new Error('Download interrupted; partial data was preserved for resume.');
        if (!writer.write(chunk)) await once(writer, 'drain');
        downloaded += chunk.length;
        const now = Date.now();
        if (now - lastUpdate >= 100 || !total) {
          speed = (downloaded - lastBytes) / Math.max((now - lastUpdate) / 1000, 0.001);
          if (bar) bar.update(downloaded, { speed: formatBytes(speed) });
          if (spinner) spinner.text = `${label.trim()}  ${formatBytes(downloaded)} downloaded · ${formatBytes(speed)}/s`;
          onProgress({ downloaded, total, speed });
          lastUpdate = now;
          lastBytes = downloaded;
        }
      }
      await new Promise((resolve, reject) => writer.end(error => error ? reject(error) : resolve()));
    } catch (error) {
      writer.destroy();
      throw error;
    } finally {
      if (bar) bar.stop();
      if (spinner) spinner.stop();
    }

    await fsPromises.rename(partialPath, finalPath).catch(async () => {
      await fsPromises.copyFile(partialPath, finalPath);
      await fsPromises.unlink(partialPath);
    });
    return { filePath: finalPath, bytes: downloaded, resumed: append, alreadyComplete: false, speed };
  } catch (error) {
    if (error.name === 'AbortError' || controller.signal.aborted) {
      throw new Error('Download interrupted; partial data was preserved for resume.');
    }
    throw error;
  } finally {
    process.removeListener('SIGINT', onSigint);
    externalSignal?.removeEventListener('abort', abort);
  }
}
