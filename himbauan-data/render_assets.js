// Screenshot each out/assets/*.html to a transparent PNG.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
(async () => {
  const dir = path.join(__dirname, 'out', 'assets');
  const items = fs.readFileSync(path.join(dir, 'list.txt'), 'utf8').trim().split(/\s+/);
  const browser = await chromium.launch();
  for (const it of items) {
    const [name, dims] = it.split(':'); const [w, h] = dims.split('x').map(Number);
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto('file://' + path.join(dir, name + '.html'));
    await page.screenshot({ path: path.join(dir, name + '.png'), omitBackground: true });
    await page.close();
  }
  await browser.close(); console.log('done', items.length);
})();
