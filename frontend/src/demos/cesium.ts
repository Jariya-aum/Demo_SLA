import 'cesium/Build/Cesium/Widgets/widgets.css'
import '../style.css'
import {
  Cartesian3,
  Color,
  Ion,
  OpenStreetMapImageryProvider,
  Viewer,
} from 'cesium'
import { CENTER, STATIONS } from '../stations'

// ใช้ OSM เป็น imagery จึงไม่ต้องใช้ Cesium ion access token
Ion.defaultAccessToken = ''

const viewer = new Viewer('map', {
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  timeline: false,
  animation: false,
  infoBox: true,
  selectionIndicator: true,
})

viewer.imageryLayers.addImageryProvider(
  new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }),
)

for (const s of STATIONS) {
  viewer.entities.add({
    name: s.name,
    position: Cartesian3.fromDegrees(s.lon, s.lat),
    point: {
      pixelSize: 12,
      color: Color.fromCssColorString('#f95738'),
      outlineColor: Color.fromCssColorString('#0d3b66'),
      outlineWidth: 2,
    },
    label: {
      text: s.name,
      font: '13px sans-serif',
      pixelOffset: new Cartesian3(0, -22, 0),
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      style: 2, // FILL_AND_OUTLINE
    },
    description: `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`,
  })
}

viewer.camera.flyTo({
  destination: Cartesian3.fromDegrees(CENTER.lon, CENTER.lat - 1.2, 320_000),
  duration: 0,
})
