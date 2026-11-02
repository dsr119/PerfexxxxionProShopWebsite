// Shoes and Bags pages: what Ace Mitchell has in stock right now.
//
// A GitHub Action in ProShopAppV1C checks Ace Mitchell every morning and saves
// the answers to Supabase. This reads the public, in-stock-only view of that
// (no dealer cost in it) with the site's publishable key.
//
// Shoes are stocked per size: each size is its own code, the style number plus
// the size times ten ("58100118 095" is size 9.5). Sizes are grouped back
// under their style here.
(function () {
  var SUPABASE_URL = 'https://ngghyuvykqqklztvvmld.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_X-ZHYha1P8FPVL2rvAk-bA_CdXD8g-g';
  // Rows not refreshed for this long are left out: the item has probably
  // dropped off Ace Mitchell's site, so its stock is no longer being checked.
  var FRESH_DAYS = 3;
  var PAGE = 1000;

  var root = document.getElementById('stock');
  if (!root) return;
  var category = root.getAttribute('data-category'); // "Shoes" or "Bags"
  var grid = document.getElementById('stock-grid');
  var status = document.getElementById('stock-status');
  var search = document.getElementById('stock-search');
  var filter = document.getElementById('stock-filter');
  var items = [];

  function fetchAll() {
    var since = new Date(Date.now() - FRESH_DAYS * 864e5).toISOString();
    var path = 'vendor_stock_public?select=item_code,name,image_url,qty_total,checked_at' +
      '&category=eq.' + encodeURIComponent(category) +
      '&checked_at=gte.' + encodeURIComponent(since) + '&order=item_code.asc';
    var rows = [];
    function page(from) {
      return fetch(SUPABASE_URL + '/rest/v1/' + path, {
        headers: {
          apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
          Range: from + '-' + (from + PAGE - 1), 'Range-Unit': 'items'
        }
      }).then(function (res) {
        if (!res.ok) throw new Error('Stock request failed: ' + res.status);
        return res.json();
      }).then(function (batch) {
        rows = rows.concat(batch);
        return batch.length < PAGE ? rows : page(from + PAGE);
      });
    }
    return page(0);
  }

  function sizeOf(code) {
    var m = String(code).match(/ (\d{3})$/);
    return m ? parseInt(m[1], 10) / 10 : null;
  }

  function fmtSize(n) {
    return String(n).replace(/\.0$/, '');
  }

  // Shoe sizes -> one item per style with its sizes; bags stay one per row.
  function group(rows) {
    var byKey = {};
    var list = [];
    rows.forEach(function (r) {
      var size = sizeOf(r.item_code);
      var key = size === null ? r.item_code : r.item_code.replace(/ \d{3}$/, '');
      var item = byKey[key];
      if (!item) {
        item = byKey[key] = { key: key, name: r.name || r.item_code, image: r.image_url, qty: 0, sizes: [] };
        list.push(item);
      }
      item.qty += r.qty_total;
      if (size !== null) item.sizes.push(size);
      if (!item.image && r.image_url) item.image = r.image_url;
    });
    list.forEach(function (i) { i.sizes.sort(function (a, b) { return a - b; }); });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return list;
  }

  function kind(name) {
    if (/\byouth\b|\bkids?\b|\bjr\b/i.test(name)) return 'youth';
    if (/\bwomen'?s?\b|\bladies\b|\bwomens\b/i.test(name)) return 'womens';
    if (/\bmen'?s?\b|\bmens\b/i.test(name)) return 'mens';
    return 'other';
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function card(item) {
    var c = el('article', 'stock-card');
    var pic = el('div', 'stock-pic');
    if (item.image) {
      var img = el('img');
      img.src = item.image;
      img.alt = item.name;
      img.loading = 'lazy';
      img.onerror = function () { pic.classList.add('no-pic'); img.remove(); };
      pic.appendChild(img);
    } else {
      pic.classList.add('no-pic');
    }
    c.appendChild(pic);
    var body = el('div', 'stock-body');
    body.appendChild(el('h2', 'stock-name', item.name));
    if (item.sizes.length) {
      body.appendChild(el('p', 'stock-label', 'Sizes in stock'));
      var ul = el('ul', 'stock-sizes');
      ul.setAttribute('aria-label', 'Sizes in stock');
      item.sizes.forEach(function (s) { ul.appendChild(el('li', null, fmtSize(s))); });
      body.appendChild(ul);
    } else {
      body.appendChild(el('p', 'stock-label', 'In stock'));
    }
    body.appendChild(el('p', 'stock-price', 'Call for price'));
    var ask = el('a', 'button stock-ask', 'Ask Amy');
    ask.href = 'tel:+15708151026';
    ask.setAttribute('aria-label', 'Call Amy about ' + item.name);
    body.appendChild(ask);
    c.appendChild(body);
    return c;
  }

  function render() {
    var q = (search && search.value || '').trim().toLowerCase();
    var f = filter ? filter.value : '';
    var shown = items.filter(function (i) {
      return (!q || i.name.toLowerCase().indexOf(q) !== -1) && (!f || kind(i.name) === f);
    });
    grid.textContent = '';
    shown.forEach(function (i) { grid.appendChild(card(i)); });
    status.textContent = items.length
      ? shown.length + ' of ' + items.length + ' ' + category.toLowerCase() + ' in stock'
      : 'Nothing in stock right now. Call Amy and she can order it for you.';
  }

  if (search) search.addEventListener('input', render);
  if (filter) filter.addEventListener('change', render);

  fetchAll().then(function (rows) {
    items = group(rows.filter(function (r) { return r.qty_total > 0; }));
    // Ace Mitchell files slide soles, heels and shoe covers under Shoes too.
    // Real shoes are stocked by size, so the Shoes page keeps only those.
    if (category === 'Shoes') items = items.filter(function (i) { return i.sizes.length > 0; });
    render();
  }).catch(function () {
    status.textContent = 'Stock could not be loaded. Please try again later, or call Amy at (570) 815-1026.';
  });
})();
