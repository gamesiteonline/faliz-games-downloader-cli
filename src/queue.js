import { createControl, downloadGame } from './downloader.js';

const ACTIVE = new Set(['queued', 'downloading', 'paused']);

/** A terminal-safe download queue with per-item progress and controls. */
export class DownloadQueue {
  constructor({ concurrency = 1, downloader = downloadGame, getOptions = () => ({}), onChange } = {}) {
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.downloader = downloader;
    this.getOptions = getOptions;
    this.items = [];
    this.running = 0;
    this.seq = 0;
    this.listeners = new Set(onChange ? [onChange] : []);
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { const snapshot = this.status(); for (const fn of this.listeners) fn(snapshot); }
  find(id) { return this.items.find(item => item.id === id); }

  add(games) {
    const added = [];
    for (const game of [].concat(games)) {
      if (!game || this.items.some(item => item.game.id === game.id && ACTIVE.has(item.state))) continue;
      const item = this.blank(game);
      this.items.push(item);
      added.push(item);
    }
    if (added.length) { this.emit(); this.pump(); }
    return added;
  }

  blank(game) {
    return { id: ++this.seq, game, state: 'queued', phase: '', downloaded: 0, total: game.sizeBytes || 0, speed: 0, eta: null, error: null, result: null, control: null };
  }

  pause(id) { if (id === undefined) return this.pauseAll(); const item = this.find(id); if (item?.state !== 'downloading') return false; item.control?.pause(); item.state = 'paused'; item.speed = 0; this.emit(); return true; }
  resume(id) { if (id === undefined) return this.resumeAll(); const item = this.find(id); if (item?.state !== 'paused') return false; item.control?.resume(); item.state = 'downloading'; this.emit(); return true; }
  toggle(id) { const item = this.find(id); return item?.state === 'paused' ? this.resume(id) : this.pause(id); }
  cancel(id) {
    if (id === undefined) return this.cancelAll();
    const item = this.find(id);
    if (!item) return false;
    if (item.state === 'queued') { item.state = 'canceled'; this.emit(); }
    else if (item.state === 'downloading' || item.state === 'paused') { item.cancelRequested = true; item.control?.cancel(); }
    return true;
  }
  retry(id) {
    const item = this.find(id);
    if (!item || !['failed', 'canceled'].includes(item.state)) return false;
    Object.assign(item, this.blank(item.game), { id: item.id });
    this.emit(); this.pump(); return true;
  }
  pauseAll() { for (const item of this.items) this.pause(item.id); }
  resumeAll() { for (const item of this.items) this.resume(item.id); }
  cancelAll() { for (const item of this.items) this.cancel(item.id); }
  clearFinished() { this.items = this.items.filter(item => ACTIVE.has(item.state)); this.emit(); }
  activeCount() { return this.items.filter(item => ACTIVE.has(item.state)).length; }
  status() { return this.items.map(({ control, ...item }) => ({ ...item })); }

  setConcurrency(value) { this.concurrency = Math.max(1, Number(value) || 1); this.pump(); }
  pump() {
    while (this.running < this.concurrency) {
      const next = this.items.find(item => item.state === 'queued');
      if (!next) break;
      this.run(next);
    }
  }

  async run(item) {
    this.running += 1;
    item.control = createControl();
    item.state = 'downloading';
    this.emit();
    try {
      item.result = await this.downloader(item.game, {
        ...this.getOptions(),
        control: item.control,
        onProgress: progress => {
          item.phase = progress.state === 'downloading' ? '' : (progress.state || '');
          item.downloaded = progress.downloaded ?? item.downloaded;
          item.total = progress.total || item.total;
          item.speed = item.state === 'paused' ? 0 : progress.speed ?? 0;
          item.eta = progress.eta ?? null;
          this.emit();
        },
      });
      item.state = item.cancelRequested ? 'canceled' : 'completed';
      item.downloaded = item.result?.bytes ?? item.total;
      item.total = item.downloaded || item.total;
      item.speed = 0;
      item.phase = '';
    } catch (error) {
      item.error = error;
      item.state = error?.name === 'DownloadCanceled' ? 'canceled' : 'failed';
      item.phase = '';
      item.speed = 0;
    } finally {
      this.running -= 1;
      item.control = null;
      this.emit();
      this.pump();
    }
  }

  async done() {
    while (this.activeCount() > 0) await new Promise(resolve => setTimeout(resolve, 15));
    return this.status();
  }
}
