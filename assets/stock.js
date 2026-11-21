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
//
// Order buttons open a form that saves the order straight into the orders
// table in Supabase, the same way the Bowling Balls page does, so it shows up
// in Amy's app (ProShopAppV1C) with source "website". Nothing is paid online.
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
          codes: {}, // size -> Ace Mitchell item code
          code: r.item_code,
          attrs: r.retail_attrs || null
        };
        list.push(item);
      }
      item.qty += r.qty_total;
      if (size !== null) { item.sizes.push(size); item.codes[size] = r.item_code; }
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
    var order = el('button', 'button stock-ask', 'Order');
    order.type = 'button';
    order.setAttribute('aria-label', 'Order ' + item.name);
    order.addEventListener('click', function () { openOrder(item); });
    body.appendChild(order);
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
        : 'Nothing in stock matches those filters. Try fewer, or call the shop at (570) 815-1026 and we can order it for you.')
      : 'Nothing in stock right now. Call the shop at (570) 815-1026 and we can order it for you.';
  }

  // ---- ordering -------------------------------------------------------

  // Same two houses as the Bowling Balls page; the orders table rejects
  // anything else.
  var LOCATIONS = ['Valley', 'South Side'];
  var dialog = null;

  // Match the format the pro shop app displays and searches on.
  function normalizePhone(raw) {
    var digits = String(raw || '').replace(/\D/g, '');
    var ten = digits.length === 11 && digits.charAt(0) === '1' ? digits.slice(1) : digits;
    return ten.length === 10 ? ten.slice(0, 3) + '-' + ten.slice(3, 6) + '-' + ten.slice(6) : String(raw || '').trim();
  }

  function field(form, labelText, control) {
    var label = el('label', 'order-field');
    label.appendChild(el('span', null, labelText));
    label.appendChild(control);
    form.appendChild(label);
    return control;
  }

  function input(type, name, autocomplete) {
    var i = document.createElement('input');
    i.type = type;
    i.name = name;
    i.required = true;
    if (autocomplete) i.autocomplete = autocomplete;
    return i;
  }

  function choice(name, prompt, values) {
    var s = document.createElement('select');
    s.name = name;
    s.required = true;
    s.appendChild(option('', prompt));
    values.forEach(function (v) { s.appendChild(option(v, v)); });
    return s;
  }

  function getDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'order-dialog';
    dialog.setAttribute('aria-labelledby', 'order-title');
    // Click on the backdrop closes it.
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    document.body.appendChild(dialog);
    return dialog;
  }

  function openOrder(item) {
    var d = getDialog();
    d.textContent = '';
    var close = el('button', 'order-close', '\u00d7');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', function () { d.close(); });
    d.appendChild(close);
    d.appendChild(el('h2', 'order-title', 'Place an order')).id = 'order-title';

    var head = el('div', 'order-item');
    if (item.image) {
      var img = el('img');
      img.src = item.image;
      img.alt = '';
      head.appendChild(img);
    }
    var info = el('div');
    info.appendChild(el('p', 'order-name', item.name));
    info.appendChild(el('p', 'order-price', '$' + Number(item.price).toFixed(2)));
    head.appendChild(info);
    d.appendChild(head);

    var form = el('form', 'order-form');
    form.noValidate = false;
    var size = null;
    if (item.sizes.length) {
      size = field(form, 'Size', choice('size', 'Pick a size', item.sizes.map(fmtSize)));
      // Carry over the Size filter if one is picked.
      var sizeFilter = filters.filter(function (f) { return f.def.id === 'size'; })[0];
      if (sizeFilter && sizeFilter.select.value) size.value = sizeFilter.select.value;
    }
    var name = field(form, 'Name', input('text', 'name', 'name'));
    var phone = field(form, 'Phone number', input('tel', 'phone', 'tel'));
    phone.placeholder = '(555) 555-5555';
    var orderLoc = field(form, 'Ordering from', choice('order_location', 'Which house?', LOCATIONS));
    var pickLoc = field(form, 'Pick up at', choice('pickup_location', 'Which house?', LOCATIONS));

    var consent = el('label', 'order-consent');
    var box = input('checkbox', 'consent');
    consent.appendChild(box);
    var text = el('span');
    text.innerHTML = 'I agree that Perfexxxion Pro Shop can keep my name and phone number to handle this order and call me about it ' +
      '(<a href="../privacy-policy/" target="_blank" rel="noopener">Privacy Policy</a>), and I accept the ' +
      '<a href="../terms-of-service/" target="_blank" rel="noopener">Terms</a> and ' +
      '<a href="../refund-policy/" target="_blank" rel="noopener">Refund Policy</a>.';
    consent.appendChild(text);
    form.appendChild(consent);

    form.appendChild(el('p', 'order-note', 'Nothing is charged online. We will call you to confirm the order and let you know when it is ready to pick up.'));
    var error = el('p', 'order-error');
    error.setAttribute('role', 'alert');
    form.appendChild(error);
    var submit = el('button', 'button order-submit', 'Submit order');
    submit.type = 'submit';
    form.appendChild(submit);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      error.textContent = '';
      if (normalizePhone(phone.value).replace(/\D/g, '').length !== 10) {
        error.textContent = 'Please enter a 10-digit phone number so we can call you.';
        phone.focus();
        return;
      }
      var chosen = size ? parseFloat(size.value) : null;
      var code = chosen !== null ? item.codes[chosen] : item.code;
      var order = {
        customer_name: name.value.trim(),
        phone: normalizePhone(phone.value),
        item: item.name + (chosen !== null ? ' - Size ' + fmtSize(chosen) : ''),
        quantity: 1,
        order_location: orderLoc.value,
        pickup_location: pickLoc.value,
        source: 'website',
        is_stock: false,
        submitted_at: new Date().toISOString(),
        price: Number(item.price),
        supplier: 'Ace Mitchell',
        notes: 'Ace Mitchell item ' + code,
        // Shoes and bags arrive for a named customer but never get drilled,
        // so keep them off the drilling queue.
        no_drill_needed: true
      };
      submit.disabled = true;
      submit.textContent = 'Submitting...';
      saveOrder(order).then(function () {
        form.remove();
        var done = el('div', 'order-done');
        var h = el('h3', null, 'Order received!');
        h.tabIndex = -1;
        done.appendChild(h);
        done.appendChild(el('p', null, order.item + ' has been submitted.'));
        done.appendChild(el('p', null, 'We will call you at ' + order.phone + ' to confirm.'));
        var ok = el('button', 'button', 'Close');
        ok.type = 'button';
        ok.addEventListener('click', function () { d.close(); });
        done.appendChild(ok);
        d.appendChild(done);
        h.focus();
      }).catch(function (err) {
        if (window.console) console.error('Order failed:', err);
        submit.disabled = false;
        submit.textContent = 'Submit order';
        error.textContent = 'Sorry, the order could not be sent and nothing was saved. Please try again, or call the shop at (570) 815-1026.';
      });
    });

    d.appendChild(form);
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    (size || name).focus();
  }

  function saveOrder(order) {
    return fetch(SUPABASE_URL + '/rest/v1/orders', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify(order)
    }).then(function (res) {
      if (res.ok) return;
      return res.text().then(function (body) {
        // Older databases may not have the no-drill column yet; the order
        // matters more than the flag.
        if ('no_drill_needed' in order && /no_drill_needed/.test(body)) {
          var copy = {};
          Object.keys(order).forEach(function (k) { if (k !== 'no_drill_needed') copy[k] = order[k]; });
          return saveOrder(copy);
        }
        throw new Error(body || res.status);
      });
    });
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
