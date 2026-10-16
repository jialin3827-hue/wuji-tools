#!/usr/bin/env python3
"""Fetch free public TWSE/TPEx open data -> budget/data/*.json.
Low request count; on any source failure the previous JSON is kept."""
import re, json, os, sys, time, urllib.request, datetime as dt
D = os.path.join(os.path.dirname(__file__), '..', 'budget', 'data')
UA = {'User-Agent': 'Mozilla/5.0 (wuji-tools static site; daily)'}
HIST_DAYS = 60
OK = re.compile(r'^(\d{4}|00\d{2,4}[A-Z]?)$').match  # stocks & ETFs only (no warrants)
BACKFILL = int(os.environ.get('BACKFILL', '3'))  # max missing days fetched per run

def get(url):
    for i in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            print('WARN', url, e, file=sys.stderr); time.sleep(5)
    return None

def load(n, default):
    try: return json.load(open(os.path.join(D, n), encoding='utf-8'))
    except Exception: return default

def dump(n, obj):
    p = os.path.join(D, n); tmp = p + '.tmp'
    json.dump(obj, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, p)

def roc(s):  # 1151015 -> 2026-10-15
    s = s.strip().replace('/', '')
    return f'{int(s[:-4])+1911:04d}-{s[-4:-2]}-{s[-2:]}'

def num(x):
    try:
        v = float(str(x).replace(',', '').strip()); return v if v > 0 else None
    except Exception: return None

def main():
    os.makedirs(D, exist_ok=True)
    prices = load('prices.json', {'updated': None, 'stocks': {}})
    hist = load('history.json', {'dates': [], 'c': {}})
    stocks = prices.get('stocks', {}); ok = False
    snaps = {}  # date -> {code: close}
    tw = get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
    if tw:
        for r in tw:
            c = num(r.get('ClosingPrice'))
            if c and r.get('Date'):
                d = roc(r['Date']); stocks[r['Code']] = {'n': r['Name'].strip(), 'c': c, 'd': d, 'm': '上市'}
                snaps.setdefault(d, {})[r['Code']] = c
        ok = True
    time.sleep(2)
    tp = get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes')
    if tp:
        for r in tp:
            c = num(r.get('Close')); code = r.get('SecuritiesCompanyCode', '').strip()
            if c and code and r.get('Date'):
                d = roc(r['Date']); stocks[code] = {'n': r['CompanyName'].strip(), 'c': c, 'd': d, 'm': '上櫃'}
                snaps.setdefault(d, {})[code] = c
        ok = True
    # backfill a few missing past trading days (1 request per market per day)
    have = set(hist['dates']) | set(snaps)
    day = dt.date.today() - dt.timedelta(days=1); fetched = 0; tries = 0
    while fetched < BACKFILL and tries < 120 and len(have) < HIST_DAYS:
        tries += 1; day -= dt.timedelta(days=1) if tries > 1 else dt.timedelta(0)
        ds = day.isoformat()
        if day.weekday() >= 5 or ds in have: continue
        time.sleep(3)
        j = get(f'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={day:%Y%m%d}&type=ALLBUT0999&response=json')
        rows = []
        for t in (j or {}).get('tables', []):
            if t.get('fields') and t['fields'][0] == '證券代號': rows = [(x[0], x[8]) for x in t['data']]
        if not rows: have.add(ds); continue  # holiday / no data
        time.sleep(3)
        o = get(f'https://www.tpex.org.tw/www/zh-tw/afterTrading/otc?date={day:%Y/%m/%d}&type=EW&response=json')
        for t in (o or {}).get('tables', []):
            if t.get('fields') and t['fields'][0].strip() == '代號': rows += [(x[0], x[2]) for x in t['data']]
        snaps[ds] = {k.strip(): num(v) for k, v in rows if num(v)}; have.add(ds); fetched += 1
    # merge snapshots into compact history: dates[] + per-code close array aligned to dates
    allmap = {d: {} for d in hist['dates']}
    for i, d in enumerate(hist['dates']):
        for code, arr in hist['c'].items():
            if i < len(arr) and arr[i] is not None: allmap[d][code] = arr[i]
    for d, m in snaps.items(): allmap.setdefault(d, {}).update(m)
    dates = sorted(allmap)[-HIST_DAYS:]
    stocks = {k: v for k, v in stocks.items() if OK(k)}
    codes = set(stocks)
    hist = {'dates': dates, 'c': {c: [allmap[d].get(c) for d in dates] for c in sorted(codes)}}
    # dividends (upcoming + recent announcements), merged & kept 400 days
    div = load('dividends.json', {'updated': None, 'list': []})
    keyed = {(x['code'], x['ex']): x for x in div['list']}
    a = get('https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL'); time.sleep(2)
    b = get('https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost')
    for r in a or []:
        if r.get('Date'):
            keyed[(r['Code'].strip(), roc(r['Date']))] = {'code': r['Code'].strip(), 'ex': roc(r['Date']), 'cash': num(r.get('CashDividend')) or 0, 'stock': num(r.get('StockDividendRatio')) or 0}
    for r in b or []:
        if r.get('ExRrightsExDividendDate'):
            k = r['SecuritiesCompanyCode'].strip()
            keyed[(k, roc(r['ExRrightsExDividendDate']))] = {'code': k, 'ex': roc(r['ExRrightsExDividendDate']), 'cash': num(r.get('CashDividend')) or 0, 'stock': num(r.get('StockDividendRatio')) or 0}
    cut = (dt.date.today() - dt.timedelta(days=400)).isoformat()
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')
    if a is not None or b is not None:
        dump('dividends.json', {'updated': now, 'list': sorted([x for x in keyed.values() if x['ex'] >= cut and (x['cash'] or x['stock'])], key=lambda x: x['ex'])})
    if ok:
        dump('prices.json', {'updated': now, 'stocks': stocks})
    if ok or snaps:
        dump('history.json', hist)
    print('stocks', len(stocks), 'histdays', len(dates), 'divs', len(keyed))

if __name__ == '__main__':
    main()
