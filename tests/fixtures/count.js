(function () {
  'use strict';
  var tag = document.querySelector('script[data-goatcounter]');
  var endpoint = tag ? tag.getAttribute('data-goatcounter') : '';

  function send(data) {
    try {
      if (!endpoint || !data || !data.path) return;
      var url = endpoint + '?p=' + encodeURIComponent(data.path) + '&e=1';
      if (data.title) url += '&t=' + encodeURIComponent(data.title);
      if (navigator.sendBeacon) navigator.sendBeacon(url, '');
      else fetch(url, { mode: 'no-cors' }).catch(function () {});
    } catch (e) {}
  }

  window.goatcounter = { count: send };

  document.addEventListener('click', function (event) {
    try {
      var target = event.target;
      if (target && target.nodeType !== 1 && target.parentElement) target = target.parentElement;
      var anchor = target && target.nodeType === 1 ? target.closest('a[data-goatcounter-click]') : null;
      if (!anchor) return;
      send({ path: anchor.getAttribute('data-goatcounter-click'), title: anchor.getAttribute('data-goatcounter-title') });
    } catch (e) {}
  });
})();
