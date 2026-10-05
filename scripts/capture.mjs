import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('screenshots');
mkdirSync(OUT, { recursive: true });

const URL = 'http://localhost:5173/';
const SHOTS = [
  { name: '01-hero',         scrollY: 0,    waitMs: 4500 },
  { name: '02-overview',     scrollY: 2700, waitMs: 1800 },
  { name: '03-benefits',     scrollY: 4000, waitMs: 1800 },
  { name: '04-begin',        scrollY: 4960, waitMs: 1500 },
  { name: '05-closer',       scrollY: 5570, waitMs: 2200 },
  { name: '06-closer-zoom',  scrollY: 5750, waitMs: 2500 },
];

const VIEWS = [
  { tag: 'desktop-2x', width: 1920, height: 1080, dpr: 2 },
  { tag: 'square-2x',  width: 1080, height: 1080, dpr: 2 },
];

const browser = await chromium.launch();
for (const v of VIEWS) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.dpr,
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  for (const s of SHOTS) {
    const file = `${OUT}/${s.name}_${v.tag}.png`;
    if (existsSync(file)) { console.log('skip ', file); continue; }
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), s.scrollY);
    await page.waitForTimeout(s.waitMs);
    try {
      await page.screenshot({ path: file, type: 'png', timeout: 90000, animations: 'disabled' });
      console.log('wrote', file);
    } catch (e) {
      console.log('FAIL ', file, '-', e.message.split('\n')[0]);
    }
  }
  await ctx.close();
}

// Mobile hero
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const file = `${OUT}/07-hero_mobile-3x.png`;
  if (!existsSync(file)) {
    try {
      await page.screenshot({ path: file, type: 'png', timeout: 90000, animations: 'disabled' });
      console.log('wrote', file);
    } catch (e) { console.log('FAIL ', file, '-', e.message.split('\n')[0]); }
  } else { console.log('skip ', file); }
  await ctx.close();
}

await browser.close();
console.log('\\nDone. Files in', OUT);
