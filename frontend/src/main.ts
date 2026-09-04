import './style.css'
import { STATIONS } from './stations'

type Demo = { href: string; name: string; version: string; note: string }

// BASE_URL = '/' ตอนเสิร์ฟด้วย FastAPI และ '/Demo_SLA/' บน GitHub Pages
const base = import.meta.env.BASE_URL

const DEMOS: Demo[] = [
  {
    href: `${base}leaflet.html`,
    name: 'Leaflet',
    version: 'v1.9.4',
    note: 'แผนที่ 2 มิติ raster tile ขนาดเล็กและเบาที่สุด เหมาะกับงานที่ต้องการแค่หมุดและ popup',
  },
  {
    href: `${base}maplibre.html`,
    name: 'MapLibre GL JS',
    version: 'v6.7.0',
    note: 'เรนเดอร์ด้วย WebGL รองรับ vector tile หมุนและเอียงมุมกล้องได้ เหมาะกับ layer เชิงข้อมูล',
  },
  {
    href: `${base}cesium.html`,
    name: 'CesiumJS',
    version: 'v1.145.0',
    note: 'ลูกโลก 3 มิติเต็มรูปแบบ รองรับ terrain และเวลา เหมาะกับการแสดงระดับน้ำเชิงพื้นที่',
  },
]

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header>
    <h1>SLA Dashboard</h1>
    <p>
      พยากรณ์ค่าความผิดปกติของระดับน้ำทะเลรายเดือน — อ่าวไทยตอนบน
      (${STATIONS.length} สถานี)
    </p>
  </header>

  <h2 style="font-size:1rem;margin:0 0 0.75rem;">ตัวอย่าง Web Map API</h2>
  <ul class="demos">
    ${DEMOS.map(
      (d) => `
      <li>
        <a href="${d.href}">
          <h2>${d.name} <span class="ver">${d.version}</span></h2>
          <p>${d.note}</p>
        </a>
      </li>`,
    ).join('')}
  </ul>
`
