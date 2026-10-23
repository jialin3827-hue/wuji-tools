#!/usr/bin/env python3
"""月光股市 data: free daily OHLCV -> market/data/{tw,us}.json + per-ticker bars.
TW: TWSE/TPEx open data (STOCK_DAY_ALL + tpex daily quotes for today's bar;
    TWSE STOCK_DAY / TPEx tradingStock monthly history for backfill, rate-limited).
US: Yahoo Finance public chart endpoint (no key); fallback api.nasdaq.com historical.
    (Stooq CSV now returns a JS bot-check page, so it is not used.)
Usage: fetch_market.py [tw|us|all]. On failure for a ticker the previous file is kept."""
import json, os, re, sys, time, urllib.request, datetime as dt
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
      '4961','6488','3105','5347','8069','3529','5274']
US = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','TSM','AMD','NFLX','INTC','QCOM','ORCL','CRM','ADBE',
      'COST','WMT','KO','PEP','MCD','DIS','NKE','JPM','BAC','V','MA','BRK-B','JNJ','PFE','LLY','UNH','XOM','CVX',
      'BA','UBER','PLTR','SBUX','ABNB','COIN','ARM','MU',
      'SPY','QQQ','VOO','VTI','DIA','IWM','SOXX','SMH','VYM','SCHD','TLT','GLD']
ETF_NAMES = {'SPY':'SPDR S&P 500 ETF','QQQ':'Invesco QQQ (Nasdaq-100)','VOO':'Vanguard S&P 500 ETF','VTI':'Vanguard Total Stock Market ETF',
             'DIA':'SPDR Dow Jones ETF','IWM':'iShares Russell 2000 ETF','SOXX':'iShares Semiconductor ETF','SMH':'VanEck Semiconductor ETF',
             'VYM':'Vanguard High Dividend Yield ETF','SCHD':'Schwab US Dividend Equity ETF','TLT':'iShares 20+ Year Treasury ETF','GLD':'SPDR Gold Shares'}

def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            print('WARN', url, e, file=sys.stderr); time.sleep(4 + 6 * i)
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

KEEP_ALL = 160                 # non-featured symbols: ~7.5 months (enough for MA60), keeps repo small
def rb(b): return [b[0]] + [r4(x) for x in b[1:5]] + [b[5]]
def merge(old, new, keep=KEEP):
    m = {b[0]: b for b in old}
    for b in new:
        if all(x is not None and x > 0 for x in b[1:5]): m[b[0]] = b
    return [m[k] for k in sorted(m)][-keep:]

def now8(): return dt.datetime.now(TZ8).strftime('%Y-%m-%d %H:%M')

def snapshot(mkt, syms, meta):
    out = []; have = set()
    for s in syms:
        f = load(os.path.join(ROOT, mkt, s + '.json'), None)
        if not f or not f['bars']: continue
        b = f['bars'][-1]; pc = f['bars'][-2][4] if len(f['bars']) > 1 else b[4]
        out.append({'s': s, 'n': f['n'], 'm': f.get('m', ''), 'd': b[0], 'o': b[1], 'h': b[2], 'l': b[3], 'c': b[4], 'v': b[5], 'pc': pc, 'f': 1}); have.add(s)
    asof = max((x['d'] for x in out), default=None)
    uni = load(os.path.join(ROOT, mkt, '_universe.json'), {}).get('list', [])
    for x in uni:  # every other listed symbol: compact row (client fills missing o/h/l/d)
        if x['s'] in have or not x.get('c'): continue
        r = {k: v for k, v in x.items() if v not in ('', None)}
        if r.get('d') == asof: r.pop('d', None)
        out.append(r)
    dump(os.path.join(ROOT, mkt + '.json'), {'updated': now8(), 'asof': asof, 'src': meta, 'n': len(out), 'list': out})
    print(mkt, 'snapshot', len(out), 'asof', asof)

TW_CODE = re.compile(r'\d{4}|00\d{2,4}[A-Z]?')
def r4(x): return None if x is None else round(x, 4 if x < 1 else 2)

def tw_bulk_today():
    """All TWSE + TPEx stocks/ETFs (no warrants) for the latest trading day: {code: (market, name, bar)}."""
    out = {}
    for r in get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL') or []:
        c = (r.get('Code') or '').strip()
        if TW_CODE.fullmatch(c) and r.get('Date'):
            out[c] = ('上市', r['Name'].strip(), [roc(r['Date']), num(r.get('OpeningPrice')), num(r.get('HighestPrice')),
                      num(r.get('LowestPrice')), num(r.get('ClosingPrice')), int(num(r.get('TradeVolume')) or 0)], num(r.get('Change')))
    time.sleep(2)
    for r in get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes') or []:
        c = (r.get('SecuritiesCompanyCode') or '').strip()
        if TW_CODE.fullmatch(c) and r.get('Date'):
            out[c] = ('上櫃', r['CompanyName'].strip(), [roc(r['Date']), num(r.get('Open')), num(r.get('High')),
                      num(r.get('Low')), num(r.get('Close')), int(num(r.get('TradingShares')) or 0)], num(r.get('Change')))
    return out

def tw_universe(today):
    rows = []
    for c in sorted(today):
        m, n, b, ch = today[c]
        if not b[4]: continue
        pc = round(b[4] - ch, 2) if ch is not None else b[4]
        rows.append({'s': c, 'n': n, 'm': m, 'd': b[0], 'o': b[1], 'h': b[2], 'l': b[3], 'c': b[4], 'v': b[5], 'pc': pc})
    if rows: dump(os.path.join(ROOT, 'tw', '_universe.json'), {'updated': now8(), 'list': rows})

def tw_append_all(today):
    """Append today's bulk bar to every non-featured TW file that already has history (no extra requests)."""
    n = 0
    for c, (m, nm, b, _) in today.items():
        if c in TW: continue
        p = os.path.join(ROOT, 'tw', c + '.json'); f = load(p, None)
        if not f: continue
        if f['bars'] and f['bars'][-1][0] >= b[0]: continue
        f['m'], f['n'] = m, nm; f['bars'] = merge(f['bars'], [b], KEEP_ALL); dump(p, f); n += 1
    print('tw appended', n)

def tw_backfill(seconds):
    """One-time ~1y history for ALL TW symbols from per-date bulk tables (TWSE MI_INDEX + TPEx dailyQuotes).
    Progress in tw/_backfill.json, resumes across runs, bounded by time."""
    st_p = os.path.join(ROOT, 'tw', '_backfill.json'); st = load(st_p, {'done': []}); done = set(st['done'])
    t0 = time.time(); td = dt.date.today(); days = []
    for i in range(1, 380):
        d = td - dt.timedelta(days=i)
        if d.weekday() < 5 and d.isoformat() not in done: days.append(d)
    if not days: print('tw backfill complete'); return
    files = {}
    def fileof(c, m, n):
        if c not in files:
            files[c] = load(os.path.join(ROOT, 'tw', c + '.json'), None) or {'s': c, 'n': n, 'm': m, 'bars': []}
        return files[c]
    for d in days:
        if time.time() - t0 > seconds: break
        iso = d.isoformat(); rows = []; ok = 0
        j = get(f'https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={d:%Y%m%d}&type=ALLBUT0999')
        if j is not None:
            ok += 1
            for t in j.get('tables', []):
                if '每日收盤行情' in (t.get('title') or ''):
                    rows += [('上市', x[0].strip(), x[1].strip(), [iso, num(x[5]), num(x[6]), num(x[7]), num(x[8]), int(num(x[2]) or 0)]) for x in t.get('data', [])]
        time.sleep(3)
        k = get(f'https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date={d:%Y/%m/%d}&response=json')
        if k is not None:
            ok += 1
            for t in k.get('tables', []):
                rows += [('上櫃', x[0].strip(), x[1].strip(), [iso, num(x[4]), num(x[5]), num(x[6]), num(x[2]), int(num(x[8]) or 0)]) for x in t.get('data', [])]
        time.sleep(3)
        for m, c, n, b in rows:
            if TW_CODE.fullmatch(c) and c not in TW:  # featured symbols keep their own monthly backfill
                f = fileof(c, m, n); f['bars'] = merge(f['bars'], [b], KEEP_ALL)
        if ok == 2: done.add(iso)
        print('tw backfill', iso, len(rows))
    for c, f in files.items():
        if f['bars']: dump(os.path.join(ROOT, 'tw', c + '.json'), f)
    st['done'] = sorted(done)[-400:]; dump(st_p, st); print('tw backfill files', len(files), 'days left', len(days) - len([d for d in days if d.isoformat() in done]))

def run_tw():
    today = tw_bulk_today()
    if today: tw_universe(today); tw_append_all(today)
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
    asof = max((load(os.path.join(ROOT, 'us', s + '.json'), {'bars': [['']]})['bars'][-1][0] for s in US), default=None)
    us_universe(asof)
    snapshot('us', US, '、'.join(sorted(srcs) + ['Nasdaq.com 全市場清單']) or '前次資料')

US_SYM = re.compile(r'[A-Z]{1,5}(-[A-Z])?')
US_SKIP = re.compile(r'\b(Warrants?|Rights?|Units?|Preferred|Depositary Shares? Each|Notes due|Debentures?)\b', re.I)
NASDAQ_H = dict(UA, **{'Accept': 'application/json, text/plain, */*', 'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'})
def short_name(n):
    return re.sub(r'\s+(Class [A-Z] )?(Common Stock|Ordinary Shares|Common Shares|American Depositary Shares|Shares of Beneficial Interest).*$', '', n or '').strip()

def us_universe(asof):
    """All NYSE/Nasdaq/AMEX common stocks + ETFs from the Nasdaq.com screener (one request each, no key)."""
    rows = {}
    def g(u):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=NASDAQ_H), timeout=60) as r: return json.loads(r.read().decode('utf-8'))
        except Exception as e: print('WARN', u, e, file=sys.stderr); return None
    j = g('https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true')
    for x in ((j or {}).get('data') or {}).get('rows') or []:
        sym = (x.get('symbol') or '').strip().replace('/', '-'); c = num(x.get('lastsale'))
        if not US_SYM.fullmatch(sym) or US_SKIP.search(x.get('name') or '') or not c: continue
        ch = num(x.get('netchange')) or 0
        rows[sym] = {'s': sym, 'n': short_name(x.get('name')) or sym, 'm': '', 'c': c, 'pc': round(c - ch, 4), 'v': int(num(x.get('volume')) or 0)}
    time.sleep(2)
    j = g('https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true')
    d = (j or {}).get('data') or {}
    for x in ((d.get('data') or {}).get('rows') if isinstance(d.get('data'), dict) else d.get('rows')) or []:
        sym = (x.get('symbol') or '').strip().replace('/', '-'); c = num(x.get('lastSalePrice'))
        if not US_SYM.fullmatch(sym) or not c or sym in rows: continue
        ch = num(x.get('netChange')) or 0
        rows[sym] = {'s': sym, 'n': (x.get('companyName') or sym).strip(), 'm': 'ETF', 'c': c, 'pc': round(c - ch, 4), 'v': 0}
    if len(rows) > 1000:
        for r in rows.values(): r['d'] = asof
        dump(os.path.join(ROOT, 'us', '_universe.json'), {'updated': now8(), 'list': [rows[k] for k in sorted(rows)]})
    print('us universe', len(rows))

def us_backfill(seconds):
    """Rolling Yahoo 1y history for non-featured US symbols: missing files first, then the stalest. Time-bounded."""
    uni = load(os.path.join(ROOT, 'us', '_universe.json'), {}).get('list', [])
    def age(x):
        f = load(os.path.join(ROOT, 'us', x['s'] + '.json'), None)
        return '' if not f or not f.get('bars') else f.get('u', f['bars'][-1][0])
    todo = sorted((x for x in uni if x['s'] not in US), key=age)
    t0 = time.time(); n = fail = 0
    for x in todo:
        if time.time() - t0 > seconds or fail >= 25: break
        global LAST_DIVS; LAST_DIVS = None
        bars, name = us_yahoo(x['s'])
        if not bars: fail += 1; time.sleep(2); continue
        fail = 0; p = os.path.join(ROOT, 'us', x['s'] + '.json')
        f = load(p, {'s': x['s'], 'n': x['n'], 'm': x.get('m', ''), 'bars': []})
        f['bars'] = merge(f['bars'], [rb(b) for b in bars], KEEP_ALL); f['u'] = now8()[:10]
        if LAST_DIVS: f['divs'] = LAST_DIVS[-12:]
        dump(p, f); n += 1; time.sleep(0.4)
    print('us backfill', n, 'of', len(todo), 'fail-streak', fail)

if __name__ == '__main__':
    w = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if w in ('tw', 'all'): run_tw()
    if w in ('us', 'all'): run_us()
    if w in ('backfill', 'backfill-tw'): tw_backfill(int(os.environ.get('TW_BF_SECONDS', '900')))
    if w in ('backfill', 'backfill-us'): us_backfill(int(os.environ.get('US_BF_SECONDS', '900')))
