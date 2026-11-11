'use strict';
/* 舞吉虛擬幣成交模型：現貨手續費、訂單簿／AMM 滑價、下單頻率。瀏覽器與 Node 共用。 */
(function (root) {
  const FEE = 0.001;           // 幣安現貨約 0.1%（未折抵）
  const SLIP_WARN = 0.05;      // 預估滑價超過 5% 時提示
  const SLIP_CAP = 0.25;       // 單筆市價單最多吃到約 25% 滑價，超出則縮小或拒絕
  const MAX_ORDERS_PER_MIN = 5;
  const MIN_ORDER_GAP_MS = 2000;
  const AMM_DEPTH_FRAC = 0.99; // 不得抽乾池子

  function num(v) { v = +v; return isFinite(v) ? v : 0; }

  function walkBuy(asks, quote) {
    let need = quote, spent = 0, qty = 0;
    const levels = (asks || []).map(x => [num(x[0]), num(x[1])]).filter(x => x[0] > 0 && x[1] > 0)
      .sort((a, b) => a[0] - b[0]);
    for (const [px, q] of levels) {
      if (need <= 1e-12) break;
      const room = px * q;
      const take = Math.min(room, need);
      qty += take / px;
      spent += take;
      need -= take;
    }
    return { spent, qty, leftover: Math.max(0, need) };
  }

  function walkSell(bids, baseQty) {
    let left = baseQty, proceeds = 0, sold = 0;
    const levels = (bids || []).map(x => [num(x[0]), num(x[1])]).filter(x => x[0] > 0 && x[1] > 0)
      .sort((a, b) => b[0] - a[0]);
    for (const [px, q] of levels) {
      if (left <= 1e-12) break;
      const take = Math.min(q, left);
      proceeds += take * px;
      sold += take;
      left -= take;
    }
    return { proceeds, qty: sold, leftover: Math.max(0, left) };
  }

  /* 常數乘積：買入花費 c 報價資產，得到 y*c/(x+c)；賣出 q 基礎資產，得到 x*q/(y+q) */
  function ammBuy(x, y, quote) {
    const cap = x * AMM_DEPTH_FRAC;
    const c = Math.min(quote, cap);
    if (!(c > 0) || !(x > 0) || !(y > 0)) return { spent: 0, qty: 0, leftover: quote, capped: quote > 0 };
    const qty = y * c / (x + c);
    return { spent: c, qty, leftover: Math.max(0, quote - c), capped: quote > cap + 1e-12 };
  }

  function ammSell(x, y, baseQty) {
    const cap = y * AMM_DEPTH_FRAC;
    const q = Math.min(baseQty, cap);
    if (!(q > 0) || !(x > 0) || !(y > 0)) return { proceeds: 0, qty: 0, leftover: baseQty, capped: baseQty > 0 };
    const proceeds = x * q / (y + q);
    return { proceeds, qty: q, leftover: Math.max(0, baseQty - q), capped: baseQty > cap + 1e-12 };
  }

  /* 無盤口時：約 1 bp 價差＋與 24h 成交額成反比的衝擊 */
  function impactFill(side, mid, quoteOrQty, vol24) {
    const notional = side === 'B' ? quoteOrQty : quoteOrQty * mid;
    const adv = Math.max(num(vol24), notional * 10, 1);
    const slip = 0.0001 + 0.10 * (notional / adv);
    if (side === 'B') {
      const px = mid * (1 + slip);
      return { spent: quoteOrQty, qty: quoteOrQty / px, leftover: 0, capped: false, slip };
    }
    const px = mid * (1 - slip);
    return { proceeds: quoteOrQty * px, qty: quoteOrQty, leftover: 0, capped: false, slip };
  }

  /**
   * @param {object} o
   * @param {'B'|'S'} o.side
   * @param {number} o.mid
   * @param {number} o.input  買：美元金額（含手續費預算）；賣：數量
   * @param {{asks:number[][], bids:number[][]}|null} o.book
   * @param {{x:number,y:number}|null} o.pool  AMM 報價準備 x、基礎準備 y
   * @param {number} [o.vol24]
   * @param {boolean} [o.lowLiq]  低流動性／DEX，優先用 AMM
   */
  function quoteOrder(o) {
    let mid = num(o.mid); const input = num(o.input), feeRate = o.fee == null ? FEE : num(o.fee);
    const empty = {
      ok: false, reason: 'invalid', side: o.side, mid, input: 0, fee: 0, feeRate,
      qty: 0, gross: 0, net: 0, avg: 0, slip: 0, slipCost: 0, warn: false, capped: false,
      capReason: '', spend: 0
    };
    if (!(input > 0)) {
      empty.reason = '請輸入' + (o.side === 'B' ? '金額' : '數量');
      return empty;
    }
    /* 有買賣盤時以買賣價中點當基準，避免與最後成交價短暫不一致 */
    if (o.book) {
      const bids = (o.book.bids || []).map(x => +x[0]).filter(v => v > 0);
      const asks = (o.book.asks || []).map(x => +x[0]).filter(v => v > 0);
      const bb = bids.length ? Math.max(...bids) : 0;
      const ba = asks.length ? Math.min(...asks) : 0;
      if (bb > 0 && ba > 0) mid = (bb + ba) / 2;
    }
    /* CLMM 池子的 base/quote 準備常與 priceUsd 不一致；用現價重建虛擬常數乘積池，只保留報價端深度 */
    let pool = o.pool ? { x: num(o.pool.x), y: num(o.pool.y) } : null;
    if (pool && pool.x > 0 && mid > 0) {
      const poolMid = pool.y > 0 ? pool.x / pool.y : 0;
      if (!pool.y || Math.abs(poolMid / mid - 1) > 0.02) pool = { x: pool.x, y: pool.x / mid };
    }
    if (!(mid > 0)) {
      empty.reason = '目前沒有可用報價';
      return empty;
    }

    let raw, usedModel = 'impact';
    if (o.side === 'B') {
      const budget = input;                // 現金支出上限（含手續費）
      const forBook = budget * (1 - feeRate); // 先扣手續費再去成交
      if (o.lowLiq && pool && pool.x > 0 && pool.y > 0) {
        usedModel = 'amm';
        raw = ammBuy(pool.x, pool.y, forBook);
      } else if (o.book && o.book.asks && o.book.asks.length) {
        usedModel = 'book';
        raw = walkBuy(o.book.asks, forBook);
        raw.capped = raw.leftover > 1e-8;
      } else {
        usedModel = 'impact';
        raw = impactFill('B', mid, forBook, o.vol24);
      }
      if (!(raw.qty > 0) || !(raw.spent > 0)) {
        empty.reason = '目前可成交深度不足，無法以市價成交';
        empty.capped = true;
        return empty;
      }
      let avg = raw.spent / raw.qty;
      let slip = avg / mid - 1;
      /* 滑價超過上限則縮小至可接受深度 */
      if (slip > SLIP_CAP && usedModel === 'amm' && pool) {
        const maxSpend = pool.x * SLIP_CAP; // slip ≈ c/x
        raw = ammBuy(pool.x, pool.y, Math.min(forBook, maxSpend));
        raw.capped = true;
        if (!(raw.qty > 0)) {
          empty.reason = '預估滑價過高，請縮小委託金額';
          return empty;
        }
        avg = raw.spent / raw.qty;
        slip = avg / mid - 1;
      } else if (slip > SLIP_CAP && usedModel === 'book') {
        /* 由淺到深累加，停在滑價 25% */
        let spent = 0, qty = 0;
        const levels = o.book.asks.map(x => [num(x[0]), num(x[1])]).filter(x => x[0] > 0 && x[1] > 0).sort((a, b) => a[0] - b[0]);
        for (const [px, q] of levels) {
          if (px / mid - 1 > SLIP_CAP) break;
          const room = px * q;
          const take = Math.min(room, forBook - spent);
          if (take <= 0) break;
          qty += take / px;
          spent += take;
        }
        if (!(qty > 0)) {
          empty.reason = '預估滑價過高，請縮小委託金額';
          return empty;
        }
        raw = { spent, qty, leftover: Math.max(0, forBook - spent), capped: true };
        avg = spent / qty;
        slip = avg / mid - 1;
      }
      const fee = raw.spent * feeRate / (1 - feeRate); // 對應 budget 裡留下的手續費
      const spend = raw.spent + fee;
      const slipCost = Math.max(0, (avg - mid) * raw.qty);
      const capped = !!raw.capped || spend < budget - 1e-6;
      return {
        ok: true, reason: '', side: 'B', mid, input: budget, model: usedModel,
        fee, feeRate, qty: raw.qty, gross: raw.spent, net: spend, avg, slip, slipCost,
        warn: slip >= SLIP_WARN, capped, capReason: capped ? '超過目前可成交深度，已按可成交數量計價' : '',
        spend
      };
    }

    /* 賣出：input 為數量 */
    const qtyIn = input;
    if (o.lowLiq && pool && pool.x > 0 && pool.y > 0) {
      usedModel = 'amm';
      raw = ammSell(pool.x, pool.y, qtyIn);
    } else if (o.book && o.book.bids && o.book.bids.length) {
      usedModel = 'book';
      raw = walkSell(o.book.bids, qtyIn);
      raw.capped = raw.leftover > 1e-12;
    } else {
      usedModel = 'impact';
      raw = impactFill('S', mid, qtyIn, o.vol24);
    }
    if (!(raw.qty > 0) || !(raw.proceeds > 0)) {
      empty.reason = '目前可成交深度不足，無法以市價成交';
      empty.capped = true;
      return empty;
    }
    let avg = raw.proceeds / raw.qty;
    let slip = 1 - avg / mid;
    if (slip > SLIP_CAP && usedModel === 'amm' && pool) {
      /* slip = q/(y+q) → q = slip/(1-slip)*y. 25% 時約為 y/3 */
      const maxQty = pool.y * SLIP_CAP / (1 - SLIP_CAP);
      raw = ammSell(pool.x, pool.y, Math.min(qtyIn, maxQty));
      raw.capped = true;
      if (!(raw.qty > 0)) {
        empty.reason = '預估滑價過高，請縮小委託數量';
        return empty;
      }
      avg = raw.proceeds / raw.qty;
      slip = 1 - avg / mid;
    } else if (slip > SLIP_CAP && usedModel === 'book') {
      let proceeds = 0, qty = 0;
      const levels = o.book.bids.map(x => [num(x[0]), num(x[1])]).filter(x => x[0] > 0 && x[1] > 0).sort((a, b) => b[0] - a[0]);
      for (const [px, q] of levels) {
        if (1 - px / mid > SLIP_CAP) break;
        const take = Math.min(q, qtyIn - qty);
        if (take <= 0) break;
        proceeds += take * px;
        qty += take;
      }
      if (!(qty > 0)) {
        empty.reason = '預估滑價過高，請縮小委託數量';
        return empty;
      }
      raw = { proceeds, qty, leftover: Math.max(0, qtyIn - qty), capped: true };
      avg = proceeds / qty;
      slip = 1 - avg / mid;
    }
    const fee = raw.proceeds * feeRate;
    const net = raw.proceeds - fee;
    const slipCost = Math.max(0, (mid - avg) * raw.qty);
    const capped = !!raw.capped;
    return {
      ok: true, reason: '', side: 'S', mid, input: qtyIn, model: usedModel,
      fee, feeRate, qty: raw.qty, gross: raw.proceeds, net, avg, slip, slipCost,
      warn: slip >= SLIP_WARN, capped, capReason: capped ? '超過目前可成交深度，已按可成交數量計價' : '',
      spend: 0
    };
  }

  function rateLimit(tsList, now, maxPerMin, minGap) {
    now = now || Date.now();
    maxPerMin = maxPerMin == null ? MAX_ORDERS_PER_MIN : maxPerMin;
    minGap = minGap == null ? MIN_ORDER_GAP_MS : minGap;
    const recent = (tsList || []).filter(t => now - t < 60000);
    const last = recent.length ? recent[recent.length - 1] : 0;
    if (last && now - last < minGap) {
      const wait = Math.ceil((minGap - (now - last)) / 1000);
      return { ok: false, recent, wait, reason: '委託間隔過短，請稍後再送出（最少間隔 2 秒）' };
    }
    if (recent.length >= maxPerMin) {
      const wait = Math.ceil((60000 - (now - recent[0])) / 1000);
      return { ok: false, recent, wait, reason: '委託過於密集，請稍後再送出（每分鐘最多 ' + maxPerMin + ' 筆）' };
    }
    return { ok: true, recent, wait: 0, reason: '' };
  }

  function recordOrder(tsList, now) {
    now = now || Date.now();
    const recent = (tsList || []).filter(t => now - t < 60000);
    recent.push(now);
    return recent;
  }

  const api = {
    FEE, SLIP_WARN, SLIP_CAP, MAX_ORDERS_PER_MIN, MIN_ORDER_GAP_MS,
    quoteOrder, rateLimit, recordOrder, walkBuy, walkSell, ammBuy, ammSell, impactFill
  };
  root.WujiFill = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
