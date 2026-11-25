import test from 'node:test';
import assert from 'node:assert/strict';
import { DownloadQueue } from '../src/queue.js';
import { DownloadCanceled, createControl } from '../src/downloader.js';
import { capabilities, parseKeys, arrowDirection } from '../src/terminal.js';

const game = { id: 'g1', name: 'Test Game', sizeBytes: 100 };

test('terminal helpers normalize common Termux and plain-terminal input', () => {
  assert.deepEqual(parseKeys('\u001bOA\u001b[B\r'), ['\u001bOA', '\u001b[B', '\r']);
  assert.equal(arrowDirection('\u001bOA'), 'up');
  assert.equal(arrowDirection('\u001bOB'), 'down');
  assert.equal(capabilities({ isTTY: false }, { TERM: 'xterm' }).color, false);
  assert.equal(capabilities({ isTTY: true }, { TERM: 'dumb' }).background, false);
});

test('queue exposes progress and per-item pause/resume/cancel controls', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queue = new DownloadQueue({ downloader: async (_game, options) => {
    options.onProgress({ downloaded: 25, total: 100, speed: 10 });
    await gate;
    return { filePath: '/tmp/test-game', bytes: 100, verified: true };
  } });
  const [item] = queue.add(game);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(queue.find(item.id).state, 'downloading');
  assert.equal(queue.find(item.id).downloaded, 25);
  assert.equal(queue.pause(item.id), true);
  assert.equal(queue.find(item.id).state, 'paused');
  assert.equal(queue.resume(item.id), true);
  assert.equal(queue.find(item.id).state, 'downloading');
  queue.cancel(item.id);
  release();
  const result = await queue.done();
  assert.equal(result[0].state, 'canceled');
});

test('control cancellation is explicit and typed', () => {
  const control = createControl();
  control.cancel();
  assert.equal(control.canceled, true);
  const error = new DownloadCanceled();
  assert.equal(error.name, 'DownloadCanceled');
});
