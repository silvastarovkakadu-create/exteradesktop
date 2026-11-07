// Встраивается в настоящий Telegram Web (web.telegram.org/k): подключает систему плагинов
// поверх обычного интерфейса Telegram. Страница Telegram к этому коду доступа не имеет.
const { ipcRenderer } = require('electron');

const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const $ = (s, r = document) => r.querySelector(s);

if (location.hostname === 'web.telegram.org') {
  window.addEventListener('DOMContentLoaded', init);
}

/* ====================================================================== */
/*  Перехват отправки и входящих                                           */
/* ====================================================================== */
const INPUT = '.input-message-input[contenteditable], #editable-message-text, .input-message-input';
const SEND_BTN = '.btn-send, button.Button.send, .send-button';
let bypass = false;

const chatId = () => decodeURIComponent((location.hash || '').replace(/^#\??/, '').replace(/^@/, '').split('&')[0] || '');
const getText = (el) => (el.innerText || el.textContent || '').replace(/ /g, ' ').replace(/\n+$/, '');

function setText(el, text) {
  el.focus();
  document.execCommand('selectAll', false);
  if (text) document.execCommand('insertText', false, text); else document.execCommand('delete', false);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function pressEnter(el) {
  bypass = true;
  try {
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
  } finally { bypass = false; }
  // запасной путь: если Enter не сработал — жмём кнопку отправки
  setTimeout(() => {
    if (getText(el).trim()) { const b = $(SEND_BTN); if (b) { bypass = true; try { b.click(); } finally { bypass = false; } } }
  }, 250);
}

async function processSend(el) {
  const text = getText(el);
  if (!text.trim()) return;
  setText(el, ''); // освобождаем поле: плагины могут отправлять свои сообщения через него
  let r;
  try { r = await call('plugins:send', { chatId: chatId(), text }); } catch { r = { text }; }
  if (r.cancel || !r.text) return;
  setText(el, r.text);
  pressEnter(el);
}

function installSendHook() {
  document.addEventListener('keydown', (e) => {
    if (bypass || e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.isComposing) return;
    const el = e.target.closest && e.target.closest(INPUT);
    if (!el || !getText(el).trim()) return;
    e.preventDefault(); e.stopImmediatePropagation();
    processSend(el);
  }, true);

  document.addEventListener('click', (e) => {
    if (bypass) return;
    const b = e.target.closest && e.target.closest(SEND_BTN);
    if (!b) return;
    const el = $(INPUT);
    if (!el || !getText(el).trim()) return;
    e.preventDefault(); e.stopImmediatePropagation();
    processSend(el);
  }, true);

  // плагин попросил отправить сообщение (api.telegram.sendMessage / client_utils.send_message)
  ipcRenderer.on('web:send', (_e, text) => {
    const el = $(INPUT);
    if (!el) return toast('Откройте чат, чтобы плагин мог отправить сообщение');
    setText(el, text);
    pressEnter(el);
  });
}

const seen = new WeakSet();
async function handleBubble(b) {
  if (seen.has(b)) return;
  const msg = b.querySelector('.message');
  if (!msg) return;
  seen.add(b);
  const clone = msg.cloneNode(true);
  clone.querySelectorAll('.time, .reactions, .reactions-block-wrapper, .inner, .time-inner, .reply, .name').forEach((n) => n.remove());
  const text = (clone.textContent || '').trim();
  if (!text) return;
  let r;
  try {
    r = await call('plugins:receive', {
      id: Number(b.dataset.mid) || 0, chatId: chatId(), text, out: b.classList.contains('is-out'),
      date: Number(b.dataset.timestamp) * 1000 || Date.now(), from: '',
    });
  } catch { return; }
  if (r.hide) { b.style.display = 'none'; return; }
  if (r.msg && r.msg.text !== text) {
    const node = [...msg.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (node) node.textContent = r.msg.text;
  }
}

function installReceiveHook() {
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches('.bubble')) handleBubble(root);
    root.querySelectorAll && root.querySelectorAll('.bubble').forEach(handleBubble);
  };
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}

function trackMe() {
  const read = () => {
    try {
      const a = JSON.parse(localStorage.getItem('user_auth') || 'null');
      if (a && a.id) call('web:me', { id: a.id, name: '', username: '' }).catch(() => {});
      else setTimeout(read, 3000);
    } catch { setTimeout(read, 3000); }
  };
  read();
}

/* ====================================================================== */
/*  Интерфейс менеджера плагинов (shadow DOM, чтобы стили не пересекались)  */
/* ====================================================================== */
const ICON = {
  plug: 'M16 7V3h-2v4h-4V3H8v4H6v6l3 4v4h6v-4l3-4V7h-2z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  folder: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z',
  refresh: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  settings: 'M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.61.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.62-.94l2.39.96c.22.09.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
};
const svg = (n) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="${ICON[n]}"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pal = [['#ff885e', '#ff516a'], ['#ffcd6a', '#ffa85c'], ['#82b1ff', '#665fff'], ['#a0de7e', '#54cb68'], ['#53edd6', '#28c9b7'], ['#72d5fd', '#2a9ef1'], ['#e0a2f3', '#d669ed']];
const grad = (n) => pal[[...String(n)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % pal.length];

const CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{--bg:#fff;--text:#000;--muted:#8a8f94;--line:#e7e7e7;--hover:#f4f4f5;--blue:#3390ec;color:var(--text)}
.wrap.dark{--bg:#212121;--text:#fff;--muted:#8d9399;--line:#0f0f0f;--hover:#2c2c2c;--blue:#8774e1}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
.fab{position:fixed;left:10px;bottom:10px;width:34px;height:34px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;opacity:.55;transition:opacity .15s,transform .15s;z-index:1;box-shadow:0 2px 8px #0004}
.fab:hover{opacity:1;transform:scale(1.08)}
.fab svg{width:18px;height:18px}
.ov{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s;z-index:3}
.ov.on{opacity:1;pointer-events:auto}
.panel{background:var(--bg);border-radius:14px;width:min(640px,94vw);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 8px 30px #0005;transform:scale(.92) translateY(10px);transition:transform .22s cubic-bezier(.2,1.2,.4,1);overflow:hidden}
.panel.narrow{width:min(460px,94vw)}
.ov.on .panel{transform:none}
.ph{display:flex;align-items:center;gap:2px;padding:10px 12px 10px 20px;border-bottom:1px solid var(--line)}
.ph h3{font-weight:600;font-size:18px;flex:1}
.ib{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.ib:hover{background:var(--hover);color:var(--text)}
.warn{background:#ffb30022;color:#b57a00;padding:8px 20px;font-size:13px}
.dark .warn{color:#ffc94d}
.list{overflow:auto;padding:8px}
.pl{display:flex;gap:12px;padding:12px;border-radius:10px;align-items:flex-start}
.pl:hover{background:var(--hover)}
.pic{width:44px;height:44px;border-radius:12px;background:linear-gradient(var(--c1),var(--c2));color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none;font-size:18px}
.pi{flex:1;min-width:0}
.pn{font-weight:600}.pn small{color:var(--muted);font-weight:400;margin-left:6px}
.pd{color:var(--muted);font-size:13.5px;margin-top:1px}
.pc{margin-top:4px;font-size:12.5px;color:var(--blue);word-break:break-word}
.pe{margin-top:4px;font-size:12px;color:#e53935;white-space:pre-wrap;max-height:90px;overflow:auto}
.tag{font-size:11px;background:var(--hover);padding:1px 6px;border-radius:6px;color:var(--muted);margin-left:6px}
.acts{display:flex;align-items:center;gap:4px}
.sw{width:36px;height:20px;border-radius:10px;background:var(--line);position:relative;transition:background .2s;flex:none;cursor:pointer;display:block}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 2px #0004}
.sw.on{background:var(--blue)}.sw.on::after{transform:translateX(16px)}
.sh{font-size:13px;font-weight:600;color:var(--blue);padding:14px 12px 4px;text-transform:uppercase}
.st-t{padding:6px 12px;color:var(--muted);font-size:13.5px}
.st-d{height:1px;background:var(--line);margin:8px 12px}
.st-s{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;cursor:pointer}
.st-s:hover{background:var(--hover)}.st-s .l{flex:1}.st-s small{display:block;color:var(--muted);font-size:12.5px}
.st-i{padding:8px 12px}.st-i label{display:block;font-size:13px;color:var(--muted);margin-bottom:4px}
.st-i input,.st-i textarea,.st-i select{width:100%;border:2px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--bg);color:var(--text);font:inherit;outline:0}
.st-i textarea{min-height:90px;resize:vertical;font-family:Consolas,monospace;font-size:13.5px}
.st-i input:focus,.st-i textarea:focus,.st-i select:focus{border-color:var(--blue)}
.st-b{margin:8px 12px;padding:9px 16px;border-radius:10px;background:var(--hover);color:var(--blue);font-weight:600}
.toast{position:fixed;left:50%;bottom:80px;transform:translate(-50%,20px);background:#000c;color:#fff;padding:8px 16px;border-radius:18px;opacity:0;pointer-events:none;transition:.25s;max-width:80vw;z-index:4}
.toast.on{opacity:1;transform:translate(-50%,0)}
`;

let sh, P = [];
const q = (s) => sh.querySelector(s);

function isDark() {
  if (document.documentElement.classList.contains('night')) return true;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor);
  return m ? (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) < 110 : false;
}

let toastT;
function toast(t) {
  if (!sh) return;
  const el = q('.toast'); el.textContent = t; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600);
}

function buildUi() {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none';
  document.documentElement.appendChild(host);
  sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = `<style>${CSS}</style><div class="wrap">
    <button class="fab" title="Плагины (Ctrl+Shift+P)">${svg('plug')}</button>
    <div class="ov" id="pm"><div class="panel">
      <div class="ph"><h3>Плагины</h3>
        <button class="ib" id="i" title="Установить плагин">${svg('plus')}</button>
        <button class="ib" id="f" title="Открыть папку плагинов">${svg('folder')}</button>
        <button class="ib" id="r" title="Перезагрузить">${svg('refresh')}</button>
        <button class="ib" id="x">${svg('close')}</button></div>
      <div class="warn">⚠ Плагины выполняются с полным доступом к программе. Устанавливай только те, которым доверяешь.</div>
      <div class="list" id="pl"></div></div></div>
    <div class="ov" id="ps"><div class="panel narrow">
      <div class="ph"><h3 id="pst">Настройки</h3><button class="ib" id="sx">${svg('close')}</button></div>
      <div class="list" id="psb"></div></div></div>
    <div class="toast"></div></div>`;
  // fab и оверлеи должны ловить клики, остальное — пропускать к Telegram
  sh.querySelectorAll('.fab,.ov').forEach((e) => (e.style.pointerEvents = e.classList.contains('ov') ? '' : 'auto'));

  q('.fab').onclick = openPm;
  q('#x').onclick = () => q('#pm').classList.remove('on');
  q('#pm').onclick = (e) => e.target.id === 'pm' && q('#pm').classList.remove('on');
  q('#sx').onclick = () => q('#ps').classList.remove('on');
  q('#ps').onclick = (e) => e.target.id === 'ps' && q('#ps').classList.remove('on');
  q('#r').onclick = async () => { await call('plugins:reload'); toast('Плагины перезагружены'); };
  q('#f').onclick = () => call('plugins:openFolder');
  q('#i').onclick = async () => { if (await call('plugins:install')) toast('Плагин установлен'); };

  q('#pl').addEventListener('click', async (e) => {
    const row = e.target.closest('.pl'), act = e.target.closest('[data-act]')?.dataset.act; if (!row || !act) return;
    const p = P.find((x) => x.id === row.dataset.id);
    if (act === 'tog') await call('plugins:toggle', p.id, !p.enabled);
    if (act === 'set') openSettings(p);
  });
  q('#psb').addEventListener('click', (e) => {
    const id = q('#ps').dataset.id, s = e.target.closest('.st-s');
    if (s) { const sw = s.querySelector('.sw'), on = !sw.classList.contains('on'); sw.classList.toggle('on', on); call('plugins:set', id, s.dataset.k, on); }
    const b = e.target.closest('.st-b'); if (b) call('plugins:action', id, Number(b.dataset.action));
  });
  q('#psb').addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (k) call('plugins:set', q('#ps').dataset.id, k, e.target.dataset.num ? Number(e.target.value) : e.target.value);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { q('#pm').classList.remove('on'); q('#ps').classList.remove('on'); }
  });
}

async function loadPlugins() {
  try { P = (await call('plugins:list')).list; } catch {}
  if (sh && q('#pm').classList.contains('on')) renderPm();
}

function openPm() {
  q('.wrap').classList.toggle('dark', isDark());
  renderPm(); q('#pm').classList.add('on');
}

function renderPm() {
  q('#pl').innerHTML = P.map((p) => {
    const [c1, c2] = grad(p.id);
    return `<div class="pl" data-id="${esc(p.id)}">
      <div class="pic" style="--c1:${c1};--c2:${c2}">${esc([...p.name][0]?.toUpperCase() || '?')}</div>
      <div class="pi"><div class="pn">${esc(p.name)}<small>v${esc(p.version)} · ${esc(p.author)}</small>${p.builtin ? '<span class="tag">встроенный</span>' : ''}${p.kind ? `<span class="tag">${esc(p.kind)}</span>` : ''}</div>
        <div class="pd">${esc(p.description)}</div>
        ${p.commands.length ? `<div class="pc">${p.commands.map((c) => '.' + esc(c.name)).join('  ')}</div>` : ''}
        ${p.error ? `<div class="pe">${esc(p.error)}</div>` : ''}</div>
      <div class="acts">
        ${p.hasSettings && p.loaded ? `<button class="ib" data-act="set" title="Настройки">${svg('settings')}</button>` : ''}
        <i class="sw${p.enabled ? ' on' : ''}" data-act="tog"></i>
      </div></div>`;
  }).join('') || '<div class="st-t" style="padding:30px;text-align:center">Плагинов нет. Нажми «+», чтобы установить.</div>';
}

async function openSettings(p) {
  q('#pst').textContent = p.name;
  q('#ps').dataset.id = p.id;
  const schema = await call('plugins:settings', p.id);
  q('#psb').innerHTML = schema.map((it) => {
    const k = esc(it.key || '');
    switch (it.type) {
      case 'header': return `<div class="sh">${esc(it.text)}</div>`;
      case 'text': return `<div class="st-t">${esc(it.text)}</div>`;
      case 'divider': return '<div class="st-d"></div>';
      case 'switch': return `<div class="st-s" data-k="${k}"><div class="l">${esc(it.text)}${it.subtext ? `<small>${esc(it.subtext)}</small>` : ''}</div><i class="sw${it.value ? ' on' : ''}"></i></div>`;
      case 'input': return `<div class="st-i"><label>${esc(it.text)}</label><input data-k="${k}" value="${esc(it.value ?? '')}" placeholder="${esc(it.placeholder || '')}"></div>`;
      case 'textarea': return `<div class="st-i"><label>${esc(it.text)}</label><textarea data-k="${k}">${esc(it.value ?? '')}</textarea></div>`;
      case 'select': return `<div class="st-i"><label>${esc(it.text)}</label><select data-k="${k}" data-num="1">${(it.items || []).map((o, j) => `<option value="${j}"${Number(it.value ?? 0) === j ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
      case 'button': return `<button class="st-b" data-action="${it.action}">${esc(it.text)}</button>`;
      default: return '';
    }
  }).join('');
  q('.wrap').classList.toggle('dark', isDark());
  q('#ps').classList.add('on');
}

/* ====================================================================== */
function init() {
  buildUi();
  loadPlugins();
  installSendHook();
  installReceiveHook();
  trackMe();
  ipcRenderer.on('ui:toast', (_e, t) => toast(t));
  ipcRenderer.on('ui:copy', (_e, t) => navigator.clipboard && navigator.clipboard.writeText(t).then(() => toast('Скопировано')).catch(() => {}));
  ipcRenderer.on('ui:open-plugins', openPm);
  ipcRenderer.on('plugins:changed', loadPlugins);
}
