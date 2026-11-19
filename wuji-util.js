(function () {
  'use strict';
  if (window.wujiTrack) return;

  var NAME_RE = /^event\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var STORE_HOSTS = {
    'payhip.com': 'payhip',
    'www.payhip.com': 'payhip',
    'portaly.cc': 'portaly',
    'www.portaly.cc': 'portaly'
  };
  var POLL_MS = 80;
  var FALLBACK_MS = 350;
  var DEADLINE_MS = 3000;
  var DEDUPE_MS = 1200;
  var queue = [];
  var pollTimer = null;
  var fallbackTimer = null;
  var actionSeq = 0;
  var seenAt = Object.create(null);
  var handledEvents = typeof WeakSet === 'function' ? new WeakSet() : null;

  function slug(value) {
    return String(value == null ? '' : value)
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalize(name) {
    var value = slug(name).replace(/^event-/, '');
    return 'event/' + value;
  }

  function valid(name) {
    return NAME_RE.test(name);
  }

  function countReady() {
    try {
      return !!(window.goatcounter && typeof window.goatcounter.count === 'function');
    } catch (e) {
      return false;
    }
  }

  function endpoint() {
    var tag = document.querySelector('script[data-goatcounter]');
    var value = tag && tag.getAttribute('data-goatcounter');
    if (!value) return null;
    try {
      return new URL(value, location.href).toString().replace(/\/+$/, '');
    } catch (e) {
      return null;
    }
  }

  function beaconUrl(entry) {
    var base = endpoint();
    if (!base) return null;
    var url = base + '?p=' + encodeURIComponent(entry.name) + '&e=1';
    if (entry.title) url += '&t=' + encodeURIComponent(entry.title);
    return url;
  }

  function beacon(entry) {
    var url = beaconUrl(entry);
    if (!url) return false;
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, '')) return true;
    } catch (e) {}
    try {
      fetch(url, { keepalive: true, mode: 'no-cors' }).catch(function () {});
      return true;
    } catch (e) {}
    return false;
  }

  function stopTimers() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function ensureTimers() {
    if (pollTimer === null) {
      pollTimer = setInterval(function () {
        try {
          if (!queue.length) {
            stopTimers();
            return;
          }
          if (countReady()) {
            for (var i = queue.length - 1; i >= 0; i--) {
              var entry = queue[i];
              try {
                window.goatcounter.count({
                  path: entry.name,
                  event: true,
                  title: entry.title
                });
                entry.state = 'sent';
                queue.splice(i, 1);
              } catch (e) {}
            }
          }
          var now = Date.now();
          for (var j = queue.length - 1; j >= 0; j--) {
            if (now - queue[j].createdAt >= DEADLINE_MS) {
              queue[j].state = 'dropped';
              queue.splice(j, 1);
            }
          }
          if (!queue.length) stopTimers();
        } catch (e) {}
      }, POLL_MS);
    }
    if (fallbackTimer === null) {
      fallbackTimer = setTimeout(function () {
        fallbackTimer = null;
        try {
          flushAll(false);
        } catch (e) {}
      }, FALLBACK_MS);
    }
  }

  function flushAll(force) {
    if (!queue.length) {
      stopTimers();
      return;
    }
    var pending = queue.slice();
    queue = [];
    for (var i = 0; i < pending.length; i++) {
      var entry = pending[i];
      if (!force && countReady()) {
        try {
          window.goatcounter.count({ path: entry.name, event: true, title: entry.title });
          entry.state = 'sent';
          continue;
        } catch (e) {}
      }
      if (beacon(entry)) entry.state = 'sent';
      else entry.state = 'dropped';
    }
    stopTimers();
  }

  function duplicate(key) {
    var now = Date.now();
    if (seenAt[key] && now - seenAt[key] < DEDUPE_MS) return true;
    seenAt[key] = now;
    return false;
  }

  function enqueue(entry) {
    queue.push(entry);
    ensureTimers();
  }

  window.wujiTrack = function (nameOrOptions, options) {
    try {
      var input = options || {};
      var name = typeof nameOrOptions === 'string' ? nameOrOptions : (nameOrOptions && nameOrOptions.name);
      if (nameOrOptions && typeof nameOrOptions === 'object') {
        if (!input.title) input.title = nameOrOptions.title;
        if (!input.element) input.element = nameOrOptions.element;
        if (!input.dedupeKey) input.dedupeKey = nameOrOptions.dedupeKey;
      }
      var path = normalize(name);
      if (!valid(path)) return;
      var key = input.dedupeKey || 'action-' + (++actionSeq);
      if (duplicate(String(key))) return;
      var title = typeof input.title === 'string' && input.title ? input.title : undefined;
      var entry = {
        name: path,
        title: title,
        dedupeKey: String(key),
        state: 'pending',
        createdAt: Date.now(),
        attempts: 0
      };
      if (countReady()) {
        try {
          window.goatcounter.count({ path: path, event: true, title: title });
          entry.state = 'sent';
          return;
        } catch (e) {}
      }
      enqueue(entry);
    } catch (e) {}
  };

  function anchorFrom(target) {
    try {
      if (!target) return null;
      if (target.nodeType !== 1 && target.parentElement) target = target.parentElement;
      return target.nodeType === 1 ? target.closest('a[href]') : null;
    } catch (e) {
      return null;
    }
  }

  function pageSlug() {
    var parts = location.pathname.split('/').filter(Boolean).map(function (part) {
      return part.replace(/\.[a-z0-9]+$/i, '');
    });
    if (parts.length && parts[parts.length - 1] === 'index') parts.pop();
    return slug(parts[0] || 'home') || 'home';
  }

  function sectionOf(anchor) {
    var el = anchor.closest('section[id], [data-gc-section]');
    if (!el) return 'body';
    var raw = el.hasAttribute('data-gc-section') ? el.getAttribute('data-gc-section') : el.id;
    return slug(raw) || 'body';
  }

  function purposeOf(anchor) {
    var raw = anchor.getAttribute('data-gc-event');
    if (!raw) raw = anchor.textContent || '';
    return slug(raw) || 'link';
  }

  function autoName(anchor, platform) {
    return 'event/cta-' + platform + '-' + pageSlug() + '-' + sectionOf(anchor) + '-' + purposeOf(anchor);
  }

  window.addEventListener('click', function (event) {
    try {
      if (handledEvents && handledEvents.has(event)) return;
      var anchor = anchorFrom(event.target);
      if (!anchor) return;
      var url = new URL(anchor.href, location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      var platform = STORE_HOSTS[url.hostname.toLowerCase()];
      if (!platform) return;
      if (handledEvents) handledEvents.add(event);

      var legacy = anchor.getAttribute('data-goatcounter-click');
      var name = legacy ? normalize(legacy) : autoName(anchor, platform);
      if (!valid(name)) name = autoName(anchor, platform);
      var title = anchor.getAttribute('data-goatcounter-title') || undefined;
      window.wujiTrack(name, {
        title: title,
        element: anchor,
        dedupeKey: 'click-' + (++actionSeq)
      });
    } catch (e) {}
  }, true);

  // 商店外連由本助手統一送出；預先標記 data-goatcounter-bound，讓 count.js 跳過綁定，避免同一次點擊送兩筆。
  function claimStoreLinks(root) {
    try {
      var list = (root || document).querySelectorAll('a[href][data-goatcounter-click]');
      for (var i = 0; i < list.length; i++) {
        try {
          var host = new URL(list[i].href, location.href).hostname.toLowerCase();
          if (STORE_HOSTS[host]) list[i].setAttribute('data-goatcounter-bound', 'true');
        } catch (e) {}
      }
    } catch (e) {}
  }
  try {
    if (typeof MutationObserver === 'function') {
      var mo = new MutationObserver(function () { claimStoreLinks(document); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', function () { claimStoreLinks(document); setTimeout(function () { mo.disconnect(); }, 0); });
    } else {
      document.addEventListener('DOMContentLoaded', function () { claimStoreLinks(document); });
    }
  } catch (e) {}

  window.addEventListener('pagehide', function () {
    try {
      flushAll(true);
    } catch (e) {}
  });

  document.addEventListener('visibilitychange', function () {
    try {
      if (document.visibilityState === 'hidden') flushAll(true);
    } catch (e) {}
  });
})();
