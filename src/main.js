const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { PluginManager } = require('./plugins');
const { PyHost } = require('./pyhost');

const TG_URL = 'https://web.telegram.org/k/';
const TG_HOST = 'web.telegram.org';

let win, store, plugins, py, userPlugins;
const emit = (ch, ...a) => {
  if (win && !win.isDestroyed()) win.webContents.send(ch, ...a);
  if (ch === 'plugins:changed') buildMenu();
};

/** «Клиент» для плагинов: сообщения отправляются через настоящий интерфейс Telegram Web. */
const tgStub = {
  me: null,
  client: null,
  sendRaw: async (_chatId, text) => emit('web:send', text),
};

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 800, minWidth: 700, minHeight: 500,
    title: 'ExteraDesktop', backgroundColor: '#212121', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      partition: 'persist:telegram',
    },
  });
  const ses = win.webContents.session;
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\s(Electron|exteradesktop)\/\S+/gi, ''));
  const okPerm = new Set(['notifications', 'media', 'clipboard-sanitized-write', 'fullscreen', 'mediaKeySystem']);
  ses.setPermissionRequestHandler((_wc, perm, cb, details) => cb(okPerm.has(perm) && String(details.requestingUrl || '').startsWith('https://' + TG_HOST)));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).hostname !== TG_HOST) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });
  win.webContents.on('did-finish-load', () => emit('plugins:changed'));
  win.loadURL(TG_URL);
}

function buildMenu() {
  if (!plugins) return;
  const items = plugins.menuItems().map((m) => ({ label: m.text, click: () => plugins.clickMenu(m.plugin, m.index) }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Плагины',
      submenu: [
        { label: 'Менеджер плагинов', accelerator: 'CmdOrCtrl+Shift+P', click: () => emit('ui:open-plugins') },
        { label: 'Перезагрузить плагины', click: () => plugins.reload() },
        { label: 'Открыть папку плагинов', click: () => shell.openPath(userPlugins) },
        ...(items.length ? [{ type: 'separator' }, ...items] : []),
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' }, { role: 'toggleDevTools' },
      ],
    },
    { label: 'Окно', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ]));
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  userPlugins = path.join(userData, 'plugins');
  fs.mkdirSync(userPlugins, { recursive: true });

  store = new Store(userData);
  // в установленной версии plugins/ и pybridge/ лежат рядом с asar (Python не умеет читать из asar)
  const RES = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  py = new PyHost(path.join(RES, 'pybridge'));
  plugins = new PluginManager({
    dirs: [{ dir: path.join(RES, 'plugins'), builtin: true }, { dir: userPlugins, builtin: false }],
    store, tg: tgStub, emit, py,
  });

  // Обработчики принимаются только от страницы Telegram Web
  const trusted = (e) => { try { return new URL(e.senderFrame.url).hostname === TG_HOST; } catch { return false; } };
  const H = {
    'web:me': async (me) => {
      const had = tgStub.me?.id;
      tgStub.me = me && me.id ? { id: String(me.id), name: me.name || '', username: me.username || '' } : null;
      if (tgStub.me && tgStub.me.id !== had) await plugins.reload(); // плагинам нужен id пользователя
    },

    'plugins:send': (ctx) => plugins.runSend(ctx),
    'plugins:receive': (msg) => plugins.runReceive(msg),
    'plugins:list': () => ({ list: plugins.list(), menu: plugins.menuItems() }),
    'plugins:toggle': (id, on) => plugins.setEnabled(id, on),
    'plugins:settings': (id) => plugins.getSettings(id),
    'plugins:set': (id, key, val) => plugins.setSetting(id, key, val),
    'plugins:action': (id, n) => plugins.runAction(id, n),
    'plugins:menu': (id, i) => plugins.clickMenu(id, i),
    'plugins:reload': () => plugins.reload(),
    'plugins:openFolder': () => shell.openPath(userPlugins),
    'plugins:install': async () => {
      const r = await dialog.showOpenDialog(win, {
        title: 'Выберите плагин (.plugin / .py из exteraGram, .js или папку с plugin.js)',
        properties: ['openFile', 'openDirectory'], filters: [{ name: 'Плагины', extensions: ['plugin', 'py', 'js'] }],
      });
      if (r.canceled || !r.filePaths[0]) return false;
      const src = r.filePaths[0];
      fs.cpSync(src, path.join(userPlugins, path.basename(src)), { recursive: true });
      await plugins.reload();
      return true;
    },
  };
  for (const [ch, fn] of Object.entries(H)) {
    ipcMain.handle(ch, async (e, ...a) => {
      if (!trusted(e)) throw new Error('untrusted sender');
      try { return await fn(...a); } catch (err) { console.error(ch, err); throw new Error(err.message || String(err)); }
    });
  }

  await plugins.reload();
  buildMenu();
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => { try { store?.flush(); } catch {} py?.stop(); app.quit(); });
app.on('before-quit', () => py?.stop());
