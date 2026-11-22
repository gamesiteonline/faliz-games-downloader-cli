import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import cliProgress from 'cli-progress';

function safeName(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'download';
}

function filenameFor(game, contentDisposition) {
  const match = contentDisposition?.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (match) return safeName(decodeURIComponent(match[1] ?? match[2]));
  const suffix = game.extension ? `.${game.extension.replace(/^\./, '').toLowerCase()}` : '';
  return safeName(`${game.name}${suffix}`);
}

export async function downloadGame(game, { directory = path.join(process.cwd(), 'faliz-downloads'), fetchImpl = fetch, onProgress = () => {} } = {}) {
  if (!game.downloadUrl) throw new Error('This catalog item does not have a download URL.');
  const url = new URL(game.downloadUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) download URLs are supported.');

  await fsPromises.mkdir(directory, { recursive: true });
  const provisional = path.join(directory, safeName(game.name));
  const existingSize = await fsPromises.stat(provisional).then(stat => stat.size).catch(() => 0);
  const headers = existingSize ? { Range: `bytes=${existingSize}-` } : {};
  let response = await fetchImpl(game.downloadUrl, { headers, redirect: 'follow' });
  let append = existingSize > 0 && response.status === 206;
  if (existingSize > 0 && response.status === 416) {
    return { filePath: provisional, bytes: existingSize, resumed: true, alreadyComplete: true };
  }
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
  if (!append) {
    response = response;
  }
  const total = Number(response.headers.get('content-length') ?? 0) + (append ? existingSize : 0);
  const bar = new cliProgress.SingleBar({ format: ' {bar} {percentage}% | {value}/{total} MB | {speed}/s', barCompleteChar: '█', barIncompleteChar: '░', hideCursor: true }, cliProgress.Presets.shades_classic);
  if (total) bar.start(Math.ceil(total / 1024 / 1024), Math.floor(existingSize / 1024 / 1024));
  let downloaded = existingSize;
  const stream = response.body;
  if (!stream) throw new Error('The server returned an empty response body.');
  const nodeStream = stream[Symbol.asyncIterator] ? stream : null;
  const writer = fs.createWriteStream(provisional, { flags: append ? 'a' : 'w' });
  try {
    for await (const chunk of nodeStream) {
      writer.write(chunk);
      downloaded += chunk.length;
      if (total) bar.update(Math.floor(downloaded / 1024 / 1024));
      onProgress({ downloaded, total });
    }
    await new Promise((resolve, reject) => { writer.end(error => error ? reject(error) : resolve()); });
  } finally {
    if (total) bar.stop();
  }
  const finalName = filenameFor(game, response.headers.get('content-disposition'));
  const finalPath = path.join(directory, finalName);
  if (finalPath !== provisional) await fsPromises.rename(provisional, finalPath).catch(async () => { await fsPromises.copyFile(provisional, finalPath); await fsPromises.unlink(provisional); });
  return { filePath: finalPath, bytes: downloaded, resumed: append, alreadyComplete: false };
}
