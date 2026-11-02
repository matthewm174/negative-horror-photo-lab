// Renders the README demo gallery: drives the app in a headless Edge/Chrome and writes
// comparison sheets to demo/outputs/. Usage: npm run demos [-- <name filter> ...]
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const filters = process.argv.slice(2);

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel }); } catch { /* try the next browser */ }
  }
  throw new Error('Needs Microsoft Edge or Google Chrome installed.');
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(pathToFileURL(join(root, 'index.html')).href);
await page.addScriptTag({ path: join(root, 'tools', 'demo-page.js') });

const inputsDir = join(root, 'demo', 'inputs');
const inputs = {};
for (const f of readdirSync(inputsDir).filter((f) => /\.jpe?g$/i.test(f))) {
  inputs[f.replace(/\.\w+$/, '')] = 'data:image/jpeg;base64,' + readFileSync(join(inputsDir, f)).toString('base64');
}
await page.evaluate((m) => Demo.loadInputs(m), inputs);

const outDir = join(root, 'demo', 'outputs');
mkdirSync(outDir, { recursive: true });
const names = await page.evaluate(() => Demo.list());
for (const name of names) {
  if (filters.length && !filters.some((f) => name.includes(f))) continue;
  const t = Date.now();
  const url = await page.evaluate((n) => Demo.run(n), name);
  writeFileSync(join(outDir, name + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${name}.jpg  ${((Date.now() - t) / 1000).toFixed(1)} s`);
}
await browser.close();
