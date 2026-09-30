// Render out/*.html to out/*.png at the page's native size.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SIZES = { 'instagram-post': [1080, 1350], story: [1080, 1920], 'poster-a4': [1240, 1754] };

(async () => {
  const browser = await chromium.launch();
  for (const [name, [w, h]] of Object.entries(SIZES)) {
    const file = path.join(__dirname, 'out', `${name}.html`);
    if (!fs.existsSync(file)) continue;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto('file://' + file, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(__dirname, 'out', `${name}.png`) });
    await page.close();
    console.log('rendered', name);
  }
  await browser.close();
})();
