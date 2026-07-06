const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000/analytics', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: 'C:\\Users\\abhis\\.gemini\\antigravity-ide\\brain\\886a18bd-e4dd-4327-b624-2463355ad33c\\analytics_screenshot.png' });
  await browser.close();
  console.log('Screenshot saved to artifacts as analytics_screenshot.png');
})();
