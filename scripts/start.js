// Запуск Electron. Сбрасывает ELECTRON_RUN_AS_NODE (её ставят некоторые редакторы/терминалы,
// из-за неё Electron стартует как обычный Node и падает).
const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env, windowsHide: false });
child.on('exit', (code) => process.exit(code ?? 0));
