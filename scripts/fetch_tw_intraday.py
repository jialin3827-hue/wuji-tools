#!/usr/bin/env python3
"""TW intraday quotes from TWSE MIS (free, no key, ~5-40s delay). Writes market/data/tw_intraday.json.
Price = last trade z; if z is '-' use mid of best bid/ask. Drops quotes older than MAX_AGE or not today."""
import json, os, sys, time, urllib.request, datetime as dt
ROOT = os.path.join(os.path.dirname(__file__), '..', 'market', 'data')
MAX_AGE = int(os.environ.get('MAX_AGE_MIN', '15')) * 60 * 1000
TZ = dt.timezone(dt.timedelta(hours=8))
def num(x):
    try: v = float(x); return v if v > 0 else None
    except Exception: return None
def first(s): return num((s or '').split('_')[0])
def main():
    lst = json.load(open(os.path.join(ROOT, 'tw.json')))['list']
    chans = [('otc_' if x.get('m') == '上櫃' else 'tse_') + x['s'] + '.tw' for x in lst]
    limit = int(os.environ.get('LIMIT', '0') or 0)
    if limit: chans = chans[:limit]
    now = int(time.time() * 1000); today = dt.datetime.now(TZ).strftime('%Y%m%d')
    q, bad = {}, 0
    for i in range(0, len(chans), 100):
        url = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?json=1&delay=0&ex_ch=' + '|'.join(chans[i:i+100])
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 wuji-tools', 'Referer': 'https://mis.twse.com.tw/stock/index.jsp'})
                arr = json.load(urllib.request.urlopen(req, timeout=20)).get('msgArray', [])
                break
            except Exception as e:
                arr = None; time.sleep(3)
        for r in arr or []:
            ts = int(r.get('tlong') or 0)
            if (r.get('d') != today and not os.environ.get('MAX_AGE_MIN')) or now - ts > MAX_AGE: bad += 1; continue
            p = num(r.get('z')); mid = 0
            if p is None:
                b, a = first(r.get('b')), first(r.get('a'))
                if b and a: p, mid = round((a + b) / 2, 2), 1
                else: p = b or a; mid = 1
            if p is None: bad += 1; continue
            q[r['c']] = [p, ts, num(r.get('y')), mid]
        time.sleep(1.2)
    if not q:
        print('no fresh quotes (market closed or source stale); keeping previous file'); return
    out = {'t': now, 'src': '證交所 MIS 盤中（延遲約 5–40 秒）', 'n': len(q), 'q': q}
    json.dump(out, open(os.path.join(ROOT, 'tw_intraday.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'wrote {len(q)} quotes, dropped {bad} stale/empty, of {len(chans)}')
if __name__ == '__main__': main()
