import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './static-server.mjs';
import {
  resolveBrowser,
  attachInterception,
  createRecorder,
  waitForCount,
  checkLayout
} from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, 'fixtures', 'count.js');
const heights = { 390: 844, 1280: 800 };

function parseArgs(argv) {
  let repeat = 1;
  let viewports = [390, 1280];
  let browser = 'auto';
  let offline = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--repeat') repeat = Number(argv[++i]);
    else if (arg.startsWith('--repeat=')) repeat = Number(arg.slice(9));
    else if (arg === '--viewport') viewports = String(argv[++i]).split(',').map(Number);
    else if (arg.startsWith('--viewport=')) viewports = arg.slice(11).split(',').map(Number);
    else if (arg === '--browser') browser = String(argv[++i] || 'auto');
    else if (arg.startsWith('--browser=')) browser = arg.slice(10);
    else if (arg === '--offline') offline = true;
    else throw new Error('未知的參數：' + arg);
  }
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error('--repeat 必須是正整數');
  if (!viewports.length || viewports.some((width) => !Number.isInteger(width) || width < 1)) {
    throw new Error('--viewport 必須是逗號分隔的正整數寬度');
  }
  return { repeat, viewports, browser, offline };
}

async function inject(ctx, html) {
  await ctx.page.evaluate((markup) => {
    const holder = document.createElement('div');
    holder.innerHTML = markup;
    while (holder.firstElementChild) document.body.appendChild(holder.firstElementChild);
  }, html);
}

const scenarios = [
  {
    id: 'S1',
    expected: ['event/cta-payhip-taisui-result'],
    selectors: ['#resultCard a[data-goatcounter-click]'],
    prepare: async (ctx) => {
      await ctx.goto();
      await ctx.page.fill('#year', '1991');
      await ctx.page.click('#btnQuery');
      await ctx.page.waitForSelector('#resultCard:not([hidden])', { state: 'visible' });
    }
  },
  {
    id: 'S2',
    expected: ['event/cta-payhip-tiangan'],
    selectors: ['#tianganCard a[data-goatcounter-click]'],
    prepare: async (ctx) => ctx.goto()
  },
  {
    id: 'S3',
    expected: ['event/cta-payhip-taisui-tg'],
    selectors: ['#tianganCard a.secondary[data-goatcounter-click]'],
    prepare: async (ctx) => ctx.goto()
  },
  {
    id: 'S4',
    expected: ['event/cta-payhip-tiangan'],
    selectors: ['#tianganCard a[data-goatcounter-click]'],
    prepare: async (ctx) => ctx.goto()
  },
  {
    id: 'S5',
    expected: ['event/cta-payhip-tiangan'],
    selectors: ['#tianganCard a[data-goatcounter-click]'],
    prepare: async (ctx) => ctx.goto()
  },
  {
    id: 'S6',
    expected: ['event/cta-payhip-tiangan', 'event/cta-payhip-tiangan', 'event/cta-payhip-tiangan'],
    selectors: ['#tianganCard a[data-goatcounter-click]'],
    prepare: async (ctx) => ctx.goto()
  },
  {
    id: 'S7',
    expected: ['event/tiangan-lookup'],
    selectors: ['#btnTiangan'],
    prepare: async (ctx) => {
      await ctx.goto();
      await ctx.page.fill('#tgDate', '1990-05-15');
    }
  },
  {
    id: 'S8',
    expected: ['event/tiangan-lookup'],
    selectors: ['#btnTiangan'],
    prepare: async (ctx) => ctx.goto('?d=1990-05-15')
  },
  {
    id: 'S9',
    expected: [],
    selectors: ['#btnTiangan'],
    allowDialogs: true,
    prepare: async (ctx) => {
      await ctx.goto();
      await ctx.page.evaluate(() => {
        document.getElementById('tgDate').value = '2020-02-30';
      });
      await ctx.page.click('#btnTiangan');
      await ctx.page.evaluate(() => {
        document.getElementById('tgDate').value = '1990-05-15';
        document.getElementById('tgResult').innerHTML = '<div class="result">測試</div>';
        document.getElementById('tgLate').click();
      });
      await ctx.page.waitForTimeout(600);
    }
  },
  {
    id: 'S10',
    expected: [],
    selectors: ['#tianganCard a[data-goatcounter-click]'],
    prepare: async (ctx) => {
      await ctx.goto();
      await ctx.page.click('a[href*="minglimr.com"]');
      await ctx.page.waitForTimeout(300);
    }
  },
  {
    id: 'S11',
    expected: ['event/cta-portaly-taisui2027-body-subscribe'],
    selectors: ['#injected'],
    prepare: async (ctx) => {
      await ctx.goto();
      await inject(ctx, '<a id="injected" style="display:inline-block;padding:10px" href="https://portaly.cc/x" target="_blank" rel="noopener" data-gc-event="subscribe">Portaly 訂閱</a>');
    }
  },
  {
    id: 'S12',
    expected: [
      'event/cta-payhip-taisui2027-promo-a-card',
      'event/cta-payhip-taisui2027-promo-b-card'
    ],
    selectors: ['#injectedA', '#injectedB'],
    prepare: async (ctx) => {
      await ctx.goto();
      await inject(ctx, [
        '<section id="promoA"><a id="injectedA" style="display:inline-block;padding:10px" href="https://payhip.com/b/x" target="_blank" rel="noopener" data-gc-event="card">方案 A</a></section>',
        '<section id="promoB"><a id="injectedB" style="display:inline-block;padding:10px" href="https://payhip.com/b/y" target="_blank" rel="noopener" data-gc-event="card">方案 B</a></section>'
      ].join(''));
    }
  }
];

function clickTargets(scenario, page) {
  if (scenario.id === 'S1') return page.click('#resultCard a[data-goatcounter-click]');
  if (scenario.id === 'S3') return page.click('#tianganCard a.secondary[data-goatcounter-click]');
  if (scenario.id === 'S6') {
    const selector = '#tianganCard a[data-goatcounter-click]';
    return (async () => {
      for (let i = 0; i < 3; i++) await page.click(selector, { force: true });
    })();
  }
  if (scenario.id === 'S7') return page.click('#btnTiangan');
  if (scenario.id === 'S11') return page.click('#injected');
  if (scenario.id === 'S12') {
    return (async () => {
      await page.click('#injectedA');
      await page.click('#injectedB');
    })();
  }
  if (scenario.id === 'S8' || scenario.id === 'S9' || scenario.id === 'S10') return Promise.resolve();
  return page.click('#tianganCard a[data-goatcounter-click]');
}

function tally(items) {
  const result = {};
  for (const item of items) result[item.path] = (result[item.path] || 0) + 1;
  return result;
}

async function runScenario(browser, serverUrl, viewportWidth, scenario, options, offlineBody) {
  const viewport = { width: viewportWidth, height: heights[viewportWidth] || 800 };
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  const recorder = createRecorder();
  const errors = [];
  const dialogs = [];
  const pages = [];
  attachInterception(context, recorder, {
    offline: options.offline,
    offlineBody,
    delayMs: scenario.id === 'S4' ? 1800 : 0
  });
  context.on('page', (popup) => {
    pages.push(popup);
    popup.on('pageerror', (error) => errors.push(String(error)));
    popup.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      dialog.dismiss().catch(() => {});
    });
  });

  try {
    const page = await context.newPage();
    pages.push(page);
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      dialog.dismiss().catch(() => {});
    });
    const ctx = {
      page,
      recorder,
      goto: (query = '') => page.goto(serverUrl + '/taisui2027/' + query, { waitUntil: 'domcontentloaded', timeout: 20000 })
    };
    await scenario.prepare(ctx);
    await clickTargets(scenario, page);
    if (scenario.expected.length) await waitForCount(recorder, scenario.expected.length);
    else await page.waitForTimeout(400);

    const intercepted = recorder.items.map((item) => ({
      path: item.path,
      event: item.event,
      title: item.title
    }));
    const layout = await checkLayout(page, scenario.selectors);
    const expectedTally = tally(scenario.expected.map((name) => ({ path: name })));
    const actualTally = tally(intercepted);
    const namesMatch = JSON.stringify(actualTally) === JSON.stringify(expectedTally);
    const layoutPass =
      !layout.horizontalOverflow && layout.ctaVisible && layout.ctaClickable &&
      !layout.textClipped && !layout.overlap;
    const passed =
      intercepted.length === scenario.expected.length &&
      namesMatch &&
      intercepted.every((item) => item.event === true) &&
      recorder.violations.length === 0 &&
      layoutPass &&
      errors.length === 0 &&
      (scenario.allowDialogs || dialogs.length === 0);

    return {
      scenario: scenario.id,
      viewport: `${viewport.width}x${viewport.height}`,
      expected: scenario.expected.length === 1 ? scenario.expected[0] : scenario.expected,
      expectedCount: scenario.expected.length,
      count: intercepted.length,
      intercepted,
      layout,
      violations: recorder.violations.length,
      pageErrors: errors,
      dialogs,
      passed
    };
  } finally {
    for (const page of pages) await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

function digestOf(results) {
  const stable = results
    .slice()
    .sort((a, b) => a.scenario.localeCompare(b.scenario) || a.viewport.localeCompare(b.viewport))
    .map((result) => ({
      scenario: result.scenario,
      viewport: result.viewport,
      expected: result.expected,
      count: result.count,
      paths: result.intercepted.map((item) => item.path).sort(),
      layout: result.layout,
      passed: result.passed
    }));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error('參數錯誤：' + error.message);
    process.exitCode = 2;
    return;
  }
  let server;
  let browser;
  try {
    const executablePath = resolveBrowser(options.browser);
    if (!executablePath) throw new Error('找不到可用的 Chrome／Chromium');
    const offlineBody = fs.readFileSync(fixturePath, 'utf8');
    server = await startServer();
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });

    const digests = [];
    for (let repeatIndex = 0; repeatIndex < options.repeat; repeatIndex++) {
      const results = [];
      for (const width of options.viewports) {
        for (const scenario of scenarios) {
          const result = await runScenario(browser, server.url, width, scenario, options, offlineBody);
          results.push(result);
          console.log(JSON.stringify(result));
        }
      }
      const digest = digestOf(results);
      const passed = results.every((result) => result.passed);
      console.log(JSON.stringify({ repeatIndex, digest, passed }));
      digests.push({ digest, passed });
    }

    const consistent = digests.every((item) => item.digest === digests[0].digest);
    process.exitCode = digests.every((item) => item.passed) && consistent ? 0 : 1;
    if (!consistent) console.error('重複回合摘要不一致');
  } catch (error) {
    console.error('環境錯誤：' + (error && error.message ? error.message : String(error)));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
}

main();
