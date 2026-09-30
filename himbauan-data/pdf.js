// Render out/*.html to vector PDF (editable text) for import into Canva.
const { chromium } = require('playwright');
const path = require('path');
const SIZES = { 'instagram-post': [1080, 1350], story: [1080, 1920], 'poster-a4': [1240, 1754] };
(async () => {
  const browser = await chromium.launch();
  for (const [name, [w, h]] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto('file://' + path.join(__dirname, 'out', `${name}.html`), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: path.join(__dirname, 'out', `${name}.pdf`), width: `${w}px`, height: `${h}px`, printBackground: true, pageRanges: '1' });
    console.log('pdf', name);
  }
  await browser.close();
})();
