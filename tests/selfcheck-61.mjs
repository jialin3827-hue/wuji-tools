import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './static-server.mjs';
import { resolveBrowser, isGoatcounter, parseEvent } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = '/home/box/team-shared/digital-products/taisui2027-qa';
const prefix = 'orange-qr-';
fs.mkdirSync(outDir, { recursive: true });

const issues = [];
const notes = [];
function ok(msg) { notes.push('OK  ' + msg); console.log('OK  ' + msg); }
function fail(msg) { issues.push(msg); console.error('FAIL ' + msg); }

async function main() {
  const browserPath = resolveBrowser('auto');
  if (!browserPath) throw new Error('找不到 Chrome / Chromium');
  const server = await startServer();
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--font-render-hinting=none']
  });

  const eventsByView = {};
  for (const width of [390, 1280]) {
    const height = width === 390 ? 844 : 900;
    const label = width === 390 ? 'mobile-390' : 'desktop-1280';
    const context = await browser.newContext({
      viewport: { width, height },
      acceptDownloads: true,
      locale: 'zh-TW'
    });
    const page = await context.newPage();
    const events = [];
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (isGoatcounter(url) || /gc\.zgo\.at/i.test(url) && /\/count(\?|$)/.test(url)) {
        const parsed = parseEvent(url, route.request());
        events.push(parsed);
        await route.abort();
        return;
      }
      await route.continue();
    });

    await page.goto(server.url + '/taisui2027/', { waitUntil: 'domcontentloaded' });

    // footer + CTA present at rest
    const footer = await page.locator('footer').innerText();
    if (!footer.includes('屬文化與心靈參考')) fail(label + ' 頁尾沒有「屬文化與心靈參考」');
    else ok(label + ' 頁尾有免責句');

    await page.fill('#year', '1991');
    await page.click('#btnQuery');
    await page.waitForSelector('#resultCard:not([hidden])', { state: 'visible' });
    await page.waitForTimeout(400);

    const cta = page.locator('#ctaResult');
    if (!await cta.isVisible()) fail(label + ' 結果購買按鈕不可見');
    const ctaText = (await cta.innerText()).trim();
    if (ctaText !== '幫全家一次查好 2027 行動卡') fail(label + ' 按鈕文字錯誤：' + ctaText);
    else ok(label + ' 結果按鈕文字正確');
    const href = await cta.getAttribute('href');
    if (!href || !href.startsWith('https://payhip.com/b/WAJsu')) fail(label + ' 結果按鈕連結不是 WAJsu：' + href);
    else if (!href.includes('utm_source=taisui2027') || !href.includes('utm_content=result_cta')) fail(label + ' 結果按鈕缺少 utm：' + href);
    else ok(label + ' 結果按鈕連結與 utm 正確');

    // prefill of card members from query
    const firstZodiac = await page.locator('#cardMembers .cz').first().inputValue();
    if (firstZodiac !== '羊') fail(label + ' 查詢後未帶入生肖羊，得到：' + firstZodiac);
    else ok(label + ' 查詢結果已帶入圖卡（屬羊）');

    // screenshot of query result
    await page.screenshot({ path: path.join(outDir, `${prefix}${label}-query.png`), fullPage: true });

    // generate family card with 3 people
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#cardMembers .member-item');
      rows.forEach((r) => r.remove());
      window.Taisui2027.prefillCardMembers([
        { name: '爸', zodiac: '牛' },
        { name: '媽', zodiac: '羊' },
        { name: '我', zodiac: '虎' }
      ]);
    });
    await page.click('#btnMakeCard');
    await page.waitForSelector('#familyCardBox:not([hidden])', { state: 'visible' });
    await page.waitForTimeout(300);

    const dataUrl = await page.evaluate(() => document.getElementById('familyCardCanvas').toDataURL('image/png'));
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const cardPath = path.join(outDir, `${prefix}${label}-card.png`);
    fs.writeFileSync(cardPath, buf);
    if (buf.length < 20000) fail(label + ' 圖卡檔過小：' + buf.length);
    else ok(label + ' 圖卡已產生 ' + buf.length + ' bytes');

    const qrUrl = await page.evaluate(() => window.Taisui2027 && window.Taisui2027.QR_URL);
    if (!qrUrl || !qrUrl.includes('utm_source=family_card_qr')) fail(label + ' QR_URL 缺少 utm：' + qrUrl);
    else ok(label + ' QR_URL 含 utm_source=family_card_qr');
    if (qrUrl && !qrUrl.startsWith('https://jialin3827-hue.github.io/wuji-tools/taisui2027/')) {
      fail(label + ' QR_URL 不是查詢頁：' + qrUrl);
    }

    const decoded = execFileSync('zbarimg', ['--raw', '-q', cardPath], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
    if (decoded !== qrUrl) fail(label + ' zbar 解碼不符：' + JSON.stringify(decoded) + ' 期望 ' + qrUrl);
    else ok(label + ' zbar 解出 ' + decoded);

    const cta2 = page.locator('#ctaFamilyCard');
    if (!await cta2.isVisible()) fail(label + ' 圖卡下購買按鈕不可見');
    const href2 = await cta2.getAttribute('href');
    if (!href2 || !href2.includes('utm_content=family_card_cta') || !href2.includes('payhip.com/b/WAJsu')) {
      fail(label + ' 圖卡按鈕連結錯誤：' + href2);
    } else ok(label + ' 圖卡按鈕連結與 utm 正確');

    // download
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.click('#btnDownloadCard')
    ]);
    const saveAs = path.join(outDir, `${prefix}${label}-download.png`);
    await download.saveAs(saveAs);
    const dlSize = fs.statSync(saveAs).size;
    if (dlSize < 20000) fail(label + ' 下載檔過小：' + dlSize);
    else ok(label + ' 下載成功 ' + download.suggestedFilename() + ' ' + dlSize + ' bytes');

    // click purchase button (new tab) and capture event
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 8000 }).catch(() => null),
      cta2.click()
    ]);
    if (popup) {
      const popUrl = popup.url();
      if (!popUrl.includes('payhip.com/b/WAJsu')) fail(label + ' 彈出分頁不是 Payhip：' + popUrl);
      else ok(label + ' 購買按鈕打開 Payhip');
      await popup.close().catch(() => {});
    } else {
      notes.push(label + ' 沒攔到 popup（仍檢查點擊事件）');
    }

    await page.waitForTimeout(800);
    eventsByView[label] = events;
    const paths = events.filter((e) => e.event).map((e) => e.path);
    const need = ['event/taisui-query', 'event/family-card', 'event/cta-payhip-family-card'];
    for (const n of need) {
      if (paths.includes(n)) ok(label + ' 送出事件 ' + n);
      else fail(label + ' 缺少事件 ' + n + '；實際=' + JSON.stringify(paths));
    }

    await page.screenshot({ path: path.join(outDir, `${prefix}${label}-full.png`), fullPage: true });
    await context.close();
  }

  await browser.close();
  await server.close();
  fs.writeFileSync(path.join(outDir, prefix + 'selfcheck.json'), JSON.stringify({ notes, issues, eventsByView }, null, 2));
  console.log('\n==== SUMMARY ====');
  console.log('issues', issues.length);
  if (issues.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
