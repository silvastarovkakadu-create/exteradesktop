const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');
const path = require('path');

/** Ищет рабочий Python 3 (заглушка Microsoft Store не подходит). */
function findPython() {
  const cands = [['py', ['-3']], ['python', []], ['python3', []]];
  for (const [cmd, pre] of cands) {
    try {
      const r = spawnSync(cmd, [...pre, '-c', 'import sys;print(sys.version_info[0])'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
      if (r.status === 0 && r.stdout.trim() === '3') return { cmd, pre };
    } catch {}
  }
  return null;
}

/** Python-процесс, исполняющий плагины exteraGram (.plugin). */
class PyHost extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir || path.join(__dirname, '..', 'pybridge');
    this.proc = null; this.error = null; this.seq = 0; this.waiting = new Map();
  }

  start() {
    if (this.proc) return true;
    const py = findPython();
    if (!py) {
      this.error = 'Python 3 не найден. Установи его с python.org (отметь «Add to PATH») и перезапусти приложение.';
      return false;
    }
    const dir = this.dir;
    this.proc = spawn(py.cmd, [...py.pre, '-u', path.join(dir, 'host.py')], {
      cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    readline.createInterface({ input: this.proc.stdout }).on('line', (line) => {
      let m; try { m = JSON.parse(line); } catch { return console.log('[py]', line); }
      if (m.id !== undefined && this.waiting.has(m.id)) {
        const w = this.waiting.get(m.id); this.waiting.delete(m.id); clearTimeout(w.t);
        if (m.error) w.rej(new Error(m.error)); else w.res(m.result);
      } else if (m.event) this.emit('event', m);
    });
    readline.createInterface({ input: this.proc.stderr }).on('line', (l) => console.log('[py]', l));
    this.proc.on('exit', () => {
      this.proc = null;
      for (const w of this.waiting.values()) { clearTimeout(w.t); w.rej(new Error('Python-процесс завершился')); }
      this.waiting.clear();
    });
    this.proc.on('error', (e) => { this.error = String(e); });
    return true;
  }

  request(cmd, data = {}, timeout = 15000) {
    if (!this.proc && !this.start()) return Promise.reject(new Error(this.error));
    const id = ++this.seq;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.waiting.delete(id); rej(new Error(`Плагин не ответил на «${cmd}» за ${timeout / 1000} с`)); }, timeout);
      this.waiting.set(id, { res, rej, t });
      this.proc.stdin.write(JSON.stringify({ id, cmd, ...data }) + '\n');
    });
  }

  stop() { try { this.proc?.kill(); } catch {} this.proc = null; }
}

module.exports = { PyHost };
