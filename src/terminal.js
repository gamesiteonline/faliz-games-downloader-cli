const CSI = '\u001b[';

export function capabilities(stream = process.stdout, env = process.env) {
  const tty = Boolean(stream?.isTTY);
  const noColor = 'NO_COLOR' in env || env.TERM === 'dumb' || env.FALIZ_NO_COLOR === '1';
  const color = tty && !noColor;
  const background = color && env.FALIZ_NO_BACKGROUND !== '1' && env.TERM !== 'dumb';
  return { tty, color, background, alternateScreen: tty, width: Number(stream?.columns) || 80, height: Number(stream?.rows) || 24 };
}

export function escapeSequence(name) {
  return {
    clear: `${CSI}2J${CSI}H`,
    hideCursor: `${CSI}?25l`,
    showCursor: `${CSI}?25h`,
    enterAlt: `${CSI}?1049h`,
    leaveAlt: `${CSI}?1049l`,
  }[name] || '';
}

export function backgroundSequence(enabled) {
  return enabled ? '\u001b]11;#2b1026\u0007' : '';
}

export function parseKeys(chunk) {
  const value = String(chunk ?? '');
  if (value.includes('\u0003')) return ['ctrl-c'];
  const keys = [];
  const re = /(\u001b\[[0-9;?]*[A-Za-z~]|\u001bO[A-Za-z]|\r|\n|\u007f|\b|.)/gs;
  for (const match of value.matchAll(re)) keys.push(match[1]);
  return keys;
}

/** Consume complete key tokens while retaining a split escape sequence for the next stdin chunk. */
export function consumeKeys(chunk, carry = '') {
  const value = `${carry}${String(chunk ?? '')}`;
  const keys = [];
  let i = 0;
  while (i < value.length) {
    const start = i;
    const code = value.charCodeAt(i);
    if (code === 0x1b) {
      if (i + 1 >= value.length) return { keys, rest: value.slice(start) };
      const next = value[i + 1];
      if (next === '[') {
        let end = i + 2;
        while (end < value.length && !(/[A-Za-z~]/.test(value[end]))) end += 1;
        if (end >= value.length) return { keys, rest: value.slice(start) };
        keys.push(value.slice(start, end + 1));
        i = end + 1;
        continue;
      }
      if (next === 'O') {
        if (i + 2 >= value.length) return { keys, rest: value.slice(start) };
        keys.push(value.slice(start, i + 3));
        i += 3;
        continue;
      }
      keys.push(value.slice(start, start + 1));
      i += 1;
      continue;
    }
    if (code === 0x03) { keys.push('ctrl-c'); i += 1; continue; }
    if (code === 0x0d || code === 0x0a || code === 0x7f || code === 0x08) { keys.push(value.slice(start, start + 1)); i += 1; continue; }
    const point = value.codePointAt(i);
    const char = String.fromCodePoint(point);
    keys.push(char);
    i += char.length;
  }
  return { keys, rest: '' };
}

export function arrowDirection(key) {
  const direct = { '\u001b[A': 'up', '\u001bOA': 'up', '\u001b[B': 'down', '\u001bOB': 'down', '\u001b[C': 'right', '\u001bOC': 'right', '\u001b[D': 'left', '\u001bOD': 'left' }[key];
  if (direct) return direct;
  return /^\u001b\[[0-9;?]*A$/.test(key) ? 'up' : /^\u001b\[[0-9;?]*B$/.test(key) ? 'down' : /^\u001b\[[0-9;?]*C$/.test(key) ? 'right' : /^\u001b\[[0-9;?]*D$/.test(key) ? 'left' : null;
}

export function createTerminalGuard({ input = process.stdin, output = process.stdout } = {}) {
  const caps = capabilities(output);
  let entered = false;
  let cleaned = false;
  const cleanups = new Set();
  return {
    caps,
    enter() {
      if (entered || !caps.tty) return;
      entered = true;
      output.write(`${caps.alternateScreen ? escapeSequence('enterAlt') : ''}${escapeSequence('hideCursor')}${backgroundSequence(caps.background)}`);
    },
    addCleanup(fn) { cleanups.add(fn); return () => cleanups.delete(fn); },
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      for (const fn of cleanups) { try { fn(); } catch {} }
      if (entered) output.write(`${escapeSequence('showCursor')}${caps.background ? '\u001b]11;default\u0007' : ''}${caps.alternateScreen ? escapeSequence('leaveAlt') : ''}`);
      if (input.isTTY && typeof input.setRawMode === 'function') input.setRawMode(false);
      input.pause();
    },
  };
}
