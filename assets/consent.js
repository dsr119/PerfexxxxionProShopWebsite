/* Cookie consent.
 *
 * Nothing optional runs until the visitor says yes. Two things are optional:
 *
 *   analytics  Google Analytics, on pages whose <script> tag for this file
 *              carries data-ga="G-...". Loaded with Google signals and ad
 *              personalisation turned off.
 *   reviews    The Elfsight Google Reviews widget. Its placeholder carries
 *              data-consent="reviews" and data-src="<script url>"; the script
 *              is only added once the visitor allows it. The plain "View our
 *              Google Reviews" link shows either way.
 *
 * The choice is kept in localStorage (not a cookie) under STORAGE_KEY. That
 * entry is the only thing the site itself stores in the browser. Any element
 * with class "cookie-settings" reopens the banner so the choice can be
 * changed; turning analytics off deletes Google's _ga cookies. Browsers that
 * send Global Privacy Control are treated as "necessary only". */
(function () {
  var STORAGE_KEY = 'pps-consent-v1';
  var script = document.currentScript;
  var GA_ID = script && script.getAttribute('data-ga');
  var root = (script && script.getAttribute('src') || '').replace(/assets\/consent\.js.*$/, '');

  function read() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }

  function save(choice) {
    choice.date = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(choice)); } catch (e) {}
  }

  function loadAnalytics() {
    if (!GA_ID || window.__ppsGaLoaded) return;
    window.__ppsGaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
  }

  function clearAnalyticsCookies() {
    var host = location.hostname;
    var domains = ['', host, '.' + host, '.' + host.split('.').slice(-2).join('.')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!/^_ga/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  function loadReviews() {
    var slots = document.querySelectorAll('[data-consent="reviews"][data-src]');
    Array.prototype.forEach.call(slots, function (el) {
      if (el.getAttribute('data-loaded')) return;
      el.setAttribute('data-loaded', '1');
      var s = document.createElement('script');
      s.async = true;
      s.src = el.getAttribute('data-src');
      el.appendChild(s);
    });
  }

  function apply(choice) {
    if (choice.analytics) loadAnalytics();
    if (choice.reviews) loadReviews();
  }

  var banner;

  function closeBanner() {
    if (banner) { banner.remove(); banner = null; }
  }

  function decide(choice) {
    var before = read();
    save(choice);
    closeBanner();
    // Already-loaded third-party code can't be unloaded, so a withdrawal
    // clears the cookies and reloads the page without it.
    if (before && ((before.analytics && !choice.analytics) || (before.reviews && !choice.reviews))) {
      if (!choice.analytics) clearAnalyticsCookies();
      location.reload();
      return;
    }
    apply(choice);
  }

  function showBanner() {
    closeBanner();
    var current = read() || { analytics: false, reviews: false };
    banner = document.createElement('section');
    banner.className = 'consent-banner';
    banner.setAttribute('aria-label', 'Cookie choices');
    banner.innerHTML =
      '<div class="consent-inner">' +
        '<p class="consent-text"><strong>Your privacy.</strong> This site works without any tracking. ' +
        'With your OK we also load Google Analytics (visit statistics) and a Google Reviews widget, ' +
        'which set cookies or contact their own servers. ' +
        '<a href="' + root + 'cookie-policy/">Cookie Policy</a></p>' +
        '<fieldset class="consent-options" hidden>' +
          '<legend>Choose what to allow</legend>' +
          '<label><input type="checkbox" checked disabled> Necessary (remembers this choice)</label>' +
          '<label><input type="checkbox" name="analytics"' + (current.analytics ? ' checked' : '') + '> Analytics (Google Analytics)</label>' +
          '<label><input type="checkbox" name="reviews"' + (current.reviews ? ' checked' : '') + '> Google Reviews widget (Elfsight)</label>' +
        '</fieldset>' +
        '<div class="consent-buttons">' +
          '<button type="button" data-act="reject">Necessary only</button>' +
          '<button type="button" data-act="choose">Choose</button>' +
          '<button type="button" data-act="save" hidden>Save choices</button>' +
          '<button type="button" data-act="accept" class="consent-primary">Accept all</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(banner);

    banner.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      if (act === 'accept') decide({ analytics: true, reviews: true });
      if (act === 'reject') decide({ analytics: false, reviews: false });
      if (act === 'choose') {
        banner.querySelector('.consent-options').hidden = false;
        banner.querySelector('[data-act="save"]').hidden = false;
        e.target.hidden = true;
        banner.querySelector('input[name="analytics"]').focus();
      }
      if (act === 'save') {
        decide({
          analytics: banner.querySelector('input[name="analytics"]').checked,
          reviews: banner.querySelector('input[name="reviews"]').checked
        });
      }
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.cookie-settings');
    if (!t) return;
    e.preventDefault();
    showBanner();
    var first = banner.querySelector('[data-act="choose"]');
    if (first) first.click();
  });

  // A browser sending Global Privacy Control has already said no, so it gets
  // "necessary only" without being asked. The footer link still opens the
  // banner if the visitor wants to turn something on.
  var saved = read();
  if (saved) apply(saved);
  else if (navigator.globalPrivacyControl === true) return;
  else if (document.body) showBanner();
  else document.addEventListener('DOMContentLoaded', showBanner);
})();
