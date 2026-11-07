// Набор команд для сообщений: пишешь ".команда" — вместо сообщения отправляется результат.
const DEFAULT_RULES = ':ok:=👌\n:fire:=🔥';

module.exports = {
  id: 'text-tools',
  name: 'Текстовые команды',
  version: '1.0',
  author: 'ExteraDesktop',
  description: 'Команды .shrug  .upper  .lower  .rev  .calc  .time  и автозамена слов.',
  enabledByDefault: true,

  onLoad(api) {
    const c = api.commands;
    c.register('shrug', ({ args }) => (args ? args + ' ' : '') + '¯\\_(ツ)_/¯', 'добавить ¯\\_(ツ)_/¯');
    c.register('upper', ({ args }) => args.toUpperCase() || null, 'ВЕРХНИЙ РЕГИСТР');
    c.register('lower', ({ args }) => args.toLowerCase() || null, 'нижний регистр');
    c.register('rev', ({ args }) => [...args].reverse().join('') || null, 'развернуть текст');
    c.register('time', () => new Date().toLocaleString('ru-RU'), 'текущее время');
    c.register('calc', ({ args }) => {
      if (!/^[\d\s+\-*/().,%^]+$/.test(args)) throw new Error('только числа и + - * / ( )');
      const v = Function(`"use strict";return (${args.replace(/,/g, '.').replace(/\^/g, '**')})`)();
      return `${args} = ${v}`;
    }, 'калькулятор: .calc 2+2*2');

    // Автозамена: «слово=замена» по одной паре в строке
    api.hooks.onSend(({ text }) => {
      const rules = String(api.settings.get('replace', DEFAULT_RULES)).split('\n').map((l) => l.split('=')).filter((p) => p.length === 2 && p[0].trim());
      if (!rules.length) return;
      let out = text;
      for (const [from, to] of rules) out = out.split(from.trim()).join(to.trim());
      if (out !== text) return { action: 'modify', text: out };
    });
  },

  settings() {
    return [
      { type: 'header', text: 'Автозамена' },
      { type: 'text', text: 'Одна пара на строку в виде «слово=замена». Применяется ко всем отправляемым сообщениям.' },
      { type: 'textarea', key: 'replace', text: 'Правила', default: DEFAULT_RULES },
    ];
  },
};
