const fs = require('fs');
const path = require('path');

/**
 * Менеджер плагинов ExteraDesktop.
 * Плагин — папка с plugin.js (или одиночный *.js файл), которая экспортирует объект:
 *   { id, name, version, author, description, onLoad(api), onUnload(), settings(api) }
 * Документация API — в README.md.
 */
class PluginManager {
  /**
   * @param {{dirs: {dir:string, builtin:boolean}[], store: import('./store').Store, tg: any, emit: Function}} o
   */
  constructor({ dirs, store, tg, emit, py }) {
    this.dirs = dirs;
    this.store = store;
    this.tg = tg;
    this.emit = emit;
    this.py = py;
    if (py) py.on('event', (m) => this._pyEvent(m));
    this.items = new Map(); // id -> record
    this.actions = new Map(); // `${id}:${n}` -> fn (кнопки в настройках)
  }

  /* ---------- загрузка ---------- */
  scan() {
    const found = [];
    for (const { dir, builtin } of this.dirs) {
      let names = [];
      try { names = fs.readdirSync(dir); } catch { continue; }
      for (const n of names) {
        const p = path.join(dir, n);
        let file = null;
        try {
          const st = fs.statSync(p);
          if (st.isDirectory() && fs.existsSync(path.join(p, 'plugin.js'))) file = path.join(p, 'plugin.js');
          else if (st.isFile() && /\.(js|plugin|py)$/i.test(n) && !n.startsWith('_')) file = p;
        } catch {}
        if (file) found.push({ file, dir: path.dirname(file), fallbackId: n.replace(/\.(js|plugin|py)$/i, ''), builtin });
      }
    }
    return found;
  }

  async reload() {
    for (const rec of [...this.items.values()]) await this._unload(rec);
    this.items.clear();
    for (const f of this.scan()) {
      const rec = { ...f, hooks: { send: [], receive: [], read: [], delete: [] }, commands: new Map(), menu: [], loaded: false, error: null, mod: null, meta: {} };
      try {
        if (/\.(plugin|py)$/i.test(f.file)) {
          rec.py = true;
          if (!this.py || !this.py.start()) throw new Error((this.py && this.py.error) || 'Python-хост недоступен');
          const r = await this.py.request('load', { path: f.file });
          rec.meta = { id: r.meta.id, name: r.meta.name, version: r.meta.version, author: r.meta.author || 'unknown', description: r.meta.description || '' };
          rec.mod = this._pyMod(rec.meta.id);
          rec.meta.kind = 'exteraGram (Python)';
        } else {
          delete require.cache[require.resolve(f.file)];
          const mod = require(f.file);
          rec.mod = mod;
          rec.meta = {
            id: String(mod.id || f.fallbackId),
            name: mod.name || f.fallbackId,
            version: mod.version || '1.0',
            author: mod.author || 'unknown',
            description: mod.description || '',
          };
        }
      } catch (e) {
        rec.error = String(e.stack || e);
        rec.meta = { id: f.fallbackId, name: f.fallbackId, version: '?', author: '?', description: 'Ошибка загрузки' };
      }
      if (this.items.has(rec.meta.id)) continue;
      this.items.set(rec.meta.id, rec);
      if (!rec.error && this.isEnabled(rec.meta.id, rec.mod)) await this._load(rec);
    }
    this.emit('plugins:changed');
  }

  /** Прокси-объект, превращающий Python-плагин exteraGram в обычный плагин менеджера. */
  _pyMod(pid) {
    const py = this.py, self = this;
    return {
      id: pid,
      async onLoad(api) {
        const me = self.tg.me ? { ...self.tg.me, id: Number(self.tg.me.id) } : {};
        const r = await py.request('enable', { pid, settings: self.store.data.plugins.settings[pid] || {}, me });
        const upd = new Set(r.hooks.filter((h) => h.startsWith('update:')).map((h) => h.slice(7)));
        if (r.hooks.includes('send')) {
          api.hooks.onSend(async ({ chatId, text, replyTo }) => {
            const res = await py.request('send_hook', { pid, account: 0, params: { peer: Number(chatId), message: text, replyToMsg: replyTo || null } });
            if (res.strategy === 'CANCEL') return { action: 'cancel' };
            if ((res.strategy === 'MODIFY' || res.strategy === 'MODIFY_FINAL') && typeof res.params.message === 'string') return { action: 'modify', text: res.params.message };
          });
        }
        if (upd.size) {
          api.hooks.onReceive(async (msg) => {
            const name = msg.chatId?.startsWith?.('-100') ? 'TL_updateNewChannelMessage' : 'TL_updateNewMessage';
            if (!upd.has(name)) return;
            const id = Number(msg.chatId);
            const res = await py.request('update_hook', { pid, name, account: 0, update: { message: { id: msg.id, message: msg.text, out: msg.out, date: Math.floor(msg.date / 1000), dialog_id: id, peer_id: { user_id: id > 0 ? id : 0, chat_id: id < 0 ? -id : 0 } } } });
            if (res.strategy === 'CANCEL') return { action: 'hide' };
            if ((res.strategy === 'MODIFY' || res.strategy === 'MODIFY_FINAL') && res.text != null) return { action: 'modify', text: res.text };
          });
        }
      },
      async onUnload() { await py.request('disable', { pid }); },
      async settings() {
        const items = await py.request('settings', { pid });
        return items.map((it) => (it.type === 'button' ? { ...it, onClick: () => py.request('click', { pid, action: it.action }) } : it));
      },
      onSettingChanged(key, value) { py.request('setting_changed', { pid, key, value }).catch(() => {}); },
    };
  }

  _pyEvent(m) {
    if (m.event === 'toast') this.emit('ui:toast', m.text);
    else if (m.event === 'copy') this.emit('ui:copy', m.text);
    else if (m.event === 'send_message') this.tg.sendRaw(String(m.peer), m.message, m.replyTo).catch((e) => this.emit('ui:toast', 'Плагин не смог отправить: ' + e.message));
    else if (m.event === 'set_setting') { (this.store.data.plugins.settings[m.pid] ||= {})[m.key] = m.value; this.store.save(); }
    else if (m.event === 'menu_add') {
      const rec = this.items.get(m.pid);
      if (rec) rec.menu.push({ text: m.text, onClick: () => this.py.request('menu_click', { pid: m.pid, item_id: m.item_id }) });
    }
  }

  isEnabled(id, mod) {
    const v = this.store.data.plugins.enabled[id];
    return v === undefined ? !!(mod && mod.enabledByDefault) : !!v;
  }

  async _load(rec) {
    const id = rec.meta.id;
    rec.hooks = { send: [], receive: [], read: [], delete: [] };
    rec.commands = new Map(); rec.menu = [];
    try {
      await rec.mod.onLoad?.(this._api(rec));
      rec.loaded = true; rec.error = null;
    } catch (e) {
      rec.error = String(e.stack || e); rec.loaded = false;
      this.emit('ui:toast', `Плагин «${rec.meta.name}»: ошибка при загрузке`);
    }
  }
  async _unload(rec) {
    if (!rec.loaded) return;
    try { await rec.mod.onUnload?.(); } catch (e) { console.error(`[plugin ${rec.meta.id}] onUnload`, e); }
    rec.loaded = false;
    rec.hooks = { send: [], receive: [], read: [], delete: [] };
    rec.commands = new Map(); rec.menu = [];
  }

  async setEnabled(id, on) {
    const rec = this.items.get(id); if (!rec) return;
    this.store.data.plugins.enabled[id] = !!on; this.store.save();
    if (on && !rec.loaded && rec.mod && !rec.error) await this._load(rec);
    if (!on) await this._unload(rec);
    this.emit('plugins:changed');
  }

  /* ---------- API, выдаваемый плагину ---------- */
  _api(rec) {
    const id = rec.meta.id, self = this, tg = this.tg;
    const log = (...a) => console.log(`[plugin ${id}]`, ...a);
    const dataDir = path.join(this.store.dir || '.', 'plugin-data', id);
    return {
      id, log, dataDir,
      hooks: {
        /** fn({chatId, text, replyTo}) → {action:'modify',text} | {action:'cancel'} | undefined */
        onSend: (fn) => rec.hooks.send.push(fn),
        /** fn(message) → {action:'modify',text} | {action:'hide'} | undefined */
        onReceive: (fn) => rec.hooks.receive.push(fn),
        /** fn({chatId}) → {action:'cancel'} чтобы не отправлять «прочитано» */
        onRead: (fn) => rec.hooks.read.push(fn),
        /** fn({chatId, ids, messages}) → {action:'keep'} чтобы сохранить удалённые сообщения */
        onDelete: (fn) => rec.hooks.delete.push(fn),
      },
      commands: {
        /** register('shrug', async ({args, chatId}) => '¯\\_(ツ)_/¯', 'описание') — вызывается как ".shrug" */
        register: (name, fn, description = '') => rec.commands.set(String(name).toLowerCase().replace(/^\./, ''), { fn, description }),
      },
      settings: {
        get: (key, def) => {
          const s = self.store.data.plugins.settings[id];
          return s && key in s ? s[key] : def;
        },
        set: (key, val) => {
          (self.store.data.plugins.settings[id] ||= {})[key] = val;
          self.store.save();
        },
      },
      ui: {
        toast: (text) => self.emit('ui:toast', String(text)),
        addMenuItem: ({ text, onClick }) => {
          rec.menu.push({ text: String(text), onClick });
          self.emit('plugins:changed');
        },
      },
      telegram: {
        get client() { return tg.client; },
        sendMessage: (chatId, text, opts = {}) => tg.sendRaw(chatId, text, opts.replyTo),
        getMe: () => tg.client.getMe(),
        invoke: (req) => tg.client.invoke(req),
      },
    };
  }

  /* ---------- вызовы хуков ---------- */
  async _run(kind, ctx, apply) {
    for (const rec of this.items.values()) {
      if (!rec.loaded) continue;
      for (const fn of rec.hooks[kind]) {
        try {
          const r = await fn(ctx);
          if (r && apply(r) === 'stop') return;
        } catch (e) {
          console.error(`[plugin ${rec.meta.id}] hook ${kind}`, e);
          this.emit('ui:toast', `Плагин «${rec.meta.name}»: ошибка в хуке`);
        }
      }
    }
  }

  async runSend(ctx) {
    ctx = { ...ctx };
    // команды вида ".name args"
    const m = /^\.([\wа-яё-]+)(?:\s+([\s\S]*))?$/i.exec(ctx.text.trim());
    if (m) {
      const name = m[1].toLowerCase();
      for (const rec of this.items.values()) {
        const cmd = rec.loaded && rec.commands.get(name);
        if (!cmd) continue;
        try {
          const out = await cmd.fn({ args: (m[2] || '').trim(), chatId: ctx.chatId, replyTo: ctx.replyTo });
          if (typeof out === 'string' && out) ctx.text = out;
          else return { cancel: true };
        } catch (e) {
          this.emit('ui:toast', `Команда .${name}: ${e.message}`);
          return { cancel: true };
        }
        break;
      }
    }
    let cancel = false;
    await this._run('send', ctx, (r) => {
      if (r.action === 'cancel') { cancel = true; return 'stop'; }
      if (r.action === 'modify' && typeof r.text === 'string') ctx.text = r.text;
    });
    return cancel ? { cancel: true } : { text: ctx.text };
  }

  async runReceive(msg) {
    let hide = false;
    await this._run('receive', msg, (r) => {
      if (r.action === 'hide') { hide = true; return 'stop'; }
      if (r.action === 'modify' && typeof r.text === 'string') msg.text = r.text;
    });
    return hide ? { hide: true } : { msg };
  }

  async runRead(ctx) {
    let cancel = false;
    await this._run('read', ctx, (r) => { if (r.action === 'cancel') { cancel = true; return 'stop'; } });
    return { cancel };
  }

  async runDelete(ctx) {
    let keep = false;
    await this._run('delete', ctx, (r) => { if (r.action === 'keep') { keep = true; return 'stop'; } });
    return { keep };
  }

  /* ---------- для интерфейса ---------- */
  list() {
    return [...this.items.values()].map((r) => ({
      ...r.meta,
      builtin: r.builtin,
      enabled: this.isEnabled(r.meta.id, r.mod),
      loaded: r.loaded,
      error: r.error,
      hasSettings: !!(r.mod && typeof r.mod.settings === 'function'),
      commands: [...r.commands].map(([n, c]) => ({ name: n, description: c.description })),
    }));
  }

  menuItems() {
    const out = [];
    for (const rec of this.items.values()) {
      if (!rec.loaded) continue;
      rec.menu.forEach((m, i) => out.push({ plugin: rec.meta.id, index: i, text: m.text }));
    }
    return out;
  }
  async clickMenu(id, index) {
    const rec = this.items.get(id);
    try { await rec?.menu[index]?.onClick?.(); } catch (e) { this.emit('ui:toast', `Ошибка: ${e.message}`); }
  }

  /** Схема настроек плагина с текущими значениями. */
  async getSettings(id) {
    const rec = this.items.get(id);
    if (!rec || !rec.loaded || typeof rec.mod.settings !== 'function') return [];
    const api = this._api(rec);
    const schema = (await rec.mod.settings(api)) || [];
    return schema.map((it, i) => {
      const o = { ...it };
      if (typeof it.onClick === 'function') {
        this.actions.set(`${id}:${i}`, it.onClick);
        o.action = i; delete o.onClick;
      }
      if (it.key) o.value = api.settings.get(it.key, it.default);
      return o;
    });
  }
  async runAction(id, n) {
    try { await this.actions.get(`${id}:${n}`)?.(); } catch (e) { this.emit('ui:toast', `Ошибка: ${e.message}`); }
  }
  setSetting(id, key, val) {
    (this.store.data.plugins.settings[id] ||= {})[key] = val;
    this.store.save();
    const rec = this.items.get(id);
    try { rec?.mod.onSettingChanged?.(key, val, this._api(rec)); } catch {}
  }
}

module.exports = { PluginManager };
