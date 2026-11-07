const fs = require('fs');
const path = require('path');

/** Простое JSON-хранилище в папке данных приложения. */
class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'config.json');
    this.data = { apiId: 0, apiHash: '', session: '', plugins: { enabled: {}, settings: {} } };
    try { Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch {}
    this.data.plugins ||= { enabled: {}, settings: {} };
    this.data.plugins.enabled ||= {};
    this.data.plugins.settings ||= {};
  }
  save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      try { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2)); } catch (e) { console.error('store save', e); }
    }, 150);
  }
  flush() { clearTimeout(this._t); fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2)); }
}

module.exports = { Store };
