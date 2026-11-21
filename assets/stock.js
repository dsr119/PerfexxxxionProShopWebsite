// Shoes and Bags pages: what Ace Mitchell has in stock right now, at
// bowling.com's price.
//
// A GitHub Action in ProShopAppV1C checks Ace Mitchell every morning, matches
// each item to bowling.com for the consumer price and picture, and saves it
// to Supabase. This reads the public, in-stock-only view of that (no dealer
// cost in it) with the site's publishable key. Items without a bowling.com
// price are left off.
//
// Shoes are stocked per size: each size is its own code, the style number plus
// the size times ten ("58100118 095" is size 9.5). Sizes are grouped back
// under their style here.
//
// Filters (type, balls held, men's/women's, width, hand, size, brand, color,
// price) come from bowling.com's own filter values, saved in retail_attrs by
// the same job. Where an item has none, they are guessed from its name.
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
  var tools = document.getElementById('stock-tools');
  var items = [];
  var filters = []; // { def, select }

  var COLUMNS = 'item_code,name,image_url,qty_total,checked_at,consumer_price,retail_name,retail_image';

  // retail_attrs is newer than the page; if the database doesn't have it yet,
  // load without it and guess the filters from the names.
  function fetchAll() {
    return fetchRows(COLUMNS + ',retail_attrs').catch(function () { return fetchRows(COLUMNS); });
  }

  function fetchRows(columns) {
    var since = new Date(Date.now() - FRESH_DAYS * 864e5).toISOString();
    var path = 'vendor_stock_public?select=' + columns +
      '&consumer_price=not.is.null' +
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
        item = byKey[key] = {
          key: key,
          name: r.retail_name || r.name || r.item_code,
          image: r.retail_image || r.image_url,
          price: r.consumer_price,
          qty: 0,
          sizes: [],
          attrs: r.retail_attrs || null
        };
        list.push(item);
      }
      item.qty += r.qty_total;
      if (size !== null) item.sizes.push(size);
      if (!item.image) item.image = r.retail_image || r.image_url;
      if (!item.attrs && r.retail_attrs) item.attrs = r.retail_attrs;
    });
    list.forEach(function (i) { i.sizes.sort(function (a, b) { return a - b; }); });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return list;
  }

  // ---- filters --------------------------------------------------------

  function list(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
  function attr(item, key) { return item.attrs ? list(item.attrs[key]) : []; }
  function has(re, item) { return re.test(item.name); }

  var GENDERS = { Male: "Men's", Female: "Women's", 'Youth Boy': 'Youth', 'Youth Girl': 'Youth' };
  function gender(item) {
    var g = attr(item, 'gender').map(function (x) { return GENDERS[x] || x; });
    if (g.length) return g;
    if (has(/\byouth\b|\bkids?\b|\bjr\b|\bjunior\b/i, item)) return ['Youth'];
    if (has(/\bwomen'?s?\b|\bladies\b|\bwomens\b/i, item)) return ["Women's"];
    if (has(/\bmen'?s?\b|\bmens\b/i, item)) return ["Men's"];
    return [];
  }

  function hand(item) {
    var h = attr(item, 'hand');
    if (h.length) {
      var out = [];
      h.forEach(function (x) {
        if (/universal|right or left/i.test(x)) out.push('Right-handed', 'Left-handed');
        else if (/right/i.test(x)) out.push('Right-handed');
        else if (/left/i.test(x)) out.push('Left-handed');
      });
      return out;
    }
    var r = has(/\bright\b|\brh\b/i, item), l = has(/\bleft\b|\blh\b/i, item);
    // A name that names no hand is an either-hand shoe.
    if (!r && !l) return ['Right-handed', 'Left-handed'];
    return (r ? ['Right-handed'] : []).concat(l ? ['Left-handed'] : []);
  }

  function width(item) {
    var w = attr(item, 'width');
    if (w.length) return w;
    return has(/\bwide\b/i, item) ? ['Wide'] : ['Standard'];
  }

  function bagType(item) {
    var t = attr(item, 'bag_type');
    if (t.length) return t;
    var roller = has(/roller|wheel/i, item), tote = has(/\btote\b/i, item);
    if (has(/backpack/i, item)) return ['Backpack'];
    if (roller && tote) return ['Roller/Tote'];
    if (roller) return ['Roller'];
    if (tote) return ['Tote'];
    return [];
  }

  var BALL_WORDS = { single: 1, one: 1, double: 2, dbl: 2, two: 2, triple: 3, three: 3, four: 4, quad: 4, six: 6 };
  function ballsHeld(item) {
    var b = attr(item, 'balls_held').map(function (x) { return x === 'None' ? 'No balls (accessory bag)' : x + ' ball' + (x === '1' ? '' : 's'); });
    if (b.length) return b;
    var m = item.name.match(/\b(\d)\s*-?\s*ball\b/i) || item.name.match(/\b(single|double|dbl|triple|quad|one|two|three|four|six)\b/i);
    if (!m) return [];
    var n = /^\d$/.test(m[1]) ? +m[1] : BALL_WORDS[m[1].toLowerCase()];
    return [n + ' ball' + (n === 1 ? '' : 's')];
  }

  var BRANDS = ['3G', '900 Global', 'Brunswick', 'BSI', 'Classic', 'Columbia 300', 'Dexter', 'DV8', 'Ebonite', 'Elite', 'Genesis',
    'Hammer', 'KR Strikeforce', 'Linds', 'Motiv', 'Radical', 'Roto Grip', 'Storm', 'Tenth Frame', 'Track', 'Turbo', 'VISE'];
  function brand(item) {
    var b = attr(item, 'brand');
    if (b.length) return b.map(function (x) { return x === 'bowling.com' ? 'Bowling.com' : x; });
    var n = item.name.toLowerCase();
    for (var i = 0; i < BRANDS.length; i++) if (n.indexOf(BRANDS[i].toLowerCase() + ' ') === 0) return [BRANDS[i]];
    return [];
  }

  var COLORS = ['Black', 'White', 'Blue', 'Navy', 'Royal', 'Red', 'Pink', 'Purple', 'Green', 'Grey', 'Silver', 'Orange', 'Yellow',
    'Teal', 'Brown', 'Tan', 'Gold', 'Charcoal', 'Camo', 'Aqua', 'Lime', 'Maroon', 'Turquoise'];
  function color(item) {
    var c = attr(item, 'color');
    if (c.length) return c;
    var n = item.name.replace(/\bgray\b/ig, 'Grey');
    return COLORS.filter(function (x) { return new RegExp('\\b' + x + '\\b', 'i').test(n); });
  }

  function performance(item) {
    return attr(item, 'performance').filter(function (x) { return x !== 'Rental'; });
  }

  function holdsShoes(item) {
    if (item.attrs) return item.attrs.holds_shoes ? ['Yes'] : [];
    return has(/shoe/i, item) ? ['Yes'] : [];
  }

  var PRICES = [[0, 50, 'Under $50'], [50, 100, '$50 to $100'], [100, 150, '$100 to $150'], [150, 200, '$150 to $200'], [200, 1e9, '$200 and up']];
  function priceBand(item) {
    var p = Number(item.price);
    for (var i = 0; i < PRICES.length; i++) if (p >= PRICES[i][0] && p < PRICES[i][1]) return [PRICES[i][2]];
    return [];
  }

  function sizes(item) { return item.sizes.map(fmtSize); }

  // order: how to sort the options ('given' keeps the order in values).
  var FILTERS = {
    Shoes: [
      { id: 'gender', label: 'For', all: 'Everyone', get: gender, values: ["Men's", "Women's", 'Youth'] },
      { id: 'type', label: 'Type', all: 'All types', get: performance, values: ['Performance', 'Athletic'] },
      { id: 'hand', label: 'Hand', all: 'Either hand', get: hand, values: ['Right-handed', 'Left-handed'] },
      { id: 'width', label: 'Width', all: 'Any width', get: width, values: ['Standard', 'Wide'] },
      { id: 'size', label: 'Size', all: 'Any size', get: sizes, order: 'number' },
      { id: 'brand', label: 'Brand', all: 'All brands', get: brand },
      { id: 'color', label: 'Color', all: 'Any color', get: color },
      { id: 'price', label: 'Price', all: 'Any price', get: priceBand, values: PRICES.map(function (p) { return p[2]; }) }
    ],
    Bags: [
      { id: 'type', label: 'Type', all: 'All types', get: bagType, values: ['Tote', 'Roller', 'Roller/Tote', 'Backpack'] },
      { id: 'balls', label: 'Holds', all: 'Any number of balls', get: ballsHeld, order: 'number' },
      { id: 'shoes', label: 'Room for shoes', all: 'Either', get: holdsShoes, values: ['Yes'] },
      { id: 'brand', label: 'Brand', all: 'All brands', get: brand },
      { id: 'color', label: 'Color', all: 'Any color', get: color },
      { id: 'price', label: 'Price', all: 'Any price', get: priceBand, values: PRICES.map(function (p) { return p[2]; }) }
    ]
  };

  var SORTS = [
    ['name', 'Name A to Z', function (a, b) { return a.name.localeCompare(b.name); }],
    ['low', 'Price, low to high', function (a, b) { return a.price - b.price || a.name.localeCompare(b.name); }],
    ['high', 'Price, high to low', function (a, b) { return b.price - a.price || a.name.localeCompare(b.name); }]
  ];
  var sortSelect = null;

  function option(value, text) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    return o;
  }

  // One dropdown per filter, listing only what's actually in stock, with a
  // count. A filter with fewer than two choices isn't worth showing.
  function buildFilters() {
    var params = new URLSearchParams(location.search);
    (FILTERS[category] || []).forEach(function (def) {
      var counts = {};
      items.forEach(function (i) {
        var seen = {};
        def.get(i).forEach(function (v) { if (!seen[v]) { seen[v] = 1; counts[v] = (counts[v] || 0) + 1; } });
      });
      var values = def.values ? def.values.filter(function (v) { return counts[v]; }) : Object.keys(counts);
      if (!def.values) {
        values.sort(def.order === 'number'
          ? function (a, b) { return (parseFloat(a) || 99) - (parseFloat(b) || 99); }
          : function (a, b) { return a.localeCompare(b); });
      }
      if (values.length < (def.values && def.values.length === 1 ? 1 : 2)) return;
      var label = el('label', null, def.label);
      var select = document.createElement('select');
      select.appendChild(option('', def.all));
      values.forEach(function (v) { select.appendChild(option(v, v + ' (' + counts[v] + ')')); });
      if (params.get(def.id) && counts[params.get(def.id)]) select.value = params.get(def.id);
      select.addEventListener('change', update);
      label.appendChild(select);
      tools.appendChild(label);
      filters.push({ def: def, select: select });
    });

    var sortLabel = el('label', null, 'Sort');
    sortSelect = document.createElement('select');
    SORTS.forEach(function (s) { sortSelect.appendChild(option(s[0], s[1])); });
    if (params.get('sort')) sortSelect.value = params.get('sort');
    if (!sortSelect.value) sortSelect.value = 'name';
    sortSelect.addEventListener('change', update);
    sortLabel.appendChild(sortSelect);
    tools.appendChild(sortLabel);

    var clear = el('button', 'stock-clear', 'Clear filters');
    clear.type = 'button';
    clear.addEventListener('click', function () {
      filters.forEach(function (f) { f.select.value = ''; });
      if (search) search.value = '';
      update();
    });
    tools.appendChild(clear);
  }

  // Keep the choices in the address so a filtered page can be shared.
  function update() {
    var params = new URLSearchParams();
    filters.forEach(function (f) { if (f.select.value) params.set(f.def.id, f.select.value); });
    if (sortSelect && sortSelect.value !== 'name') params.set('sort', sortSelect.value);
    var qs = params.toString();
    try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* file:// */ }
    render();
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
    body.appendChild(el('p', 'stock-price', item.price != null ? '$' + Number(item.price).toFixed(2) : 'Call for price'));
    var ask = el('a', 'button stock-ask', 'Ask Amy');
    ask.href = 'tel:+15708151026';
    ask.setAttribute('aria-label', 'Call Amy about ' + item.name);
    body.appendChild(ask);
    c.appendChild(body);
    return c;
  }

  function render() {
    var q = (search && search.value || '').trim().toLowerCase();
    var active = filters.filter(function (f) { return f.select.value; });
    var shown = items.filter(function (i) {
      if (q && i.name.toLowerCase().indexOf(q) === -1) return false;
      return active.every(function (f) { return f.def.get(i).indexOf(f.select.value) !== -1; });
    });
    var sort = SORTS.filter(function (s) { return sortSelect && s[0] === sortSelect.value; })[0] || SORTS[0];
    shown.sort(sort[2]);
    grid.textContent = '';
    shown.forEach(function (i) { grid.appendChild(card(i)); });
    status.textContent = items.length
      ? (shown.length ? shown.length + ' of ' + items.length + ' ' + category.toLowerCase() + ' in stock'
        : 'Nothing in stock matches those filters. Try fewer, or call Amy and she can order it for you.')
      : 'Nothing in stock right now. Call Amy and she can order it for you.';
  }

  if (search) search.addEventListener('input', render);

  fetchAll().then(function (rows) {
    items = group(rows.filter(function (r) { return r.qty_total > 0 && r.consumer_price != null; }));
    // Ace Mitchell files slide soles, heels and shoe covers under Shoes too.
    // Real shoes are stocked by size, so the Shoes page keeps only those.
    if (category === 'Shoes') items = items.filter(function (i) { return i.sizes.length > 0; });
    if (tools) buildFilters();
    render();
  }).catch(function () {
    status.textContent = 'Stock could not be loaded. Please try again later, or call Amy at (570) 815-1026.';
  });
})();
