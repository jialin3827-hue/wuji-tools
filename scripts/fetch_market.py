#!/usr/bin/env python3
"""月光股市 data: free daily OHLCV -> market/data/{tw,us}.json + per-ticker bars.
TW: TWSE/TPEx open data (STOCK_DAY_ALL + tpex daily quotes for today's bar;
    TWSE STOCK_DAY / TPEx tradingStock monthly history for backfill, rate-limited).
US: Yahoo Finance public chart endpoint (no key); fallback api.nasdaq.com historical.
    (Stooq CSV now returns a JS bot-check page, so it is not used.)
Usage: fetch_market.py [tw|us|all]. On failure for a ticker the previous file is kept."""
import json, os, sys, time, urllib.request, datetime as dt
ROOT = os.path.join(os.path.dirname(__file__), '..', 'market', 'data')
UA = {'User-Agent': 'Mozilla/5.0 (wuji-tools static site; daily)', 'Accept': 'application/json'}
KEEP = 260                     # bars kept per ticker (~1 year)
BACKFILL_MONTHS = 7            # ~6 months of TW history
TW_REQ_BUDGET = int(os.environ.get('TW_REQ_BUDGET', '40'))  # max history requests per run
LAST_DIVS = None
TZ8 = dt.timezone(dt.timedelta(hours=8))
TW = ['2330','2317','2454','2308','2382','2412','2881','2882','2891','2886','2884','2892','2885','5880','2880',
      '2303','2002','1301','1303','2603','2609','2615','3711','2357','2379','3034','2345','3008','2327','2395',
      '3231','2356','6669','2301','1216','2207','2912','1101','2618','2610','3045','4904',
      '0050','0056','00878','00919','00929','006208','00713','00692','00881','00940',
      '6488','3105','5347','8069','3529','5274']
US = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','TSM','AMD','NFLX','INTC','QCOM','ORCL','CRM','ADBE',
      'COST','WMT','KO','PEP','MCD','DIS','NKE','JPM','BAC','V','MA','BRK-B','JNJ','PFE','LLY','UNH','XOM','CVX',
      'BA','UBER','PLTR','SBUX','ABNB','COIN','ARM','MU',
      'SPY','QQQ','VOO','VTI','DIA','IWM','SOXX','SMH','VYM','SCHD','TLT','GLD']
ETF_NAMES = {'SPY':'SPDR S&P 500 ETF','QQQ':'Invesco QQQ (Nasdaq-100)','VOO':'Vanguard S&P 500 ETF','VTI':'Vanguard Total Stock Market ETF',
             'DIA':'SPDR Dow Jones ETF','IWM':'iShares Russell 2000 ETF','SOXX':'iShares Semiconductor ETF','SMH':'VanEck Semiconductor ETF',
             'VYM':'Vanguard High Dividend Yield ETF','SCHD':'Schwab US Dividend Equity ETF','TLT':'iShares 20+ Year Treasury ETF','GLD':'SPDR Gold Shares'}

def get(url, tries=2):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            print('WARN', url, e, file=sys.stderr); time.sleep(4)
    return None

def load(p, default):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return default

def dump(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True); tmp = p + '.tmp'
    json.dump(obj, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); os.replace(tmp, p)

def num(x):
    try:
        v = float(str(x).replace(',', '').replace('$', '').strip()); return v if v == v else None
    except Exception: return None

def roc(s):
    s = s.strip().replace('/', ''); return f'{int(s[:-4])+1911:04d}-{s[-4:-2]}-{s[-2:]}'

def merge(old, new):
    m = {b[0]: b for b in old}
    for b in new:
        if all(x is not None and x > 0 for x in b[1:5]): m[b[0]] = b
    return [m[k] for k in sorted(m)][-KEEP:]

def now8(): return dt.datetime.now(TZ8).strftime('%Y-%m-%d %H:%M')

def snapshot(mkt, syms, meta):
    out = []
    for s in syms:
        f = load(os.path.join(ROOT, mkt, s + '.json'), None)
        if not f or not f['bars']: continue
        b = f['bars'][-1]; pc = f['bars'][-2][4] if len(f['bars']) > 1 else b[4]
        out.append({'s': s, 'n': f['n'], 'm': f.get('m', ''), 'd': b[0], 'o': b[1], 'h': b[2], 'l': b[3], 'c': b[4], 'v': b[5], 'pc': pc})
    asof = max((x['d'] for x in out), default=None)
    dump(os.path.join(ROOT, mkt + '.json'), {'updated': now8(), 'asof': asof, 'src': meta, 'list': out})
    print(mkt, 'snapshot', len(out), 'asof', asof)

def run_tw():
    today = {}
    a = get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
    for r in a or []:
        if r.get('Code') in TW and r.get('Date'):
            today[r['Code']] = ('上市', r['Name'].strip(), [roc(r['Date']), num(r.get('OpeningPrice')), num(r.get('HighestPrice')),
                                num(r.get('LowestPrice')), num(r.get('ClosingPrice')), int(num(r.get('TradeVolume')) or 0)])
    time.sleep(2)
    b = get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes')
    for r in b or []:
        c = r.get('SecuritiesCompanyCode', '').strip()
        if c in TW and r.get('Date'):
            today[c] = ('上櫃', r['CompanyName'].strip(), [roc(r['Date']), num(r.get('Open')), num(r.get('High')),
                         num(r.get('Low')), num(r.get('Close')), int(num(r.get('TradingShares')) or 0)])
    budget = TW_REQ_BUDGET; td = dt.date.today()
    months = []
    y, mo = td.year, td.month
    for i in range(BACKFILL_MONTHS):  # current month back ~6 months, calendar stepping
        months.append(dt.date(y, mo, 1)); y, mo = (y, mo - 1) if mo > 1 else (y - 1, 12)
    for s in TW:
        p = os.path.join(ROOT, 'tw', s + '.json')
        f = load(p, {'s': s, 'n': s, 'm': '', 'bars': [], 'months': []})
        if s in today:
            f['m'], f['n'] = today[s][0], today[s][1]; f['bars'] = merge(f['bars'], [today[s][2]])
        for mo in months:  # backfill missing months, oldest needed first, polite rate
            key = mo.strftime('%Y-%m')
            if key in f.get('months', []) or budget <= 0 or not f['m']: continue
            budget -= 1; time.sleep(3); rows = []
            if f['m'] == '上市':
                j = get(f'https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date={mo:%Y%m}01&stockNo={s}')
                if j and j.get('stat') == 'OK':
                    rows = [[roc(x[0]), num(x[3]), num(x[4]), num(x[5]), num(x[6]), int(num(x[1]) or 0)] for x in j.get('data', [])]
                ok = j is not None
            else:
                j = get(f'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code={s}&date={mo:%Y/%m}/01&response=json')
                for t in (j or {}).get('tables', []):
                    rows += [[roc(x[0]), num(x[3]), num(x[4]), num(x[5]), num(x[6]), int((num(x[1]) or 0) * 1000)] for x in t.get('data', [])]
                ok = j is not None
            f['bars'] = merge(f['bars'], rows)
            if ok and rows:  # current month: fetched once, later days come from the daily snapshot
                f['months'] = sorted(set(f.get('months', [])) | {key})[-24:]
        if f['bars']: dump(p, f)
    print('tw history requests left', budget)
    snapshot('tw', TW, 'TWSE/TPEx 開放資料（盤後）')

def us_yahoo(s):
    j = get(f'https://query1.finance.yahoo.com/v8/finance/chart/{s}?range=1y&interval=1d&events=div')
    r = ((j or {}).get('chart') or {}).get('result')
    if not r: return None, None
    r = r[0]; dv = (r.get('events') or {}).get('dividends') or {}
    global LAST_DIVS; LAST_DIVS = sorted([dt.datetime.fromtimestamp(x['date'] + (r.get('meta', {}).get('gmtoffset', -14400)), dt.timezone.utc).strftime('%Y-%m-%d'), round(x['amount'], 6)] for x in dv.values())
    q = r['indicators']['quote'][0]; meta = r.get('meta', {})
    off = meta.get('gmtoffset', -14400); bars = []
    for i, t in enumerate(r.get('timestamp') or []):
        d = dt.datetime.fromtimestamp(t + off, dt.timezone.utc).strftime('%Y-%m-%d')
        o, h, l, c, v = (q[k][i] for k in ('open', 'high', 'low', 'close', 'volume'))
        if None in (o, h, l, c): continue
        bars.append([d, round(o, 4), round(h, 4), round(l, 4), round(c, 4), int(v or 0)])
    return bars, meta.get('longName') or meta.get('shortName')

def us_nasdaq(s):
    cls = 'etf' if s in ETF_NAMES else 'stocks'; fr = (dt.date.today() - dt.timedelta(days=370)).isoformat()
    j = get(f'https://api.nasdaq.com/api/quote/{s.replace("-", ".")}/historical?assetclass={cls}&fromdate={fr}&limit=400')
    rows = (((j or {}).get('data') or {}).get('tradesTable') or {}).get('rows') or []
    bars = []
    for x in rows:
        m, d, y = x['date'].split('/')
        bars.append([f'{y}-{m}-{d}', num(x['open']), num(x['high']), num(x['low']), num(x['close']), int(num(x['volume']) or 0)])
    return (bars or None), None

def run_us():
    srcs = set()
    for s in US:
        p = os.path.join(ROOT, 'us', s + '.json')
        f = load(p, {'s': s, 'n': ETF_NAMES.get(s, s), 'm': 'ETF' if s in ETF_NAMES else '', 'bars': []})
        global LAST_DIVS; LAST_DIVS = None
        bars, name = us_yahoo(s); src = 'Yahoo Finance chart（延遲/收盤）'
        if not bars:
            time.sleep(1); bars, name = us_nasdaq(s); src = 'Nasdaq.com historical（收盤）'
        if bars:
            srcs.add(src); f['bars'] = merge(f['bars'], bars)
            if name and s not in ETF_NAMES: f['n'] = name
            if LAST_DIVS is not None:  # Yahoo dividend events (ex-date, cash per share); kept 400 days
                old = {d[0]: d for d in f.get('divs', [])}; old.update({d[0]: d for d in LAST_DIVS})
                f['divs'] = [old[k] for k in sorted(old)][-12:]
            dump(p, f)
        time.sleep(1.2)
    snapshot('us', US, '、'.join(sorted(srcs)) or '前次資料')

if __name__ == '__main__':
    w = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if w in ('tw', 'all'): run_tw()
    if w in ('us', 'all'): run_us()
