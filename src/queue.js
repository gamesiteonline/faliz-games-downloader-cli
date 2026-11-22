import { downloadGame } from './downloader.js';
export class DownloadQueue {
  constructor({ concurrency = 1, downloader = downloadGame, onChange = () => {} } = {}) { this.concurrency = Math.max(1, Number(concurrency) || 1); this.downloader = downloader; this.onChange = onChange; this.items = []; this.running = 0; this.paused = false; this.cancelled = false; }
  add(games) { for (const game of games) this.items.push({ game, state: 'queued' }); this.emit(); this.pump(); return this.items; }
  pause() { this.paused = true; this.emit(); }
  resume() { this.paused = false; this.emit(); this.pump(); }
  cancel() { this.cancelled = true; for (const item of this.items.filter(x => x.state === 'queued')) item.state = 'canceled'; this.emit(); }
  status() { return this.items.map(item => ({ game: item.game, state: item.state, result: item.result, error: item.error })); }
  emit() { this.onChange(this.status()); }
  pump() { while (!this.paused && !this.cancelled && this.running < this.concurrency) { const item = this.items.find(x => x.state === 'queued'); if (!item) break; this.run(item); } }
  async run(item) { this.running++; item.state = 'downloading'; this.emit(); try { item.result = await this.downloader(item.game); item.state = 'completed'; } catch (error) { item.error = error; item.state = 'failed'; } finally { this.running--; this.emit(); this.pump(); } }
  async done() { while (this.items.some(item => ['queued', 'downloading'].includes(item.state))) await new Promise(resolve => setTimeout(resolve, 25)); return this.status(); }
}
