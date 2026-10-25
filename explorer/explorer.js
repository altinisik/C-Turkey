/*
 * C-Turkey Dataset Explorer
 * Filters, maps and exports the C-Turkey radiocarbon dataset in the browser.
 */
(function () {
  "use strict";

  // ---------- configuration ----------
  var TSV_URL = "data/processed/cturkey_v1.tsv";
  var OFFLINE_DATA = "explorer/data.js";
  var CALIBRATE_URL = "https://altinisik.ezgilab.com/cturkey-app/";
  var GENOMIC = "Genomically Integrated";

  var FACETS = [
    { key: "dna_status", label: "Genomic data" },
    { key: "mat_group", label: "Material group" },
    { key: "species_group", label: "Species group" },
    { key: "sitetype", label: "Site type", display: capitalise },
    { key: "region", label: "Province", searchable: true, sort: "alpha" },
    { key: "site", label: "Site", searchable: true },
    { key: "sourcedb", label: "Source database", display: sourceLabel }
  ];

  var COLUMNS = [
    { key: "labnr", label: "Lab no." },
    { key: "c14age", label: "¹⁴C age (BP)", numeric: true },
    { key: "site", label: "Site" },
    { key: "region", label: "Province" },
    { key: "material", label: "Material" },
    { key: "species_group", label: "Species group" },
    { key: "dna_status", label: "Genomic" },
    { key: "shortref", label: "Reference" }
  ];

  var DETAILS = [
    ["feature", "Context"], ["period", "Period"], ["culture", "Culture"],
    ["sitetype", "Site type"], ["species", "Species"], ["mat_group", "Material group"],
    ["c13val", "δ¹³C (‰)"], ["method", "Method"], ["coords", "Coordinates"],
    ["source", "Source database"]
  ];

  // ---------- helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat("en-US");

  function capitalise(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function sourceLabel(s) {
    return { "c-turkey": "C-Turkey compilation", aadr: "AADR", "present datasets": "Existing databases" }[s] || s;
  }
  function fold(s) {
    return String(s).replace(/[ıİ]/g, "i").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }
  function tidy(s) { return s ? s.replace(/"{2,}/g, "\u201D").replace(/\u201D([^\u201D]*)\u201D/g, "\u201C$1\u201D") : s; }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k in e && typeof attrs[k] !== "string") e[k] = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    return e;
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }

  // ---------- data ----------
  var rows = [], header = [];

  function parseTsv(text) {
    var lines = text.replace(/\r/g, "").split("\n").filter(function (l) { return l.length; });
    header = lines[0].split("\t");
    return lines.slice(1).map(function (line, i) {
      var cells = line.split("\t"), r = { _i: i };
      header.forEach(function (h, k) {
        var v = cells[k] == null ? "" : cells[k];
        if (v === "NA") v = "";
        r[h] = v;
      });
      r.c14age = +r.c14age;
      r.c14std = +r.c14std;
      r.lat = +r.lat; r.lon = +r.lon;
      // some δ13C values use an en dash instead of a minus sign
      r.c13num = r.c13val ? parseFloat(r.c13val.replace(/[\u2013\u2212]/g, "-")) : NaN;
      r._search = fold([r.labnr, r.site, r.region, r.feature, r.period, r.culture, r.material, r.species, r.shortref, r.sitetype].join(" "));
      return r;
    });
  }

  function loadData() {
    var viaFetch = location.protocol === "file:"
      ? Promise.reject(new Error("file"))
      : fetch(TSV_URL).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); });
    return viaFetch.catch(function () {
      return loadScript(OFFLINE_DATA).then(function () {
        if (!window.CTURKEY_TSV) throw new Error("no data");
        return window.CTURKEY_TSV;
      });
    }).then(parseTsv);
  }

  // ---------- state ----------
  var state = {
    q: "",
    facets: {},          // key -> Set of values
    ageMin: null, ageMax: null,
    sort: { key: "c14age", dir: 1 },
    page: 0, pageSize: 25,
    open: {}             // expanded row ids
  };
  FACETS.forEach(function (f) { state.facets[f.key] = new Set(); });

  function passes(r, except) {
    if (state.q && r._search.indexOf(state.q) < 0) return false;
    if (except !== "age") {
      if (state.ageMin != null && r.c14age < state.ageMin) return false;
      if (state.ageMax != null && r.c14age > state.ageMax) return false;
    }
    for (var i = 0; i < FACETS.length; i++) {
      var k = FACETS[i].key;
      if (k === except) continue;
      var sel = state.facets[k];
      if (sel.size && !sel.has(r[k])) return false;
    }
    return true;
  }

  function activeCount() {
    var n = (state.q ? 1 : 0) + (state.ageMin != null || state.ageMax != null ? 1 : 0);
    FACETS.forEach(function (f) { n += state.facets[f.key].size; });
    return n;
  }

  // ---------- URL state (shareable views) ----------
  function writeUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set("q", $("search").value.trim());
    if (state.ageMin != null) p.set("min", state.ageMin);
    if (state.ageMax != null) p.set("max", state.ageMax);
    FACETS.forEach(function (f) { state.facets[f.key].forEach(function (v) { p.append(f.key, v); }); });
    var qs = p.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch (e) { /* file:// */ }
  }
  function readUrl() {
    var p = new URLSearchParams(location.search);
    if (p.get("q")) { $("search").value = p.get("q"); state.q = fold(p.get("q").trim()); }
    if (p.get("min") && isFinite(+p.get("min"))) state.ageMin = +p.get("min");
    if (p.get("max") && isFinite(+p.get("max"))) state.ageMax = +p.get("max");
    FACETS.forEach(function (f) { p.getAll(f.key).forEach(function (v) { state.facets[f.key].add(v); }); });
  }

  // ---------- facets ----------
  var facetUi = {};

  function buildFacets() {
    var host = $("facets");
    FACETS.forEach(function (f) {
      var totals = {};
      rows.forEach(function (r) { if (r[f.key]) totals[r[f.key]] = (totals[r[f.key]] || 0) + 1; });
      var values = Object.keys(totals).sort(f.sort === "alpha"
        ? function (a, b) { return a.localeCompare(b, "tr"); }
        : function (a, b) { return totals[b] - totals[a] || a.localeCompare(b, "tr"); });

      var box = el("section", { class: "facet" });
      var head = el("div", { class: "facet-head" });
      var h = el("h3", { id: "fh_" + f.key }, f.label);
      var clear = el("button", { type: "button", class: "link-btn", hidden: true }, "Clear");
      clear.addEventListener("click", function () { state.facets[f.key].clear(); syncFacetChecks(f.key); changed(); });
      head.appendChild(h); head.appendChild(clear);
      box.appendChild(head);

      var filterInput = null;
      if (f.searchable) {
        filterInput = el("input", { type: "search", class: "facet-search", placeholder: "Find " + f.label.toLowerCase() + "…", "aria-label": "Find " + f.label.toLowerCase() });
        box.appendChild(filterInput);
      }
      var list = el("ul", { class: "facet-list" + (f.searchable ? " scroll" : ""), role: "group", "aria-labelledby": "fh_" + f.key });
      var items = {};
      values.forEach(function (v, idx) {
        var id = "f_" + f.key + "_" + idx;
        var li = el("li");
        var cb = el("input", { type: "checkbox", id: id });
        cb.value = v;
        cb.addEventListener("change", function () {
          if (cb.checked) state.facets[f.key].add(v); else state.facets[f.key].delete(v);
          changed();
        });
        var lab = el("label", { for: id });
        lab.appendChild(el("span", { class: "fv" }, f.display ? f.display(v) : v));
        var cnt = el("span", { class: "fc" });
        lab.appendChild(cnt);
        li.appendChild(cb); li.appendChild(lab);
        list.appendChild(li);
        items[v] = { li: li, cb: cb, cnt: cnt, text: fold(v) };
      });
      box.appendChild(list);
      if (filterInput) {
        filterInput.addEventListener("input", function () {
          var q = fold(filterInput.value.trim());
          Object.keys(items).forEach(function (v) { items[v].li.hidden = q && items[v].text.indexOf(q) < 0; });
        });
      }
      host.appendChild(box);
      facetUi[f.key] = { items: items, clear: clear };
    });
  }

  function syncFacetChecks(key) {
    var ui = facetUi[key];
    Object.keys(ui.items).forEach(function (v) { ui.items[v].cb.checked = state.facets[key].has(v); });
  }

  function updateFacetCounts() {
    FACETS.forEach(function (f) {
      var counts = {};
      rows.forEach(function (r) { if (passes(r, f.key)) counts[r[f.key]] = (counts[r[f.key]] || 0) + 1; });
      var ui = facetUi[f.key];
      Object.keys(ui.items).forEach(function (v) {
        var n = counts[v] || 0, it = ui.items[v];
        it.cnt.textContent = nf.format(n);
        it.li.classList.toggle("zero", n === 0 && !state.facets[f.key].has(v));
      });
      ui.clear.hidden = !state.facets[f.key].size;
    });
  }

  // ---------- active filter chips ----------
  function renderChips() {
    var host = $("chips");
    host.innerHTML = "";
    function chip(text, onRemove) {
      var b = el("button", { type: "button", class: "chip", "aria-label": "Remove filter: " + text });
      b.appendChild(el("span", null, text));
      b.appendChild(el("span", { class: "x", "aria-hidden": "true" }, "×"));
      b.addEventListener("click", onRemove);
      host.appendChild(b);
    }
    if (state.q) chip("Search: " + $("search").value.trim(), function () { $("search").value = ""; state.q = ""; changed(); });
    if (state.ageMin != null || state.ageMax != null) {
      var t = state.ageMin != null && state.ageMax != null ? nf.format(state.ageMax) + "–" + nf.format(state.ageMin) + " BP"
        : state.ageMin != null ? "≥ " + nf.format(state.ageMin) + " BP" : "≤ " + nf.format(state.ageMax) + " BP";
      chip(t, function () { setAge(null, null); });
    }
    FACETS.forEach(function (f) {
      state.facets[f.key].forEach(function (v) {
        chip(f.display ? f.display(v) : v, function () { state.facets[f.key].delete(v); syncFacetChecks(f.key); changed(); });
      });
    });
    var n = activeCount() - (state.q ? 1 : 0);
    $("facet_summary").textContent = n ? "Filters (" + n + " active)" : "Filters";
    $("clear_all").hidden = activeCount() === 0;
  }

  // ---------- age histogram ----------
  var HIST = { w: 420, h: 250, padL: 34, padR: 8, padT: 10, padB: 36, bin: 250 };
  var histMax = 19000;

  function setAge(min, max) {
    if (min != null && max != null && min > max) { var t = min; min = max; max = t; }
    state.ageMin = min; state.ageMax = max;
    $("age_min").value = min == null ? "" : min;
    $("age_max").value = max == null ? "" : max;
    changed();
  }

  function renderHistogram(filteredNoAge) {
    var nb = Math.ceil(histMax / HIST.bin);
    var all = new Array(nb).fill(0), gen = new Array(nb).fill(0);
    filteredNoAge.forEach(function (r) {
      var b = Math.min(nb - 1, Math.floor(r.c14age / HIST.bin));
      all[b]++; if (r.dna_status === GENOMIC) gen[b]++;
    });
    var ymax = Math.max(1, Math.max.apply(null, all));
    var iw = HIST.w - HIST.padL - HIST.padR, ih = HIST.h - HIST.padT - HIST.padB;
    // older dates on the left, as on a timeline
    var X = function (bp) { return HIST.padL + (1 - bp / histMax) * iw; };
    var Y = function (n) { return HIST.padT + ih - n / ymax * ih; };
    var s = [];
    s.push('<svg viewBox="0 0 ' + HIST.w + " " + HIST.h + '" id="hist_svg" aria-hidden="true">');
    // selection band
    if (state.ageMin != null || state.ageMax != null) {
      var a = X(state.ageMax != null ? state.ageMax : histMax), b = X(state.ageMin != null ? state.ageMin : 0);
      s.push('<rect class="h-sel" x="' + a + '" y="' + HIST.padT + '" width="' + Math.max(1, b - a) + '" height="' + ih + '"/>');
    }
    for (var i = 0; i < nb; i++) {
      if (!all[i]) continue;
      var x0 = X((i + 1) * HIST.bin), x1 = X(i * HIST.bin), w = Math.max(0.5, x1 - x0 - 0.6);
      s.push('<rect class="h-bar" x="' + x0 + '" y="' + Y(all[i]) + '" width="' + w + '" height="' + (Y(0) - Y(all[i])) + '"/>');
      if (gen[i]) s.push('<rect class="h-gen" x="' + x0 + '" y="' + Y(gen[i]) + '" width="' + w + '" height="' + (Y(0) - Y(gen[i])) + '"/>');
    }
    s.push('<line class="h-axis" x1="' + HIST.padL + '" y1="' + Y(0) + '" x2="' + (HIST.w - HIST.padR) + '" y2="' + Y(0) + '"/>');
    for (var t = 0; t <= histMax; t += 2000) {
      s.push('<line class="h-axis" x1="' + X(t) + '" y1="' + Y(0) + '" x2="' + X(t) + '" y2="' + (Y(0) + 4) + '"/>');
      s.push('<text class="h-lab" x="' + X(t) + '" y="' + (Y(0) + 17) + '" text-anchor="middle">' + (t / 1000) + "k</text>");
    }
    s.push('<text class="h-lab" x="' + (HIST.w - HIST.padR) + '" y="' + (HIST.h - 2) + '" text-anchor="end">¹⁴C years BP</text>');
    s.push('<text class="h-lab" x="' + (HIST.padL - 6) + '" y="' + (Y(ymax) + 4) + '" text-anchor="end">' + nf.format(ymax) + "</text>");
    s.push('<text class="h-lab" x="' + (HIST.padL - 6) + '" y="' + (Y(0) + 4) + '" text-anchor="end">0</text>');
    s.push('<rect id="h_hit" x="' + HIST.padL + '" y="0" width="' + iw + '" height="' + HIST.h + '" fill="transparent"/>');
    s.push("</svg>");
    $("hist").innerHTML = s.join("");
    bindBrush();
  }

  function bindBrush() {
    var svg = $("hist_svg");
    var iw = HIST.w - HIST.padL - HIST.padR;
    function toBp(evt) {
      var r = svg.getBoundingClientRect();
      var x = (evt.clientX - r.left) / r.width * HIST.w;
      var f = Math.min(1, Math.max(0, (x - HIST.padL) / iw));
      return Math.round((1 - f) * histMax / 50) * 50;
    }
    var start = null, moved = false;
    svg.addEventListener("pointerdown", function (e) {
      start = toBp(e); moved = false;
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", function (e) {
      if (start == null) return;
      var now = toBp(e);
      if (Math.abs(now - start) < 50) return;
      moved = true;
      var band = svg.querySelector(".h-sel");
      var iwx = HIST.w - HIST.padL - HIST.padR;
      var X = function (bp) { return HIST.padL + (1 - bp / histMax) * iwx; };
      if (!band) {
        band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        band.setAttribute("class", "h-sel"); band.setAttribute("y", HIST.padT);
        band.setAttribute("height", HIST.h - HIST.padT - HIST.padB);
        svg.insertBefore(band, svg.firstChild);
      }
      var a = X(Math.max(start, now)), b = X(Math.min(start, now));
      band.setAttribute("x", a); band.setAttribute("width", Math.max(1, b - a));
    });
    svg.addEventListener("pointerup", function (e) {
      if (start == null) return;
      var end = toBp(e), s0 = start;
      start = null;
      if (moved) setAge(Math.min(s0, end), Math.max(s0, end));
    });
    svg.addEventListener("dblclick", function () { setAge(null, null); });
  }

  // ---------- map ----------
  var map = null, markerLayer = null, mapFitted = false;

  function initMap() {
    if (!window.L) { $("map").innerHTML = '<p class="map-msg">The map could not be loaded.</p>'; return; }
    map = L.map("map", { scrollWheelZoom: false, attributionControl: true, zoomSnap: 0.25 });
    var dark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
    L.tileLayer("https://{s}.basemaps.cartocdn.com/" + (dark ? "dark_all" : "light_all") + "/{z}/{x}/{y}{r}.png", {
      maxZoom: 18, subdomains: "abcd",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    map.fitBounds([[35.8, 25.6], [42.2, 44.8]]);
    map.on("focus", function () { map.scrollWheelZoom.enable(); });
    map.on("blur", function () { map.scrollWheelZoom.disable(); });
  }

  function renderMap(filtered) {
    if (!map) return;
    markerLayer.clearLayers();
    // one marker per site; a few sites have slightly different coordinates
    // across sources, so the marker sits at their mean position
    var groups = {};
    filtered.forEach(function (r) {
      if (!isFinite(r.lat) || !isFinite(r.lon)) return;
      var g = groups[r.site] || (groups[r.site] = { site: r.site, region: r.region, sLat: 0, sLon: 0, nc: 0, n: 0, gen: 0, min: Infinity, max: -Infinity });
      g.sLat += r.lat; g.sLon += r.lon; g.nc++;
      g.n++; if (r.dna_status === GENOMIC) g.gen++;
      g.min = Math.min(g.min, r.c14age); g.max = Math.max(g.max, r.c14age);
    });
    Object.keys(groups).forEach(function (k) { var g = groups[k]; g.lat = g.sLat / g.nc; g.lon = g.sLon / g.nc; });
    var list = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.n - a.n; });
    var css = getComputedStyle(document.documentElement);
    var cPlain = css.getPropertyValue("--map-site").trim(), cGen = css.getPropertyValue("--map-gen").trim();
    var bounds = [];
    list.forEach(function (g) {
      var sel = state.facets.site.has(g.site);
      var m = L.circleMarker([g.lat, g.lon], {
        radius: Math.min(16, 3 + Math.sqrt(g.n) * 1.1),
        color: sel ? "#000" : "#fff", weight: sel ? 2 : 1,
        fillColor: g.gen ? cGen : cPlain, fillOpacity: 0.85
      });
      var box = el("div", { class: "pop" });
      box.appendChild(el("strong", null, g.site));
      box.appendChild(el("div", null, g.region));
      box.appendChild(el("div", null, nf.format(g.n) + (g.n === 1 ? " date" : " dates") + ", " +
        (g.min === g.max ? nf.format(g.min) : nf.format(g.max) + "–" + nf.format(g.min)) + " BP"));
      if (g.gen) box.appendChild(el("div", null, g.gen + " with genomic data"));
      var btn = el("button", { type: "button", class: "link-btn" }, sel ? "Remove site filter" : "Show only this site");
      btn.addEventListener("click", function () {
        if (sel) state.facets.site.delete(g.site); else { state.facets.site.clear(); state.facets.site.add(g.site); }
        syncFacetChecks("site"); map.closePopup(); changed();
      });
      box.appendChild(btn);
      m.bindPopup(box);
      m.bindTooltip(g.site + " (" + g.n + ")", { direction: "top", offset: [0, -4] });
      markerLayer.addLayer(m);
      bounds.push([g.lat, g.lon]);
    });
    $("map_count").textContent = nf.format(list.length) + (list.length === 1 ? " site" : " sites");
    state._bounds = bounds;
  }

  function fitToResults() {
    if (!map || !state._bounds || !state._bounds.length) return;
    if (state._bounds.length === 1) map.setView(state._bounds[0], 9);
    else map.fitBounds(state._bounds, { padding: [24, 24], maxZoom: 10 });
  }

  // ---------- table ----------
  var current = [];

  function sortRows(list) {
    var k = state.sort.key, d = state.sort.dir;
    return list.slice().sort(function (a, b) {
      var x = a[k], y = b[k];
      if (k === "c14age") return (x - y) * d || (a.c14std - b.c14std);
      if (!x && y) return 1; if (x && !y) return -1;
      return String(x).localeCompare(String(y), "tr", { numeric: true }) * d;
    });
  }

  function buildTableHead() {
    var tr = $("thead_row");
    tr.appendChild(el("th", { class: "c-exp" }, "")).appendChild(el("span", { class: "sr" }, "Details"));
    COLUMNS.forEach(function (c) {
      var th = el("th", { scope: "col", "data-key": c.key, class: c.numeric ? "num" : "" });
      var b = el("button", { type: "button", class: "sort" }, c.label);
      b.addEventListener("click", function () {
        if (state.sort.key === c.key) state.sort.dir *= -1; else state.sort = { key: c.key, dir: 1 };
        state.page = 0; renderTable();
      });
      th.appendChild(b);
      tr.appendChild(th);
    });
    tr.appendChild(el("th", { scope: "col", class: "c-act" })).appendChild(el("span", { class: "sr" }, "Calibrate"));
  }

  function cell(tr, text, cls) { var td = el("td", cls ? { class: cls } : null, text); tr.appendChild(td); return td; }

  function calibrateLink(r) {
    var p = new URLSearchParams({ id: r.labnr + (r.site ? " " + r.site : ""), age: r.c14age, error: r.c14std });
    return CALIBRATE_URL + "?" + p.toString();
  }

  function detailValue(r, key) {
    if (key === "coords") return isFinite(r.lat) ? r.lat.toFixed(4) + ", " + r.lon.toFixed(4) : "";
    if (key === "source") return sourceLabel(r.sourcedb) + (r.sourcedb_version ? " (version " + r.sourcedb_version + ")" : "");
    if (key === "sitetype") return capitalise(r.sitetype);
    if (key === "c13val") return isFinite(r.c13num) ? String(r.c13num) : "";
    return tidy(r[key]);
  }

  function renderTable() {
    var sorted = sortRows(current);
    var pages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
    state.page = Math.min(state.page, pages - 1);
    var from = state.page * state.pageSize, slice = sorted.slice(from, from + state.pageSize);

    document.querySelectorAll("#thead_row th[data-key]").forEach(function (th) {
      var k = th.getAttribute("data-key");
      th.setAttribute("aria-sort", k === state.sort.key ? (state.sort.dir > 0 ? "ascending" : "descending") : "none");
    });

    var tb = $("tbody");
    tb.innerHTML = "";
    if (!slice.length) {
      var tr0 = el("tr");
      var td0 = el("td", { colspan: String(COLUMNS.length + 2), class: "empty" });
      td0.appendChild(document.createTextNode("No dates match these filters. "));
      var cb = el("button", { type: "button", class: "link-btn" }, "Clear all filters");
      cb.addEventListener("click", clearAll);
      td0.appendChild(cb);
      tr0.appendChild(td0); tb.appendChild(tr0);
    }
    slice.forEach(function (r) {
      var open = !!state.open[r._i];
      var tr = el("tr", { class: open ? "open" : "" });
      var tdx = el("td", { class: "c-exp" });
      var bx = el("button", { type: "button", class: "exp", "aria-expanded": String(open), "aria-label": "Details for " + r.labnr });
      bx.addEventListener("click", function () { state.open[r._i] = !open; renderTable(); });
      tdx.appendChild(bx); tr.appendChild(tdx);
      cell(tr, r.labnr, "mono");
      cell(tr, nf.format(r.c14age) + " ± " + r.c14std, "num");
      cell(tr, r.site);
      cell(tr, r.region);
      cell(tr, r.material || "—", r.material ? "" : "muted");
      cell(tr, r.species_group);
      var g = cell(tr, "");
      if (r.dna_status === GENOMIC) g.appendChild(el("span", { class: "badge" }, "Genomic"));
      cell(tr, r.shortref, "ref");
      var ta = el("td", { class: "c-act" });
      ta.appendChild(el("a", { href: calibrateLink(r), target: "_blank", rel: "noopener", class: "cal" }, "Calibrate"));
      tr.appendChild(ta);
      tb.appendChild(tr);

      if (open) {
        var dr = el("tr", { class: "detail" });
        var dtd = el("td", { colspan: String(COLUMNS.length + 2) });
        var dl = el("dl");
        DETAILS.forEach(function (d) {
          var v = detailValue(r, d[0]);
          if (!v) return;
          var w = el("div");
          w.appendChild(el("dt", null, d[1]));
          w.appendChild(el("dd", null, v));
          dl.appendChild(w);
        });
        dtd.appendChild(dl); dr.appendChild(dtd); tb.appendChild(dr);
      }
    });

    $("page_info").textContent = sorted.length
      ? nf.format(from + 1) + "–" + nf.format(from + slice.length) + " of " + nf.format(sorted.length)
      : "0 of 0";
    $("prev").disabled = state.page === 0;
    $("next").disabled = state.page >= pages - 1;
  }

  // ---------- export ----------
  function exportRows(sep) {
    var esc = sep === ","
      ? function (v) { v = v == null ? "" : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
      : function (v) { return v == null ? "" : String(v).replace(/[\t\n\r]/g, " "); };
    var lines = [header.join(sep)];
    sortRows(current).forEach(function (r) {
      lines.push(header.map(function (h) { return esc(r[h]); }).join(sep));
    });
    var bom = sep === "," ? "\uFEFF" : "";   // lets Excel detect UTF-8
    var blob = new Blob([bom + lines.join("\r\n") + "\r\n"], { type: sep === "," ? "text/csv;charset=utf-8" : "text/tab-separated-values;charset=utf-8" });
    var name = "cturkey_v1" + (activeCount() ? "_filtered" : "") + (sep === "," ? ".csv" : ".tsv");
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // ---------- orchestration ----------
  function changed() {
    state.page = 0;
    update();
    writeUrl();
  }

  function update() {
    current = rows.filter(function (r) { return passes(r); });
    var noAge = rows.filter(function (r) { return passes(r, "age"); });
    var sites = new Set(current.map(function (r) { return r.site; })).size;
    var gen = current.filter(function (r) { return r.dna_status === GENOMIC; }).length;
    $("summary").textContent = (current.length === rows.length ? "All " : nf.format(current.length) + " of ") +
      nf.format(rows.length) + " dates from " + nf.format(sites) + (sites === 1 ? " site" : " sites") +
      ", " + nf.format(gen) + " with genomic data.";
    ["dl_csv", "dl_tsv"].forEach(function (id) { $(id).disabled = !current.length; });
    $("dl_csv").textContent = "Download CSV (" + nf.format(current.length) + ")";
    updateFacetCounts();
    renderChips();
    renderHistogram(noAge);
    renderMap(current);
    renderTable();
  }

  function clearAll() {
    state.q = ""; $("search").value = "";
    state.ageMin = state.ageMax = null; $("age_min").value = ""; $("age_max").value = "";
    FACETS.forEach(function (f) { state.facets[f.key].clear(); syncFacetChecks(f.key); });
    changed();
  }

  function wire() {
    $("search").addEventListener("input", debounce(function () { state.q = fold(this.value.trim()); changed(); }, 150));
    var ageInput = debounce(function () {
      var a = $("age_min").value.trim(), b = $("age_max").value.trim();
      state.ageMin = a === "" || !isFinite(+a) ? null : +a;
      state.ageMax = b === "" || !isFinite(+b) ? null : +b;
      changed();
    }, 300);
    $("age_min").addEventListener("input", ageInput);
    $("age_max").addEventListener("input", ageInput);
    $("clear_all").addEventListener("click", clearAll);
    $("prev").addEventListener("click", function () { state.page--; renderTable(); $("table_top").scrollIntoView({ block: "nearest" }); });
    $("next").addEventListener("click", function () { state.page++; renderTable(); $("table_top").scrollIntoView({ block: "nearest" }); });
    $("page_size").addEventListener("change", function () { state.pageSize = +this.value; state.page = 0; renderTable(); });
    $("dl_csv").addEventListener("click", function () { exportRows(","); });
    $("dl_tsv").addEventListener("click", function () { exportRows("\t"); });
    $("fit_map").addEventListener("click", fitToResults);
    $("copy_link").addEventListener("click", function () {
      var btn = this;
      var link = location.href;
      (navigator.clipboard && location.protocol !== "file:" ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () {
        btn.textContent = "Link copied";
        setTimeout(function () { btn.textContent = "Copy link to this view"; }, 1600);
      }, function () { window.prompt("Copy this link:", link); });
    });
  }

  // ---------- start ----------
  loadData().then(function (data) {
    rows = data;
    histMax = Math.ceil(Math.max.apply(null, rows.map(function (r) { return r.c14age; })) / 1000) * 1000;
    buildFacets();
    buildTableHead();
    readUrl();
    FACETS.forEach(function (f) { syncFacetChecks(f.key); });
    $("age_min").value = state.ageMin == null ? "" : state.ageMin;
    $("age_max").value = state.ageMax == null ? "" : state.ageMax;
    if (window.matchMedia && matchMedia("(max-width: 980px)").matches) $("facet_box").open = false;
    initMap();
    wire();
    document.body.classList.remove("loading");
    update();
  }).catch(function (e) {
    console.error(e);
    $("summary").textContent = "The dataset could not be loaded. If you opened this page from your computer, make sure the explorer folder sits next to index.html, or regenerate explorer/data.js with scripts/build_explorer_data.R.";
    document.body.classList.remove("loading");
    document.body.classList.add("failed");
  });
})();
