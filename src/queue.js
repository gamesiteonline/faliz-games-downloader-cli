import { downloadGame } from './downloader.js';

export class DownloadQueue {
  constructor({ concurrency = 1, downloader = downloadGame, onChange = () => {} } = {}) {
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.downloader = downloader;
    this.onChange = onChange;
    this.items = [];
    this.running = 0;
    this.paused = false;
    this.cancelled = false;
  }

  add(games) {
    for (const game of games) this.items.push({ game, state: 'queued', controller: null });
    this.emit(); this.pump(); return this.items;
  }

  pause() {
    this.paused = true;
    for (const item of this.items.filter(entry => entry.state === 'downloading')) { item.pauseRequested = true; item.controller?.abort(); }
    for (const item of this.items.filter(entry => entry.state === 'queued')) item.state = 'paused';
    this.emit();
  }

  resume() {
    this.paused = false;
    for (const item of this.items.filter(entry => entry.state === 'paused')) item.state = 'queued';
    this.emit(); this.pump();
  }

  cancel() {
    this.cancelled = true;
    for (const item of this.items.filter(entry => ['queued', 'paused'].includes(entry.state))) item.state = 'canceled';
    for (const item of this.items.filter(entry => item.state === 'downloading')) { item.cancelRequested = true; item.controller?.abort(); }
    this.emit();
  }

  retry(itemOrGame) {
    const item = this.items.find(entry => entry === itemOrGame || entry.game === itemOrGame || entry.game.id === itemOrGame?.id);
    if (!item || !['failed', 'canceled'].includes(item.state)) return false;
    item.state = 'queued'; item.error = undefined; item.cancelRequested = false; this.cancelled = false; this.emit(); this.pump(); return true;
  }

  clearFinished() { this.items = this.items.filter(item => !['completed', 'canceled'].includes(item.state)); this.emit(); }
  status() { return this.items.map(item => ({ game: item.game, state: item.state, result: item.result, error: item.error })); }
  emit() { this.onChange(this.status()); }

  pump() {
    while (!this.paused && !this.cancelled && this.running < this.concurrency) {
      const item = this.items.find(entry => entry.state === 'queued');
      if (!item) break;
      this.run(item);
    }
  }

  async run(item) {
    this.running += 1; item.state = 'downloading'; item.controller = new AbortController(); this.emit();
    try {
      item.result = await this.downloader(item.game, { signal: item.controller.signal });
      item.state = 'completed';
    } catch (error) {
      item.error = error;
      item.state = item.pauseRequested ? 'paused' : item.cancelRequested || this.cancelled ? 'canceled' : 'failed';
      item.pauseRequested = false;
    } finally {
      item.controller = null; this.running -= 1; this.emit(); this.pump();
    }
  }

  async done() {
    while (this.items.some(item => ['queued', 'downloading', 'paused'].includes(item.state))) await new Promise(resolve => setTimeout(resolve, 25));
    return this.status();
  }
}
