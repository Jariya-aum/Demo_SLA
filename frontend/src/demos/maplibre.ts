import 'maplibre-gl/dist/maplibre-gl.css'
import '../style.css'
import {
  Map as MaplibreMap,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  type StyleSpecification,
} from 'maplibre-gl'
import { CENTER, OSM_ATTRIBUTION, OSM_TILE_URL, STATIONS } from '../stations'
import { ALL_CODE, PROVINCES, STUDY_AREA_BBOX, findProvince } from '../provinces'

// style แบบ raster จาก OSM — ไม่ต้องใช้ API key
const style: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [OSM_TILE_URL],
      tileSize: 256,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

const map = new MaplibreMap({
  container: 'map',
  style,
  center: [CENTER.lon, CENTER.lat],
  zoom: 7,
})

map.addControl(new NavigationControl(), 'top-right')
map.addControl(new ScaleControl())

for (const s of STATIONS) {
  new Marker({ color: '#f95738' })
    .setLngLat([s.lon, s.lat])
    .setPopup(
      new Popup({ offset: 24 }).setHTML(
        `<strong>${s.name}</strong><br>${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`,
      ),
    )
    .addTo(map)
}

// กรอบเฉลี่ยเชิงพื้นที่ ±0.25° เป็น GeoJSON layer
map.on('load', () => {
  map.addSource('boxes', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: STATIONS.map((s) => ({
        type: 'Feature' as const,
        properties: { name: s.name },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [s.lon - 0.25, s.lat - 0.25],
              [s.lon + 0.25, s.lat - 0.25],
              [s.lon + 0.25, s.lat + 0.25],
              [s.lon - 0.25, s.lat + 0.25],
              [s.lon - 0.25, s.lat - 0.25],
            ],
          ],
        },
      })),
    },
  })
  map.addLayer({
    id: 'boxes-fill',
    type: 'fill',
    source: 'boxes',
    paint: { 'fill-color': '#0d3b66', 'fill-opacity': 0.08 },
  })
  map.addLayer({
    id: 'boxes-line',
    type: 'line',
    source: 'boxes',
    paint: { 'line-color': '#0d3b66', 'line-width': 1, 'line-dasharray': [3, 2] },
  })
})

// ---------- dropdown เลือกจังหวัดเพื่อ zoom ----------

const select = document.querySelector<HTMLSelectElement>('#province')!

// ใช้ `code` (ISO 3166-2:TH) เป็น key ของ option แทนชื่อจังหวัด
// เพราะเป็น ASCII สั้น ไม่ซ้ำ ไม่มีปัญหาเรื่อง encoding และผูกกับ
// รหัสมาตรฐานที่ join กับตารางใน BigQuery ได้ตรง ๆ ในภายหลัง
select.innerHTML = [
  `<option value="${ALL_CODE}">ทั้งพื้นที่ศึกษา</option>`,
  ...PROVINCES.map(
    (p) => `<option value="${p.code}">${p.nameTh} (${p.nameEn})</option>`,
  ),
].join('')

function zoomTo(code: string) {
  const bounds = code === ALL_CODE ? STUDY_AREA_BBOX : findProvince(code)?.bbox
  if (!bounds) return
  map.fitBounds(bounds, { padding: 48, duration: 900 })
}

select.addEventListener('change', () => zoomTo(select.value))
