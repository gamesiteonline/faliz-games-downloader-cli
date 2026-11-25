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

export function arrowDirection(key) {
  return { '\u001b[A': 'up', '\u001bOA': 'up', '\u001b[B': 'down', '\u001bOB': 'down', '\u001b[C': 'right', '\u001bOC': 'right', '\u001b[D': 'left', '\u001bOD': 'left' }[key] || null;
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
