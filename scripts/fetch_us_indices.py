#!/usr/bin/env python3
"""US intraday market indices (S&P 500 / Nasdaq / Dow) via Yahoo Finance chart API.
Free, no API key. Writes market/data/us_indices.json. Skips commit-worthy empty runs
when the US regular session is closed (so cron covering both DST windows stays cheap)."""
import json, os, sys, time, urllib.request, datetime as dt
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo  # type: ignore

ROOT = os.path.join(os.path.dirname(__file__), '..', 'market', 'data')
OUT = os.path.join(ROOT, 'us_indices.json')
SYMS = [
    ('^GSPC', 'S&P 500'),
    ('^IXIC', '那斯達克'),
    ('^DJI', '道瓊'),
]
NY = ZoneInfo('America/New_York')
UA = 'Mozilla/5.0 (compatible; wuji-tools/1.0; +https://github.com/jialin3827-hue/wuji-tools)'

def us_session(now=None):
    now = now or dt.datetime.now(NY)
    # Mon-Fri 09:30–16:00 America/New_York (DST handled by zoneinfo)
    if now.weekday() >= 5:
        return False
    mins = now.hour * 60 + now.minute
    return 9 * 60 + 30 <= mins < 16 * 60

def fetch(sym):
    url = (f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(sym)}'
           f'?range=1d&interval=1m&includePrePost=false')
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    res = (data.get('chart') or {}).get('result') or []
    if not res:
        raise RuntimeError('no result for ' + sym)
    m = res[0]['meta']
    p = m.get('regularMarketPrice')
    pc = m.get('chartPreviousClose') or m.get('previousClose')
    ts = int(m.get('regularMarketTime') or 0) * 1000
    if not p or not ts:
        raise RuntimeError('incomplete meta for ' + sym)
    return {'s': sym, 'n': dict(SYMS)[sym], 'p': round(float(p), 2),
            'pc': round(float(pc), 2) if pc else None, 'ts': ts}

def main():
    force = os.environ.get('FORCE') == '1'
    open_now = us_session()
    if not open_now and not force:
        # Still refresh the file once with last close so UI has 已收盤 + update time,
        # but only if file is older than 6h (avoid burning Actions minutes after close).
        try:
            prev = json.load(open(OUT))
            if time.time() * 1000 - prev.get('t', 0) < 6 * 3600 * 1000:
                print('US session closed and file fresh; skip')
                return
        except Exception:
            pass
    items, err = [], []
    for sym, _ in SYMS:
        for attempt in range(3):
            try:
                items.append(fetch(sym)); break
            except Exception as e:
                err.append(f'{sym}:{e}'); time.sleep(1.5 * (attempt + 1))
        time.sleep(0.4)
    if len(items) < 1:
        print('fetch failed:', '; '.join(err)); sys.exit(0)  # keep previous file
    now = int(time.time() * 1000)
    out = {
        't': now,
        'open': open_now,
        'src': 'Yahoo Finance chart（延遲約 0–15 分鐘）',
        'items': items,
    }
    os.makedirs(ROOT, exist_ok=True)
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f"wrote {len(items)} indices, open={open_now}, dropped_err={len(err)}")

if __name__ == '__main__':
    main()
