#!/usr/bin/env python3
"""Backup quotes via OpenBB (free providers, no key) for tickers the primary fetch left missing/stale.
Runs after fetch_market.py; same per-ticker files and snapshot format, so the front end is unchanged.
  TW: OpenBB provider 'yfinance' (Yahoo Finance) -> independent of the primary TWSE/TPEx open data.
  US: OpenBB provider 'cboe' first (independent of the primary Yahoo/Nasdaq; ~1 day delayed),
      then 'yfinance' for what is still missing (same Yahoo data as the primary, different client).
A ticker is stale if its last bar is older than the expected latest session (newest date among
tickers, or the latest weekday that should have closed if that is newer). Any error -> exit 0, data untouched.
Usage: fallback_openbb.py [tw|us|all]"""
import os, sys, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
import fetch_market as fm
if os.environ.get('WUJI_DATA'): fm.ROOT = os.environ['WUJI_DATA']   # for local tests

def expected(mkt):
    now = dt.datetime.now(fm.TZ8)
    if mkt == 'tw': d = now.date() if now.hour >= 14 else now.date() - dt.timedelta(days=1)
    else: d = (now - dt.timedelta(hours=6)).date() - dt.timedelta(days=1)   # US close ~05:00 Taipei
    while d.weekday() >= 5: d -= dt.timedelta(days=1)
    return d.isoformat()

def last_dates(mkt, syms):
    out = {}
    for s in syms:
        f = fm.load(os.path.join(fm.ROOT, mkt, s + '.json'), None)
        out[s] = f['bars'][-1][0] if f and f.get('bars') else ''
    return out

def fetch(prov, ysyms, cap):
    from openbb import obb
    start = (dt.date.today() - dt.timedelta(days=21)).isoformat()
    df = obb.equity.price.historical(','.join(ysyms), start_date=start, provider=prov).to_df()
    if 'symbol' not in df.columns: df['symbol'] = ysyms[0]
    res = {}
    for d, r in df.iterrows():
        d = str(d)[:10]
        if d > cap: continue                      # never take an unfinished session
        try:
            b = [d, round(float(r['open']), 4), round(float(r['high']), 4), round(float(r['low']), 4),
                 round(float(r['close']), 4), int(float(r['volume'] or 0))]
        except Exception: continue
        res.setdefault(str(r['symbol']), []).append(b)
    return res

def run(mkt, syms, plan, label):
    ld = last_dates(mkt, syms)
    exp = expected(mkt); target = max([exp] + [v for v in ld.values() if v])
    stale = [s for s in syms if ld[s] < target]
    print(mkt, 'fallback target', target, 'stale', len(stale), stale[:12])
    if not stale: return
    used = set()
    for prov, tomap, frommap in plan:
        if not stale: break
        try: got = fetch(prov, [tomap(s) for s in stale], exp)
        except Exception as e: print('WARN openbb', prov, e, file=sys.stderr); continue
        for s in list(stale):
            bars = got.get(tomap(s)) or got.get(frommap(tomap(s)))
            if not bars or max(b[0] for b in bars) <= ld[s]: continue
            p = os.path.join(fm.ROOT, mkt, s + '.json')
            f = fm.load(p, {'s': s, 'n': fm.ETF_NAMES.get(s, s), 'm': 'ETF' if s in fm.ETF_NAMES else '', 'bars': []})
            f['bars'] = fm.merge(f['bars'], bars); fm.dump(p, f); used.add(prov)
            if f['bars'][-1][0] >= target: stale.remove(s)
    print(mkt, 'fallback providers used', sorted(used), 'still stale', len(stale))
    if used:
        old = fm.load(os.path.join(fm.ROOT, mkt + '.json'), {}).get('src', '')
        old = [x for x in old.split('；') if x and not x.startswith(label)]
        fm.snapshot(mkt, syms, '；'.join(old + [label + '（' + '/'.join(sorted(used)) + '）']))

def tw_sym(s):
    f = fm.load(os.path.join(fm.ROOT, 'tw', s + '.json'), {})
    return s + ('.TWO' if f.get('m') == '上櫃' else '.TW')

if __name__ == '__main__':
    w = sys.argv[1] if len(sys.argv) > 1 else 'all'
    try:
        if w in ('tw', 'all'):
            run('tw', fm.TW, [('yfinance', tw_sym, lambda x: x)], 'OpenBB 備援')
        if w in ('us', 'all'):
            run('us', fm.US, [('cboe', lambda s: s.replace('-', '.'), lambda x: x),
                              ('yfinance', lambda s: s, lambda x: x)], 'OpenBB 備援')
    except Exception as e:
        print('WARN openbb fallback skipped:', e, file=sys.stderr)
    sys.exit(0)
