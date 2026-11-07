// Пример плагина: показывает все точки расширения. Скопируй и переделай под себя.
module.exports = {
  id: 'example',
  name: 'Пример плагина',
  version: '1.0',
  author: 'ExteraDesktop',
  description: 'Шаблон: команда, хуки, пункт меню и настройки.',

  // вызывается при включении плагина
  onLoad(api) {
    // 1. Команда: «.hello Мир» → отправит «Привет, Мир!»
    api.commands.register('hello', ({ args }) => `Привет, ${args || 'мир'}!`, 'поздороваться');

    // 2. Хук отправки: можно изменить текст или отменить отправку
    api.hooks.onSend(({ text }) => {
      if (api.settings.get('signature', '')) return { action: 'modify', text: text + '\n' + api.settings.get('signature') };
    });

    // 3. Хук входящих: можно изменить текст или скрыть сообщение
    api.hooks.onReceive((msg) => {
      const bad = String(api.settings.get('hide', '')).trim();
      if (bad && msg.text.toLowerCase().includes(bad.toLowerCase())) return { action: 'hide' };
    });

    // 4. Пункт в боковом меню
    api.ui.addMenuItem({ text: 'Привет от плагина', onClick: () => api.ui.toast('👋 Плагин работает!') });

    // 5. Прямой доступ к GramJS: api.telegram.client
  },

  onUnload() {},

  // настройки показываются в менеджере плагинов
  settings(api) {
    return [
      { type: 'header', text: 'Настройки примера' },
      { type: 'input', key: 'signature', text: 'Подпись к каждому сообщению', placeholder: 'например: — отправлено из ExteraDesktop', default: '' },
      { type: 'input', key: 'hide', text: 'Скрывать входящие со словом', default: '' },
      { type: 'divider' },
      { type: 'button', text: 'Показать уведомление', onClick: () => api.ui.toast('Кнопка нажата') },
    ];
  },
};
