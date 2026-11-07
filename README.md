# ExteraDesktop

Обычный интерфейс Telegram (Telegram Web K) в окне Electron + система плагинов в духе exteraGram,
включая запуск Python-плагинов `.plugin` с телефона.

## Запуск

```
cd D:\exteradesktop
npm install
npm start
```

Вход — как в обычном Telegram (QR или номер телефона). Сессия сохраняется в профиле приложения.
Если `npm start` падает с ошибкой про `whenReady` — запускай именно через `npm start` (скрипт сбрасывает `ELECTRON_RUN_AS_NODE`).

## Плагины

Менеджер: меню окна **Плагины → Менеджер плагинов** (Alt показывает меню), **Ctrl+Shift+P** или круглая кнопка-пазл в левом нижнем углу.
Установка: «+» в менеджере или положить файл в `%APPDATA%/exteradesktop/plugins`.

### Плагины exteraGram (Python, `.plugin`)

Нужен **Python 3** (python.org, «Add to PATH»). Поддерживается: `BasePlugin`, `HookResult`/`HookStrategy`,
`on_plugin_load/unload`, `add_on_send_message_hook` + `on_send_message_hook(account, params)` (`params.message`, `params.peer`),
`add_hook("TL_updateNewMessage")` + `on_update_hook`, `get_setting/set_setting`, `create_settings`
(`Header, Switch, Input, Selector, Divider, Text`), `MenuItemData` (пункты в меню «Плагины»), `BulletinHelper`,
`client_utils.send_message` (в открытый чат), `android_utils.log`.

Не работает на ПК: всё, что завязано на Android/Java (`hook_method`, `jclass`, нативные диалоги, контекстное меню
сообщения, прямые TL-запросы). Пример: `plugins/eg_demo.plugin`. Python-слой — в `pybridge/`.

### Плагины на JavaScript

Папка с `plugin.js` или файл `.js`:

```js
module.exports = {
  id: 'my-plugin', name: 'Мой плагин', version: '1.0', author: 'me', description: '...',
  onLoad(api) {
    api.commands.register('hello', ({ args }) => `Привет, ${args}!`, 'описание'); // «.hello Вася»
    api.hooks.onSend(({ chatId, text }) => ({ action: 'modify', text: text + '!' })); // или {action:'cancel'}
    api.hooks.onReceive((msg) => (msg.text.includes('spam') ? { action: 'hide' } : undefined));
    api.ui.addMenuItem({ text: 'Пункт', onClick: () => api.ui.toast('Привет') });
  },
  settings(api) { return [{ type: 'switch', key: 'on', text: 'Включить', default: true }]; },
};
```

`api.settings.get/set`, `api.ui.toast`, `api.telegram.sendMessage(chatId, text)`, `api.log`.
Элементы настроек: `header, text, divider, switch, input, textarea, select, button`. Примеры: `plugins/`.

## Как это устроено

Окно загружает `web.telegram.org/k`, а `src/preload.js` встраивается в страницу: перехватывает отправку (Enter / кнопка)
и прогоняет текст через плагины, фильтрует входящие сообщения и рисует менеджер плагинов поверх интерфейса.
Ядро плагинов (`src/plugins.js`) и Python-хост (`pybridge/`) работают в основном процессе.

Ограничения: хуки работают на уровне интерфейса. Нельзя менять сетевой протокол, поэтому нет «режима призрака»
и «сохранения удалённых» — их нельзя сделать без доступа к MTProto внутри страницы.
