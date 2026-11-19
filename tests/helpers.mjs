import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function resolveBrowser(explicit) {
  const candidates = [];
  if (explicit && explicit !== 'auto') candidates.push(explicit);
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  try {
    for (const dir of fs.readdirSync(cache)) {
      for (const rel of [
        'chrome-linux/chrome',
        'chrome-linux64/chrome',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
        'chrome-win/chrome.exe'
      ]) {
        candidates.push(path.join(cache, dir, rel));
      }
    }
  } catch (e) {}
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch (e) {
      return false;
    }
  }) || null;
}

export function isGoatcounter(url) {
  try {
    return /(^|\.)goatcounter\.com$/i.test(new URL(url).hostname);
  } catch (e) {
    return false;
  }
}

export function parseEvent(url, request) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return { path: '', event: false, title: undefined };
  }
  const get = (name) => {
    const value = parsed.searchParams.get(name);
    if (value) return value;
    const body = request && request.postData && request.postData();
    if (!body) return '';
    try {
      const form = new URLSearchParams(body);
      return form.get(name) || '';
    } catch (e) {
      return '';
    }
  };
  const rawPath = get('p') || get('path') || '';
  const flag = get('e') || get('event') || '';
  const title = get('t') || get('title') || undefined;
  return {
    path: rawPath,
    event: flag === '1' || flag === 'true',
    title: title || undefined
  };
}

export function createRecorder() {
  const items = [];
  const violations = [];
  const listeners = [];
  return {
    items,
    violations,
    add(url, request) {
      const parsed = parseEvent(url, request);
      items.push({
        url,
        path: parsed.path,
        event: parsed.event,
        title: parsed.title,
        recordedAt: Date.now()
      });
      for (const listener of listeners.slice()) listener();
    },
    violation(url) {
      violations.push(url);
    },
    onAdd(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }
  };
}

export function waitForCount(recorder, expected, timeout = 12000) {
  if (recorder.items.length >= expected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const off = recorder.onAdd(() => {
      if (recorder.items.length >= expected) {
        clearTimeout(timer);
        off();
        resolve();
      }
    });
    const timer = setTimeout(() => {
      off();
      reject(new Error(`等待事件逾時：預期 ${expected} 筆，實際 ${recorder.items.length} 筆`));
    }, timeout);
  });
}

export function attachInterception(context, recorder, options = {}) {
  context.route('**/*', (route) => {
    const request = route.request();
    const url = request.url();
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch (e) {}
    if (isGoatcounter(url)) {
      recorder.add(url, request);
      return route.abort();
    }
    if (url.includes('gc.zgo.at/count.js')) {
      if (options.offline) {
        const fulfill = () => route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: options.offlineBody || ''
        });
        if (options.delayMs) return new Promise((resolve) => setTimeout(resolve, options.delayMs)).then(fulfill);
        return fulfill();
      }
      if (options.delayMs) {
        return new Promise((resolve) => setTimeout(resolve, options.delayMs)).then(() => route.continue());
      }
      return route.continue();
    }
    if (host === '127.0.0.1' || host === 'localhost') return route.continue();
    return route.abort();
  });

  context.route('**/*goatcounter.com/**', (route) => {
    recorder.add(route.request().url(), route.request());
    return route.abort();
  });

  context.on('requestfinished', (request) => {
    if (isGoatcounter(request.url())) recorder.violation(request.url());
  });
}

export async function checkLayout(page, selectors) {
  return page.evaluate((targets) => {
    const doc = document.documentElement;
    const result = {
      horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      ctaVisible: true,
      ctaClickable: true,
      textClipped: false,
      overlap: false
    };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cards = ['#resultCard', '#tianganCard']
      .map((selector) => document.querySelector(selector))
      .filter((el) => el && !el.hidden && el.getBoundingClientRect().width > 0);
    if (cards.length === 2) {
      const a = cards[0].getBoundingClientRect();
      const b = cards[1].getBoundingClientRect();
      result.overlap = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    }
    for (const selector of targets) {
      const el = document.querySelector(selector);
      if (!el) {
        result.ctaVisible = false;
        result.ctaClickable = false;
        continue;
      }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.top < -1 || rect.left < -1 || rect.bottom > vh + 1 || rect.right > vw + 1) {
        result.ctaVisible = false;
      }
      const x = Math.min(Math.max(rect.left + rect.width / 2, 0), vw - 1);
      const y = Math.min(Math.max(rect.top + rect.height / 2, 0), vh - 1);
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(el.contains(hit) || hit.contains(el))) result.ctaClickable = false;
      if (el.scrollWidth > el.clientWidth + 1) result.textClipped = true;
    }
    for (const selector of ['#resultCard', '#tianganCard', '.card']) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (node.scrollWidth > node.clientWidth + 1) result.textClipped = true;
      }
    }
    return result;
  }, selectors);
}
