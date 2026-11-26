/* 2027 生日查詢｜星等規則（確定性，同一生日永遠同一結果）
 *
 * 本頁不採用、不抄襲任何外部網站的名次或資料。
 * 2027 年為丁未年：天干丁火、地支未土（羊）。
 *
 * 規則 A｜有出生年：沿用炭武吉「十二生肖小金庫分數卡」公式
 *   （見 team-shared/digital-products/charms/2027-zodiac-xiaojinku.md）
 *   1. 民俗生肖：以該年農曆正月初一為界（查表 1924–2030）。
 *      生日早於當年初一，算前一年生肖。
 *   2. 三項（小金庫／貴人／心情）皆底分 3，再依
 *      年支「未」的合、沖、刑、破、害、三合、三會、值、偏沖，
 *      以及丁火對生肖本氣的十神加減。
 *   3. 每項限制在 2–5 星（不給 1 星，最低稱為「調整期」）。
 *   4. 本頁綜合星等 = 三項的中位數。不公布名次。
 *   5. 馬同時屬六合與三會，只取六合一次，避免灌分。
 *   6. 偏沖（辰、酉）各派不同，只扣心情，文案會註明。
 *
 * 規則 B｜未填出生年：改依生日月日的西洋星座五行，對照丁火、未土
 *   （台灣常見星座分界；2/29 視為雙魚座）。
 *   底分 3；火象或土象 +1；水象 −1；風象對應金，0。
 *   若生日落在巳午未當令（立夏到立秋前，5/6–8/7）再 +1。
 *   同樣限制在 2–5 星。填了年份後改走規則 A，結果可能不同。
 *
 * 行動建議：規則 A 用各生肖既有「小提醒」；規則 B 用各星座固定一句。
 * 不存個資，計算全在瀏覽器完成。
 */
(function (root) {
  'use strict';

  var CNY = {
    "1924": "1924-02-05",
    "1925": "1925-01-24",
    "1926": "1926-02-13",
    "1927": "1927-02-02",
    "1928": "1928-01-23",
    "1929": "1929-02-10",
    "1930": "1930-01-30",
    "1931": "1931-02-17",
    "1932": "1932-02-06",
    "1933": "1933-01-26",
    "1934": "1934-02-14",
    "1935": "1935-02-04",
    "1936": "1936-01-24",
    "1937": "1937-02-11",
    "1938": "1938-01-31",
    "1939": "1939-02-19",
    "1940": "1940-02-08",
    "1941": "1941-01-27",
    "1942": "1942-02-15",
    "1943": "1943-02-05",
    "1944": "1944-01-25",
    "1945": "1945-02-13",
    "1946": "1946-02-02",
    "1947": "1947-01-22",
    "1948": "1948-02-10",
    "1949": "1949-01-29",
    "1950": "1950-02-17",
    "1951": "1951-02-06",
    "1952": "1952-01-27",
    "1953": "1953-02-14",
    "1954": "1954-02-03",
    "1955": "1955-01-24",
    "1956": "1956-02-12",
    "1957": "1957-01-31",
    "1958": "1958-02-18",
    "1959": "1959-02-08",
    "1960": "1960-01-28",
    "1961": "1961-02-15",
    "1962": "1962-02-05",
    "1963": "1963-01-25",
    "1964": "1964-02-13",
    "1965": "1965-02-02",
    "1966": "1966-01-21",
    "1967": "1967-02-09",
    "1968": "1968-01-30",
    "1969": "1969-02-17",
    "1970": "1970-02-06",
    "1971": "1971-01-27",
    "1972": "1972-02-15",
    "1973": "1973-02-03",
    "1974": "1974-01-23",
    "1975": "1975-02-11",
    "1976": "1976-01-31",
    "1977": "1977-02-18",
    "1978": "1978-02-07",
    "1979": "1979-01-28",
    "1980": "1980-02-16",
    "1981": "1981-02-05",
    "1982": "1982-01-25",
    "1983": "1983-02-13",
    "1984": "1984-02-02",
    "1985": "1985-02-20",
    "1986": "1986-02-09",
    "1987": "1987-01-29",
    "1988": "1988-02-17",
    "1989": "1989-02-06",
    "1990": "1990-01-27",
    "1991": "1991-02-15",
    "1992": "1992-02-04",
    "1993": "1993-01-23",
    "1994": "1994-02-10",
    "1995": "1995-01-31",
    "1996": "1996-02-19",
    "1997": "1997-02-07",
    "1998": "1998-01-28",
    "1999": "1999-02-16",
    "2000": "2000-02-05",
    "2001": "2001-01-24",
    "2002": "2002-02-12",
    "2003": "2003-02-01",
    "2004": "2004-01-22",
    "2005": "2005-02-09",
    "2006": "2006-01-29",
    "2007": "2007-02-18",
    "2008": "2008-02-07",
    "2009": "2009-01-26",
    "2010": "2010-02-14",
    "2011": "2011-02-03",
    "2012": "2012-01-23",
    "2013": "2013-02-10",
    "2014": "2014-01-31",
    "2015": "2015-02-19",
    "2016": "2016-02-08",
    "2017": "2017-01-28",
    "2018": "2018-02-16",
    "2019": "2019-02-05",
    "2020": "2020-01-25",
    "2021": "2021-02-12",
    "2022": "2022-02-01",
    "2023": "2023-01-22",
    "2024": "2024-02-10",
    "2025": "2025-01-29",
    "2026": "2026-02-17",
    "2027": "2027-02-06",
    "2028": "2028-01-26",
    "2029": "2029-02-13",
    "2030": "2030-02-03"
  };

  var ZODIAC = ['鼠','牛','虎','兔','龍','蛇','馬','羊','猴','雞','狗','豬'];
  var BRANCH = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  var STAR_LABEL = {2:'調整期',3:'平穩',4:'穩進',5:'順風'};

  // 三項分數：小金庫、貴人、心情（已套公式並限制在 2–5）
  var ZODIAC_SCORES = {
    鼠: [4, 2, 2],
    牛: [2, 3, 2],
    虎: [3, 3, 4],
    兔: [4, 4, 4],
    龍: [3, 4, 2],
    蛇: [2, 5, 4],
    馬: [3, 5, 4],
    羊: [3, 4, 2],
    猴: [3, 4, 3],
    雞: [3, 4, 2],
    狗: [2, 3, 3],
    豬: [5, 4, 3]
  };

  var ZODIAC_TIPS = {
    鼠: '重要的事當面講清楚，幫忙前先看自己有沒有餘力。',
    牛: '先存一筆緩衝金，合約多看一次；換跑道前先排好時程和預算。',
    虎: '把一項拿手技能做成作品或服務，邊做邊累積。',
    兔: '跟合拍的夥伴一起推一件事，進帳先存一部分。',
    龍: '重要決定放一晚再回，多向信任的前輩請教。',
    蛇: '聚會先訂預算，合資、借錢先寫清楚。',
    馬: '適合主動牽線、合作提案；同伴多的時候，帳目分清楚最安心。',
    羊: '年初寫下「今年只做好 3 件事」，其他的慢慢來。',
    猴: '把本業流程做穩，爭取一張證照或一個新職責。',
    雞: '事情排優先順序、一件一件做，累了就休息。',
    狗: '重要約定用文字確認，證件、繳費日先設好提醒。',
    豬: '設一個每月自動轉存，收入多的月份多存一點。'
  };

  var ZODIAC_NOTE = {
    鼠: '子未相害；丁火是財星。',
    牛: '丑未相沖，並屬丑戌未三刑；丁火生土，有長輩助力。',
    虎: '與太歲無合沖；丁火是食傷，象徵表達與作品。',
    兔: '亥卯未三合；丁火是食傷。',
    龍: '丁火生土，有長輩、老師助力；部分老師另把屬龍列為「偏沖」，各派不同。',
    蛇: '巳午未三會；丁火是比劫，朋友多、花費也多。',
    馬: '午未六合；丁火是比劫。',
    羊: '本命年（值太歲）；丁火生土，有長輩助力。',
    猴: '與太歲無合沖；丁火是官殺，代表規矩與上司。',
    雞: '丁火是官殺，有上司助力；部分老師另把屬雞列為「偏沖」，各派不同。',
    狗: '戌未相刑又相破；丁火生土，有長輩助力。',
    豬: '亥卯未三合；丁火是財星。'
  };

  // 台灣常見分界（含 2/29 → 雙魚）
  var SIGNS = [
    {name:'摩羯座', elem:'土', start:[12,22], end:[1,19]},
    {name:'水瓶座', elem:'金', start:[1,20], end:[2,18]},
    {name:'雙魚座', elem:'水', start:[2,19], end:[3,20]},
    {name:'白羊座', elem:'火', start:[3,21], end:[4,19]},
    {name:'金牛座', elem:'土', start:[4,20], end:[5,20]},
    {name:'雙子座', elem:'金', start:[5,21], end:[6,20]},
    {name:'巨蟹座', elem:'水', start:[6,21], end:[7,22]},
    {name:'獅子座', elem:'火', start:[7,23], end:[8,22]},
    {name:'處女座', elem:'土', start:[8,23], end:[9,22]},
    {name:'天秤座', elem:'金', start:[9,23], end:[10,22]},
    {name:'天蠍座', elem:'水', start:[10,23], end:[11,21]},
    {name:'射手座', elem:'火', start:[11,22], end:[12,21]}
  ];

  var SIGN_TIPS = {
    白羊座: '先選定一件想推進的事，本週就踏出最小的一步。',
    金牛座: '把固定支出看一遍，能自動處理的就先設好。',
    雙子座: '重要的話先寫下來再傳，轉傳前先查來源。',
    巨蟹座: '先整理身邊環境，再做需要費神的決定。',
    獅子座: '把會的東西拿出來小試一次，邊做邊改。',
    處女座: '挑一個流程做穩，少做同時開工的事。',
    天秤座: '跟合拍的人對齊一件事，分工寫清楚。',
    天蠍座: '少聽「保證」兩字，重要約定留文字。',
    射手座: '訂一個今年只走完的小目標，其他先放著。',
    摩羯座: '設一個小小的定期存或定期做的習慣，慢慢累積。',
    水瓶座: '把一個新想法寫成三個步驟，只做第一步。',
    雙魚座: '給自己一段不受打擾的時間，先把心思收回來。'
  };

  function isLeap(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  function daysInMonth(month, year) {
    var dim = [0,31,28,31,30,31,30,31,31,30,31,30,31];
    if (month === 2) {
      if (year == null) return 29;
      return isLeap(year) ? 29 : 28;
    }
    return dim[month] || 0;
  }

  function parseDate(year, month, day) {
    var errors = [];
    var m = month == null || month === '' ? NaN : Number(month);
    var d = day == null || day === '' ? NaN : Number(day);
    var y = year == null || year === '' ? null : Number(year);

    if (!Number.isInteger(m) || m < 1 || m > 12) errors.push('請選擇出生月。');
    if (!Number.isInteger(d) || d < 1 || d > 31) errors.push('請選擇出生日。');
    if (year != null && year !== '') {
      if (!Number.isInteger(y) || y < 1924 || y > 2026) {
        errors.push('出生年請填 1924 到 2026，或先不填、改用星座估算。');
        y = null;
      }
    } else {
      y = null;
    }
    if (errors.length) return {ok:false, errors:errors};

    var max = daysInMonth(m, y);
    if (d > max) {
      if (m === 2 && d === 29 && y != null && !isLeap(y)) {
        return {ok:false, errors:['西元 ' + y + ' 年沒有 2 月 29 日，請改填 2/28 或 3/1，或先不填年份。']};
      }
      return {ok:false, errors:['這個月沒有 ' + m + ' 月 ' + d + ' 日，請再選一次。']};
    }
    return {ok:true, year:y, month:m, day:d};
  }

  function clampStar(n) {
    return Math.max(2, Math.min(5, n));
  }

  function median(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return a[1];
  }

  function md(a, b) { return a * 32 + b; }

  function signOf(month, day) {
    var key = md(month, day);
    for (var i = 0; i < SIGNS.length; i++) {
      var s = SIGNS[i];
      var a = md(s.start[0], s.start[1]);
      var b = md(s.end[0], s.end[1]);
      if (a <= b) {
        if (key >= a && key <= b) return s;
      } else {
        // 摩羯座跨年
        if (key >= a || key <= b) return s;
      }
    }
    return SIGNS[0];
  }

  // 巳午未當令：立夏（約 5/6）至立秋前（約 8/7）
  function inSiWuWei(month, day) {
    var key = md(month, day);
    return key >= md(5, 6) && key <= md(8, 7);
  }

  function signStars(month, day) {
    var sign = signOf(month, day);
    var score = 3;
    if (sign.elem === '火' || sign.elem === '土') score += 1;
    else if (sign.elem === '水') score -= 1;
    if (inSiWuWei(month, day)) score += 1;
    return clampStar(score);
  }

  function branchIndex(year) {
    return ((year - 4) % 12 + 12) % 12;
  }

  function folkYear(year, month, day) {
    var cny = CNY[String(year)];
    if (!cny) return {year: year, note: '正月初一查表範圍外，暫以西元年計算。'};
    var parts = cny.split('-').map(Number);
    var cy = parts[0], cm = parts[1], cd = parts[2];
    if (month < cm || (month === cm && day < cd)) {
      return {year: year - 1, note: '民俗：農曆正月初一（' + cny.replace(/-/g, '/') + '）前仍算前一年生肖。'};
    }
    return {year: year, note: null};
  }

  function zodiacOfYear(year) {
    var i = branchIndex(year);
    return {index: i, name: ZODIAC[i], branch: BRANCH[i]};
  }

  function rate(year, month, day) {
    var parsed = parseDate(year, month, day);
    if (!parsed.ok) return parsed;

    var sign = signOf(parsed.month, parsed.day);
    var signStar = signStars(parsed.month, parsed.day);

    if (parsed.year == null) {
      return {
        ok: true,
        mode: 'sign',
        year: null,
        month: parsed.month,
        day: parsed.day,
        sign: sign.name,
        element: sign.elem,
        stars: signStar,
        label: STAR_LABEL[signStar],
        tip: SIGN_TIPS[sign.name],
        method: '依 ' + sign.name + '（' + sign.elem + '象）對 2027 丁火、未土的關係估算。填出生年可改依生肖計算，結果可能不同。',
        note: null,
        zodiac: null
      };
    }

    var fy = folkYear(parsed.year, parsed.month, parsed.day);
    var z = zodiacOfYear(fy.year);
    var scores = ZODIAC_SCORES[z.name];
    var stars = median(scores);
    return {
      ok: true,
      mode: 'zodiac',
      year: parsed.year,
      month: parsed.month,
      day: parsed.day,
      folkYear: fy.year,
      folkNote: fy.note,
      sign: sign.name,
      element: sign.elem,
      zodiac: z.name,
      branch: z.branch,
      scores: {vault: scores[0], people: scores[1], mood: scores[2]},
      stars: stars,
      label: STAR_LABEL[stars],
      tip: ZODIAC_TIPS[z.name],
      method: '依民俗生肖「屬' + z.name + '」（' + z.branch + '）對 2027 丁未年的合沖刑害與十神，取小金庫、貴人、心情三項的中位數。',
      note: ZODIAC_NOTE[z.name] + (fy.note ? ' ' + fy.note : '')
    };
  }

  var api = {
    CNY: CNY,
    ZODIAC: ZODIAC,
    STAR_LABEL: STAR_LABEL,
    isLeap: isLeap,
    daysInMonth: daysInMonth,
    parseDate: parseDate,
    signOf: signOf,
    signStars: signStars,
    folkYear: folkYear,
    zodiacOfYear: zodiacOfYear,
    rate: rate
  };

  root.Birthday2027 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
