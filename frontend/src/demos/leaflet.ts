import 'leaflet/dist/leaflet.css'
import '../style.css'
import L from 'leaflet'
import { CENTER, OSM_ATTRIBUTION, OSM_TILE_URL, STATIONS } from '../stations'

const map = L.map('map').setView([CENTER.lat, CENTER.lon], 8)

L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map)

// ใช้ circleMarker แทน marker ปกติ เพราะ default icon ของ Leaflet
// หา path รูปไม่เจอเมื่อผ่าน bundler
for (const s of STATIONS) {
  L.circleMarker([s.lat, s.lon], {
    radius: 7,
    color: '#0d3b66',
    weight: 2,
    fillColor: '#f95738',
    fillOpacity: 0.9,
  })
    .addTo(map)
    .bindPopup(`<strong>${s.name}</strong><br>${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`)

  // กรอบเฉลี่ยเชิงพื้นที่ ±0.25°
  L.rectangle(
    [
      [s.lat - 0.25, s.lon - 0.25],
      [s.lat + 0.25, s.lon + 0.25],
    ],
    { color: '#0d3b66', weight: 1, fillOpacity: 0.05, dashArray: '4 3' },
  ).addTo(map)
}
