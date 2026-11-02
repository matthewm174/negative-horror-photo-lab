// Opens index.html in the default browser. Usage: npm start
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'index.html');
const [cmd, args] =
  process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', file]]
  : process.platform === 'darwin' ? ['open', [file]]
  : ['xdg-open', [file]];

spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
console.log(`Opened ${file}`);
