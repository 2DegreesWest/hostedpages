/**
 * Travel Diary – map, sunburst, and rank views.
 * Data: data/traveldestinations.json, data/TravelDiary_Info.xlsx
 */

const DATA = {
  geojsonUrl: "data/traveldestinations.json",
  spreadsheetUrl: "data/TravelDiary_Info.xlsx",
  photosDir: "photos/",
};

const TYPE_STYLE = {
  City: { icon: "fa-city", color: "#d3d3d3" },
  Snowboarding: { icon: "fa-person-snowboarding", color: "#ffffff" },
  Rural: { icon: "fa-mountain-sun", color: "#90ee90" },
  Explore: { icon: "fa-van-shuttle", color: "#071E6E" },
  MapAction: { icon: "fa-globe", color: "#add8e6" },
  Lived: { icon: "fa-house", color: "#ff0000" },
  Relax: { icon: "fa-umbrella-beach", color: "#ffff00" },
  Stadium: { icon: "fa-futbol", color: "#ffa500" },
};

const CONTINENT_COLORS = {
  Africa: "rgb(0, 38, 99)",
  Asia: "rgb(0, 185, 228)",
  "Central America": "#B6E880",
  Europe: "rgb(242, 140, 0)",
  "North America": "rgb(255, 210, 0)",
  Oceania: "rgb(221, 35, 48)",
  Oceana: "rgb(221, 35, 48)",
  "South America": "rgb(158, 27, 50)",
};

const BASEMAPS = {
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    },
  },
  light: {
    label: "Light",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    },
  },
  aerial: {
    label: "Aerial",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19,
    },
  },
};

const PHOTO_DIRS = ["photos/", "photo/"];
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

const state = {
  map: null,
  basemapLayer: null,
  layerGroups: {},
  geojson: null,
  sunburstRows: [],
  rankRows: [],
  activeView: "map",
  photoManifest: {},
};

function isValidPhotoValue(value) {
  if (value == null) return false;
  const s = String(value).trim();
  return s !== "" && s.toLowerCase() !== "null";
}

function photoBasename(value) {
  const name = String(value).trim().replace(/\\/g, "/");
  return name.includes("/") ? name.split("/").pop() : name;
}

function pathsForFilename(filename) {
  const base = photoBasename(filename);
  if (!base) return [];
  const hasExt = /\.[a-z0-9]+$/i.test(base);
  const names = hasExt ? [base] : PHOTO_EXTENSIONS.map((ext) => base + ext);
  const paths = [];
  for (const dir of PHOTO_DIRS) {
    for (const name of names) {
      paths.push(dir + name);
    }
  }
  return paths;
}

function getPhotoCandidates(props) {
  const seen = new Set();
  const add = (filename) => {
    for (const path of pathsForFilename(filename)) {
      if (!seen.has(path)) {
        seen.add(path);
      }
    }
  };

  if (isValidPhotoValue(props.Photo)) add(props.Photo);

  const oid = props.OBJECTID ?? props.objectid;
  if (oid != null && state.photoManifest[String(oid)]) {
    add(state.photoManifest[String(oid)]);
  }

  if (props.Country && state.photoManifest[props.Country]) {
    add(state.photoManifest[props.Country]);
  }

  if (oid != null) add(String(oid));
  if (isValidPhotoValue(props.Country)) add(props.Country);
  if (isValidPhotoValue(props.Name)) add(props.Name);

  return [...seen];
}

async function loadPhotoManifest() {
  for (const dir of PHOTO_DIRS) {
    try {
      const res = await fetch(dir + "manifest.json");
      if (!res.ok) continue;
      const data = await res.json();
      Object.assign(state.photoManifest, data);
      return;
    } catch {
      /* try next folder */
    }
  }
}

window.tryNextPopupPhoto = function tryNextPopupPhoto(img) {
  const list = JSON.parse(img.getAttribute("data-photo-list") || "[]");
  let idx = Number(img.dataset.photoIdx || 0) + 1;
  if (idx < list.length) {
    img.dataset.photoIdx = String(idx);
    img.src = list[idx];
  } else {
    img.remove();
  }
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  if (text == null || text === "") return "";
  const d = document.createElement("div");
  d.textContent = String(text);
  return d.innerHTML;
}

function normalizeKey(row, ...names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const found = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (found) return row[found];
  }
  return undefined;
}

function sheetToRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function fetchData(url) {
  const cacheBust = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  return fetch(cacheBust, { cache: "no-store" });
}

async function loadWorkbook() {
  const res = await fetchData(DATA.spreadsheetUrl);
  if (!res.ok) throw new Error(`Could not load spreadsheet (${res.status})`);
  const buf = await res.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

async function loadGeoJSON() {
  const res = await fetchData(DATA.geojsonUrl);
  if (!res.ok) throw new Error(`Could not load GeoJSON (${res.status})`);
  return res.json();
}

/** Read a property from GeoJSON, supporting renamed export fields. */
function prop(props, ...names) {
  for (const name of names) {
    const val = props[name];
    if (val != null && val !== "" && String(val).toLowerCase() !== "null") {
      return val;
    }
  }
  return null;
}

function createMarkerIcon(type) {
  const style = TYPE_STYLE[type] || { icon: "fa-location-dot", color: "#cccccc" };
  return L.divIcon({
    className: "",
    html: `<div class="marker-icon-wrap"><i class="fas fa-solid ${style.icon}" style="color:${style.color}"></i></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
  });
}

function buildPopupHtml(props) {
  const lines = [];
  const add = (label, val) => {
    if (val != null && val !== "" && String(val).toLowerCase() !== "null") {
      lines.push(`<b>${label}:</b> ${escapeHtml(val)}`);
    }
  };
  add("Country", props.Country);
  add("Location", props.Location);
  add("Name", prop(props, "Feature", "Name"));
  add("Type", props.Type);
  add("Date", props.Date);
  add("Notes", prop(props, "FeatureHighlights", "Notes"));
  add("Trip highlights", props.TripHighlights);
  if (props.Score != null && props.Score !== "") add("Score", props.Score);
  

  const photoCandidates = getPhotoCandidates(props);
  let photoHtml = "";
  if (photoCandidates.length) {
    const listAttr = JSON.stringify(photoCandidates).replace(/'/g, "&#39;");
    photoHtml = `<img class="popup-photo" src="${escapeHtml(photoCandidates[0])}" data-photo-idx="0" data-photo-list='${listAttr}' alt="" loading="lazy" onerror="tryNextPopupPhoto(this)">`;
  }

  return photoHtml + lines.join("<br>");
}

function initMap(geojson) {
  state.geojson = geojson;

  state.map = L.map("map", {
    center: [28.88, -3.41],
    zoom: 2,
    zoomControl: false,
    scrollWheelZoom: true,
    touchZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    keyboard: true,
    preferCanvas: true,
  });

  L.control.zoom({ position: "topright" }).addTo(state.map);

  setBasemap("dark");

  const types = [...new Set(geojson.features.map((f) => f.properties.Type).filter(Boolean))].sort();

  types.forEach((type) => {
    const group = L.layerGroup();
    state.layerGroups[type] = group;
    state.map.addLayer(group);
  });

  geojson.features.forEach((feature) => {
    const props = feature.properties || {};
    const type = props.Type || "Other";
    if (!state.layerGroups[type]) {
      state.layerGroups[type] = L.layerGroup();
      state.map.addLayer(state.layerGroups[type]);
    }

    const [lng, lat] = feature.geometry.coordinates;
    const marker = L.marker([lat, lng], { icon: createMarkerIcon(type) });
    marker.bindPopup(buildPopupHtml(props), { maxWidth: 320 });
    state.layerGroups[type].addLayer(marker);
  });

  if (geojson.features.length) {
    const bounds = L.geoJSON(geojson).getBounds();
    if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
  }

  buildLegend(types);
  buildBasemapControl();

  if (window.matchMedia("(max-width: 640px)").matches) {
    const legendDetails = document.querySelector(".legend-panel .panel-details");
    if (legendDetails) legendDetails.removeAttribute("open");
  }
}

function setBasemap(key) {
  const cfg = BASEMAPS[key];
  if (!cfg || !state.map) return;
  if (state.basemapLayer) state.map.removeLayer(state.basemapLayer);
  state.basemapLayer = L.tileLayer(cfg.url, cfg.options).addTo(state.map);
}

function buildBasemapControl() {
  const container = $("basemap-options");
  container.innerHTML = "";
  Object.entries(BASEMAPS).forEach(([key, cfg], i) => {
    const id = `basemap-${key}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.innerHTML = `<input type="radio" name="basemap" id="${id}" value="${key}" ${i === 0 ? "checked" : ""}> ${cfg.label}`;
    label.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) setBasemap(key);
    });
    container.appendChild(label);
  });
}

function buildLegend(types) {
  const container = $("legend-items");
  container.innerHTML = "";

  types.forEach((type) => {
    const style = TYPE_STYLE[type] || { icon: "fa-location-dot", color: "#ccc" };
    const item = document.createElement("label");
    item.className = "legend-item";
    item.innerHTML = `
      <input type="checkbox" checked data-type="${escapeHtml(type)}">
      <span class="legend-icon"><i class="fas fa-solid ${style.icon}" style="color:${style.color}"></i></span>
      <span>${escapeHtml(type)}</span>
    `;
    const checkbox = item.querySelector("input");
    checkbox.addEventListener("change", () => {
      const group = state.layerGroups[type];
      if (!group || !state.map) return;
      if (checkbox.checked) state.map.addLayer(group);
      else state.map.removeLayer(group);
    });
    container.appendChild(item);
  });
}

function buildSunburstData(rows) {
  const rootId = "root";
  const ids = [rootId];
  const labels = [""];
  const parents = [""];
  const values = [0];
  const colors = ["#FF6692"];
  const customdata = [""];

  rows.forEach((row) => {
    const continent = normalizeKey(row, "Continent");
    const country = normalizeKey(row, "Country");
    const visits = Number(normalizeKey(row, "Total Visits", "TotalVisits")) || 0;
    const feature = normalizeKey(row, "Feature") || "";
    if (!continent || !country) return;

    const contId = `${rootId}/${continent}`;
    if (!ids.includes(contId)) {
      ids.push(contId);
      labels.push(continent);
      parents.push(rootId);
      values.push(0);
      colors.push(CONTINENT_COLORS[continent] || "#888888");
      customdata.push("");
    }

    const countryId = `${contId}/${country}`;
    if (!ids.includes(countryId)) {
      ids.push(countryId);
      labels.push(country);
      parents.push(contId);
      values.push(Math.max(visits, 0.1));
      colors.push(CONTINENT_COLORS[continent] || "#888888");
      customdata.push(feature);
    } else {
      const idx = ids.indexOf(countryId);
      values[idx] += visits;
    }
  });

  const countryCount = ids.filter((id) => id.split("/").length === 3).length;

  ids.forEach((id, i) => {
    if (id === rootId || id.split("/").length !== 2) return;
    const childSum = ids.reduce((sum, cid, j) => {
      if (parents[j] === id && cid.split("/").length === 3) return sum + values[j];
      return sum;
    }, 0);
    values[i] = childSum;
  });

  const totalVisits = ids.reduce((sum, id, i) => {
    if (id.split("/").length === 3) return sum + values[i];
    return sum;
  }, 0);

  values[0] = totalVisits || countryCount;
  labels[0] = `${countryCount} countries`;

  return { ids, labels, parents, values, colors, customdata, countryCount };
}

function renderSunburst() {
  const el = $("sunburst-chart");
  if (!el) return;

  if (!state.sunburstRows.length) {
    el.innerHTML =
      "<p style='padding:1rem;color:#9aa8bc'>No Sunburst sheet data found.</p>";
    return;
  }

  const { ids, labels, parents, values, colors, customdata, countryCount } =
    buildSunburstData(state.sunburstRows);

  if (ids.length < 2) {
    el.innerHTML =
      "<p style='padding:1rem;color:#9aa8bc'>Not enough Sunburst data to chart.</p>";
    return;
  }

  const trace = {
    type: "sunburst",
    ids,
    labels,
    parents,
    values,
    branchvalues: "total",
    marker: { colors },
    customdata,
    textinfo: "label+value",
    insidetextorientation: "radial",
    hovertemplate:
      "%{label}<br>Visits: %{value}<br>%{customdata}<extra></extra>",
    hoverlabel: { align: "left" },
  };

  const layout = {
    margin: { l: 8, r: 8, t: 48, b: 8 },
    paper_bgcolor: "#1a2332",
    plot_bgcolor: "#1a2332",
    font: { color: "#e8eef5", size: 12 },
    title: {
      text: `My travel destinations (${countryCount} countries)`,
      font: { size: 16, color: "#e8eef5" },
    },
    autosize: true,
  };

  const config = { responsive: true, displayModeBar: false };
  const drawn =
    el.data && el.data.length > 0
      ? Plotly.react(el, [trace], layout, config)
      : Plotly.newPlot(el, [trace], layout, config);

  const resize = () => Plotly.Plots.resize(el);
  if (drawn && typeof drawn.then === "function") drawn.then(resize);
  else setTimeout(resize, 50);
}

function renderRankList(filterType) {
  const container = $("rank-list");
  let rows = state.rankRows.filter((r) => {
    const score = Number(normalizeKey(r, "Score", "Rank"));
    return !Number.isNaN(score);
  });

  if (filterType && filterType !== "all") {
    rows = rows.filter((r) => normalizeKey(r, "Type") === filterType);
  }

  rows.sort(
    (a, b) =>
      Number(normalizeKey(b, "Score", "Rank")) - Number(normalizeKey(a, "Score", "Rank"))
  );

  if (!rows.length) {
    container.innerHTML =
      "<p style='padding:1rem;color:#9aa8bc'>No ranked trips with scores found.</p>";
    return;
  }

  container.innerHTML = rows
    .map((row, i) => {
      const country = normalizeKey(row, "Country") || "—";
      const year = normalizeKey(row, "Year") || "";
      const score = normalizeKey(row, "Score");
      const highlights = normalizeKey(row, "Trip Highlights", "TripHighlights") || "";
      const type = normalizeKey(row, "Type") || "";
      return `
        <article class="rank-card">
          <div class="rank-num">${i + 1}</div>
          <div>
            <div class="rank-head">
              <span class="rank-country">${escapeHtml(country)}</span>
              ${type ? `<span class="rank-type">${escapeHtml(type)}</span>` : ""}
            </div>
            <div class="rank-meta">${year ? `Year: ${escapeHtml(year)}` : ""}</div>
          </div>
          <div class="rank-score">${escapeHtml(score)}/10</div>
          ${highlights ? `<p class="rank-highlights">${escapeHtml(highlights)}</p>` : ""}
        </article>
      `;
    })
    .join("");
}

function buildRankFilter() {
  const select = $("rank-type-filter");
  const types = [
    ...new Set(state.rankRows.map((r) => normalizeKey(r, "Type")).filter(Boolean)),
  ].sort();
  select.innerHTML = '<option value="all">All types</option>';
  types.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });
  select.onchange = () => renderRankList(select.value);
}

function switchView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));

  const viewEl = document.getElementById(`view-${viewId}`);
  const navEl = document.getElementById(`nav-${viewId}`);
  if (viewEl) viewEl.classList.add("active");
  if (navEl) navEl.classList.add("active");

  if (viewId === "map" && state.map) {
    requestAnimationFrame(() => {
      state.map.invalidateSize();
      if (state.map.scrollWheelZoom && state.map.scrollWheelZoom.enable) {
        state.map.scrollWheelZoom.enable();
      }
    });
  }
  if (viewId === "sunburst") {
    requestAnimationFrame(() => {
      requestAnimationFrame(renderSunburst);
    });
  }
  if (viewId === "rank") {
    renderRankList($("rank-type-filter").value || "all");
  }
}

function showError(message) {
  const overlay = $("loading-overlay");
  overlay.classList.remove("hidden");
  overlay.querySelector("p").innerHTML = escapeHtml(message);
  overlay.querySelector(".spinner").style.display = "none";
}

async function init() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  try {
    const [geojson, workbook] = await Promise.all([
      loadGeoJSON(),
      loadWorkbook(),
      loadPhotoManifest(),
    ]);

    state.sunburstRows = sheetToRows(workbook, "Sunburst").filter((row) => {
      const continent = normalizeKey(row, "Continent");
      return continent && String(continent).toLowerCase() !== "continent";
    });
    state.rankRows = sheetToRows(workbook, "Rank").filter((row) => {
      const country = normalizeKey(row, "Country");
      return country && String(country).toLowerCase() !== "country";
    });

    console.info(`Travel Diary: loaded ${geojson.features.length} map locations`);

    initMap(geojson);
    buildRankFilter();
    renderRankList("all");

    $("loading-overlay").classList.add("hidden");

    window.addEventListener("resize", () => {
      if (state.map) state.map.invalidateSize();
      const chart = $("sunburst-chart");
      if (chart && chart.querySelector(".plotly") && state.activeView === "sunburst") {
        Plotly.Plots.resize(chart);
      }
    });
  } catch (err) {
    console.error(err);
    showError(
      `${err.message}<br><br>Open this site via a local web server (not as a file:// URL). For example, in this folder run: <code>python -m http.server 8080</code> then visit <code>http://localhost:8080</code>`
    );
  }
}

document.addEventListener("DOMContentLoaded", init);
