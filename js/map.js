/* ==========================================================================
   map.js — แผนที่เว็บ (Leaflet)

   ชั้นข้อมูล
     - Base map      : OpenStreetMap (ค่าตั้งต้น) / ภาพถ่ายดาวเทียม / แผนที่ทะเล
     - Study Box     : กล่อง ±BUFFER° รอบสถานี ตามค่าที่ใช้จริงในงานวิจัย
     - สถานี         : หมุดหมายเลข 1–4 พร้อม popup รายละเอียด
     - GEE overlay   : ภาพที่ export จาก Google Earth Engine
                       (อ่านรายการจาก assets/gee/manifest.json ถ้ามี)

   ไม่มีการเรียก Google Earth Engine โดยตรงจากหน้าเว็บ จึงไม่ต้องใช้ API key
   ========================================================================== */

const SLAMap = (() => {
  'use strict';

  let map = null;
  let markers = {};
  let boxes = {};
  let layerControl = null;
  let onSelect = () => {};
  let initialBounds = null;
  let needsFit = true;

  const BASEMAPS = {
    'OpenStreetMap': () => L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ),
    'ภาพถ่ายดาวเทียม (Esri World Imagery)': () => L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      }
    ),
    'แผนที่ภูมิประเทศ (OpenTopoMap)': () => L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 17,
        attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      }
    ),
  };

  function markerIcon(index, selected) {
    return L.divIcon({
      className: '',
      html: `<div class="station-marker${selected ? ' is-selected' : ''}">${index}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });
  }

  function fmt(value, digits, suffix = '') {
    return value === null || value === undefined || Number.isNaN(value)
      ? 'N/A'
      : `${value >= 0 && suffix === ' mm/ปี' ? '+' : ''}${Number(value).toFixed(digits)}${suffix}`;
  }

  function popupHTML(s) {
    return `
      <div class="popup__title">${s.index}. ${s.station}</div>
      <div class="popup__sub">${s.station_th}</div>
      <dl class="popup__rows">
        <dt>ละติจูด</dt><dd>${s.lat.toFixed(6)}° N</dd>
        <dt>ลองจิจูด</dt><dd>${s.lon.toFixed(6)}° E</dd>
        <dt>Study box</dt><dd>±${s.buffer_deg}°</dd>
        <dt>SLA ล่าสุด</dt><dd>${fmt(s.sla_last_m, 4, ' m')} (${s.sla_last_date})</dd>
        <dt>แนวโน้ม</dt><dd>${fmt(s.trend_mm_per_year, 2, ' mm/ปี')}</dd>
        <dt>Best model</dt><dd>${s.best_model} · RMSE ${fmt(s.best_model_rmse_m, 4, ' m')}</dd>
      </dl>
      <button class="popup__btn" type="button" data-station="${s.station}">
        ดูการวิเคราะห์ SLA ของสถานีนี้
      </button>`;
  }

  /** โหลดรายการภาพ GEE ที่ export ไว้ (ถ้ายังไม่มีไฟล์ ก็ข้ามไปเงียบ ๆ) */
  async function loadGeeOverlays() {
    try {
      const res = await fetch('assets/gee/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return [];
      const manifest = await res.json();
      return (manifest.overlays || []).map((item) => {
        const layer = item.type === 'tiles'
          ? L.tileLayer(item.url, {
              maxZoom: item.maxZoom || 18,
              opacity: item.opacity ?? 0.85,
              attribution: item.attribution || 'Google Earth Engine',
            })
          : L.imageOverlay(item.url, item.bounds, {
              opacity: item.opacity ?? 0.85,
              attribution: item.attribution || 'Google Earth Engine',
            });
        return { name: item.name, layer };
      });
    } catch (err) {
      return [];
    }
  }

  async function init(containerId, options) {
    const stations = SLAData.state.stations;
    const studyBoxes = SLAData.state.studyBoxes;
    onSelect = options.onSelect || (() => {});

    map = L.map(containerId, { zoomControl: true, scrollWheelZoom: false });
    L.control.scale({ imperial: false }).addTo(map);

    const baseLayers = {};
    let first = true;
    for (const [name, make] of Object.entries(BASEMAPS)) {
      const layer = make();
      baseLayers[name] = layer;
      if (first) { layer.addTo(map); first = false; }
    }

    // ---- Study boxes ------------------------------------------------------
    const boxGroup = L.layerGroup();
    for (const box of studyBoxes) {
      const rect = L.rectangle(box.bounds, {
        color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        weight: 1.4,
        fillOpacity: 0.07,
        dashArray: '4 3',
        interactive: false,
      });
      rect.addTo(boxGroup);
      boxes[box.station] = rect;
    }
    boxGroup.addTo(map);

    // ---- Station markers --------------------------------------------------
    const markerGroup = L.layerGroup();
    for (const s of stations) {
      const marker = L.marker([s.lat, s.lon], {
        icon: markerIcon(s.index, false),
        title: `${s.index}. ${s.station}`,
        alt: `สถานี ${s.index} ${s.station}`,
        keyboard: true,
      });
      marker.bindPopup(popupHTML(s), { maxWidth: 320 });
      marker.on('click', () => onSelect(s.station, { fly: false }));
      marker.addTo(markerGroup);
      markers[s.station] = marker;
    }
    markerGroup.addTo(map);

    const buffer = SLAData.state.meta.experiment.buffer_deg;
    const overlays = {
      [`สถานีศึกษา (${stations.length} จุด)`]: markerGroup,
      [`Study box (±${buffer}°)`]: boxGroup,
    };

    for (const { name, layer } of await loadGeeOverlays()) {
      overlays[name] = layer;
    }

    layerControl = L.control.layers(baseLayers, overlays, { collapsed: false }).addTo(map);

    // กรอบมุมมองเริ่มต้น = ขอบเขตรวมของ study box ทั้งหมด
    // ตอน init แผนที่ยังถูกซ่อนอยู่ (ขนาด 0) จึงต้อง fit ซ้ำใน invalidate()
    initialBounds = L.latLngBounds(studyBoxes.flatMap((b) => b.bounds));
    map.fitBounds(initialBounds, { padding: [28, 28] });

    // เลื่อนหน้าเว็บผ่านแผนที่ได้ตามปกติ จนกว่าผู้ใช้จะคลิกที่แผนที่เอง
    map.on('click', () => map.scrollWheelZoom.enable());
    map.on('mouseout', () => map.scrollWheelZoom.disable());

    // ปุ่มใน popup ส่งผู้ใช้ไปหน้า SLA Analysis ของสถานีนั้น
    map.on('popupopen', (e) => {
      const btn = e.popup.getElement().querySelector('.popup__btn');
      if (!btn) return;
      btn.addEventListener('click', () => {
        onSelect(btn.dataset.station, { fly: false });
        window.location.hash = '#/sla';
      }, { once: true });
    });

    return map;
  }

  /** เน้นหมุดของสถานีที่ถูกเลือกอยู่ */
  function setSelected(stationName, { fly = false } = {}) {
    for (const s of SLAData.state.stations) {
      const marker = markers[s.station];
      if (!marker) continue;
      marker.setIcon(markerIcon(s.index, s.station === stationName));
      const rect = boxes[s.station];
      if (rect) {
        rect.setStyle({
          weight: s.station === stationName ? 2.4 : 1.4,
          fillOpacity: s.station === stationName ? 0.14 : 0.07,
        });
      }
    }
    if (fly && map && markers[stationName]) {
      map.panTo(markers[stationName].getLatLng(), { animate: true });
    }
  }

  function invalidate() {
    if (!map) return;
    map.invalidateSize();
    if (needsFit && initialBounds) {
      map.fitBounds(initialBounds, { padding: [28, 28] });
      needsFit = false;
    }
  }

  return { init, setSelected, invalidate };
})();
